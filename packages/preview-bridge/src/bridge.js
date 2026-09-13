// bridge.js — corre DENTRO del preview (iframe), inyectado por el proxy
// de Steer (TRD §6). Vanilla JS, sin build: lo sirve /__steer/bridge.js
// tal cual. Nunca toca el filesystem: el overlay es <style> efímero.
//
// Protocolo (TRD §6.1):
//   recibe: steer:inspect-on | steer:inspect-off | steer:set-overrides
//           steer:clear-overrides | steer:highlight
//   envía:  steer:ready | steer:hover | steer:select | steer:navigate
(function () {
  "use strict";
  if (window.parent === window) return; // no estamos en un iframe

  var TWEAK_PROPS = [
    "fontSize",
    "fontWeight",
    "color",
    "backgroundColor",
    "textAlign",
    "padding",
    "gap",
    "borderRadius",
    "opacity",
  ];

  var SOURCE_ATTR = "data-tsd-source";
  var OVERLAY_COLOR = "#5b8cff";

  var inspect = false;
  var selectedEl = null;
  var selectedId = null;
  var steerCounter = 0;

  var hoverBox = null;
  var hoverLabel = null;
  var selectBox = null;
  var selectLabel = null;
  var marginBox = null;
  var paddingBox = null;
  var inspectStyle = null;
  var styleEl = null;
  var lastMove = 0;

  function send(msg) {
    try {
      window.parent.postMessage(msg, "*");
    } catch (_) {
      /* parent cerrado; nada que hacer */
    }
  }

  // Estilo tipo herramienta de diseño (UX: "como Webflow"): crosshair
  // global mientras Inspect está ON.
  function setInspectCursor(on) {
    if (on) {
      if (!inspectStyle) {
        inspectStyle = document.createElement("style");
        inspectStyle.setAttribute("data-steer-cursor", "");
        inspectStyle.textContent =
          "[data-steer-inspecting] *{cursor:crosshair !important}";
      }
      document.documentElement.setAttribute("data-steer-inspecting", "");
      document.head.appendChild(inspectStyle);
    } else {
      document.documentElement.removeAttribute("data-steer-inspecting");
      if (inspectStyle) inspectStyle.remove();
    }
  }

  function ensureOverlayNodes() {
    if (hoverBox) return;
    function box(z) {
      var d = document.createElement("div");
      d.style.cssText =
        "position:absolute;pointer-events:none;z-index:" + z +
        ";margin:0;padding:0;";
      document.body.appendChild(d);
      return d;
    }
    // Espaciado estilo DevTools/Webflow: padding celeste, margin ámbar.
    paddingBox = box(2147483643);
    paddingBox.style.background = "rgba(147,197,253,0.35)";
    marginBox = box(2147483642);
    marginBox.style.background = "rgba(255,167,38,0.30)";
    hoverBox = box(2147483646);
    hoverBox.style.border = "2px solid " + OVERLAY_COLOR;
    hoverBox.style.display = "none";
    selectBox = box(2147483644);
    selectBox.style.border = "2px solid " + OVERLAY_COLOR;
    selectBox.style.display = "none";
    hoverLabel = makeLabel(2147483647);
    selectLabel = makeLabel(2147483645);
  }

  function makeLabel(z) {
    var d = document.createElement("div");
    d.style.cssText =
      "position:absolute;pointer-events:none;z-index:" + z + ";display:none;" +
      "font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "background:#0e0f11cc;color:#f2f3f5;padding:1px 6px;border-radius:4px;" +
      "white-space:nowrap;";
    document.body.appendChild(d);
    return d;
  }

  function labelFor(el) {
    var tag = (el.tagName || "").toLowerCase();
    var cls = "";
    try {
      if (el.classList && el.classList.length > 0) {
        cls = "." + el.classList[0];
      }
    } catch (_) {
      /* svg y amigos sin classList usable */
    }
    var r = el.getBoundingClientRect();
    return tag + cls + "  " + Math.round(r.width) + "×" + Math.round(r.height);
  }

  function placeLabel(label, el) {
    var r = el.getBoundingClientRect();
    var x = r.left + window.scrollX;
    var y = r.top + window.scrollY - 20;
    if (y - window.scrollY < 2) y = r.top + window.scrollY + 2;
    label.style.left = x + "px";
    label.style.top = y + "px";
    label.style.display = "block";
  }

  function rectsForSpacing(el) {
    var cs = window.getComputedStyle(el);
    var r = el.getBoundingClientRect();
    function px(name) {
      var n = parseFloat(cs[name]);
      return Number.isFinite(n) ? n : 0;
    }
    function border(name) {
      var m = /^(\d+(?:\.\d+)?)px/.exec(cs[name] || "");
      return m ? parseFloat(m[1]) : 0;
    }
    var mT = px("marginTop"), mR = px("marginRight");
    var mB = px("marginBottom"), mL = px("marginLeft");
    var bT = border("borderTopWidth"), bR = border("borderRightWidth");
    var bB = border("borderBottomWidth"), bL = border("borderLeftWidth");
    return {
      margin: {
        left: r.left + window.scrollX - mL,
        top: r.top + window.scrollY - mT,
        width: r.width + mL + mR,
        height: r.height + mT + mB,
      },
      padding: {
        left: r.left + window.scrollX + bL,
        top: r.top + window.scrollY + bT,
        width: r.width - bL - bR,
        height: r.height - bT - bB,
      },
    };
  }

  function placeSpacing(el) {
    ensureOverlayNodes();
    var s = rectsForSpacing(el);
    marginBox.style.left = s.margin.left + "px";
    marginBox.style.top = s.margin.top + "px";
    marginBox.style.width = s.margin.width + "px";
    marginBox.style.height = s.margin.height + "px";
    paddingBox.style.left = s.padding.left + "px";
    paddingBox.style.top = s.padding.top + "px";
    paddingBox.style.width = s.padding.width + "px";
    paddingBox.style.height = s.padding.height + "px";
    marginBox.style.display = "block";
    paddingBox.style.display = "block";
  }

  function hideSpacing() {
    if (marginBox) marginBox.style.display = "none";
    if (paddingBox) paddingBox.style.display = "none";
  }

  // "src/components/Hero.tsx:42:6" → {file, line, col}; faltante → file ""
  function parseSource(el) {
    var host = el && el.closest ? el.closest("[" + SOURCE_ATTR + "]") : null;
    if (!host) return { file: "", line: 0, col: 0 };
    var value = host.getAttribute(SOURCE_ATTR) || "";
    var m = /^(.+?):(\d+):(\d+)$/.exec(value.trim());
    if (!m) return { file: "", line: 0, col: 0 };
    return { file: m[1], line: parseInt(m[2], 10), col: parseInt(m[3], 10) };
  }

  function buildSelection(el) {
    var computed = window.getComputedStyle(el);
    var props = {};
    for (var i = 0; i < TWEAK_PROPS.length; i++) {
      props[TWEAK_PROPS[i]] = computed.getPropertyValue(
        TWEAK_PROPS[i].replace(/[A-Z]/g, function (c) {
          return "-" + c.toLowerCase();
        })
      );
    }
    var loc = parseSource(el);
    var tag = (el.tagName || "").toLowerCase();
    var component = null;
    var host = el.closest && el.closest("[" + SOURCE_ATTR + "]");
    if (host) {
      // Heurística: nombre del archivo como component name (P0).
      var base = loc.file.split("/").pop() || "";
      var dot = base.lastIndexOf(".");
      component = dot > 0 ? base.slice(0, dot) : null;
    }
    var breadcrumb = tag ? [component || tag, tag] : [];
    breadcrumb = breadcrumb.filter(function (v, ix, arr) {
      return arr.indexOf(v) === ix;
    });
    return {
      source: loc,
      component: component,
      route: location.pathname,
      tag: tag,
      textPreview: (el.textContent || "").trim().slice(0, 80),
      computed: props,
      breadcrumb: breadcrumb,
    };
  }

  function onMove(e) {
    if (!inspect) return;
    var now = Date.now();
    if (now - lastMove < 32) return; // TRD §13: throttle 32ms
    lastMove = now;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hoverBox || el === hoverLabel || el === selectBox || el === selectLabel) return;
    ensureOverlayNodes();
    place(hoverBox, el);
    placeLabel(hoverLabel, el);
    hoverLabel.textContent = labelFor(el);
    placeSpacing(el);
    send({ type: "steer:hover", selection: buildSelection(el) });
  }

  function onLeave() {
    if (hoverBox) hoverBox.style.display = "none";
    if (hoverLabel) hoverLabel.style.display = "none";
    hideSpacing();
    send({ type: "steer:hover", selection: null });
  }

  function onClick(e) {
    if (!inspect) return;
    e.preventDefault();
    e.stopPropagation();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hoverBox || el === hoverLabel || el === selectBox || el === selectLabel) return;
    selectedEl = el;
    if (!selectedEl.getAttribute("data-steer-id")) {
      steerCounter += 1;
      selectedId = "s" + steerCounter.toString(36);
      selectedEl.setAttribute("data-steer-id", selectedId);
    } else {
      selectedId = selectedEl.getAttribute("data-steer-id");
    }
    ensureOverlayNodes();
    place(selectBox, el);
    placeLabel(selectLabel, el);
    selectLabel.textContent = labelFor(el);
    placeSpacing(el);
    send({ type: "steer:select", id: selectedId, selection: buildSelection(el) });
  }

  function setInspect(on) {
    inspect = on;
    setInspectCursor(on);
    if (on) {
      ensureOverlayNodes();
      if (selectedEl) {
        place(selectBox, selectedEl);
        placeLabel(selectLabel, selectedEl);
        selectLabel.textContent = labelFor(selectedEl);
      }
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseleave", onLeave, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("mousedown", stopEvent, true);
      document.addEventListener("mouseup", stopEvent, true);
    } else {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseleave", onLeave, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mousedown", stopEvent, true);
      document.removeEventListener("mouseup", stopEvent, true);
      if (hoverBox) hoverBox.style.display = "none";
      if (hoverLabel) hoverLabel.style.display = "none";
      hideSpacing();
      send({ type: "steer:hover", selection: null });
    }
  }

  function stopEvent(e) {
    if (!inspect) return;
    e.preventDefault();
    e.stopPropagation();
  }

  // Overrides efímeros: un único <style data-steer-overlay> (TRD §6.2/§13).
  function setOverrides(overrides) {
    if (!Array.isArray(overrides)) return;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-steer-overlay", "");
      document.head.appendChild(styleEl);
    }
    var byId = {};
    for (var i = 0; i < overrides.length; i++) {
      var o = overrides[i];
      if (!o || !o.steerId || !o.prop) continue;
      (byId[o.steerId] = byId[o.steerId] || []).push(o);
    }
    var css = "";
    for (var id in byId) {
      if (!Object.prototype.hasOwnProperty.call(byId, id)) continue;
      // Scope component: target por data-tsd-source (todas las
      // instancias del componente); sin source, cae a data-steer-id.
      var first = byId[id][0];
      var selector =
        first &&
        first.scope === "component" &&
        first.source &&
        first.source.file
          ? '[data-tsd-source="' +
            first.source.file +
            ":" +
            first.source.line +
            ":" +
            first.source.col +
            '"]'
          : '[data-steer-id="' + id + '"]';
      css += selector + "{";
      var rules = byId[id];
      for (var j = 0; j < rules.length; j++) {
        css += cssProp(rules[j].prop) + ":" + rules[j].value + " !important;";
      }
      css += "}";
    }
    styleEl.textContent = css;
  }

  function clearOverrides() {
    if (styleEl) styleEl.textContent = "";
  }

  function highlight(source) {
    if (!source || !source.file) {
      if (selectBox && selectedEl) place(selectBox, selectedEl);
      return;
    }
    // P0: el highlight vive sobre la última selección local.
    if (selectBox && selectedEl) place(selectBox, selectedEl);
  }

  // ---- Pins (Fase E) — círculo 18px, número blanco, esquina sup-der
  // (UI.md §4). Solo visual: el Intent vive en la cola del parent.
  var pins = {}; // intentId → { steerId, badge }
  var PIN_SIZE = 18;
  var PIN_COLOR = "#ff8a4c";

  function positionPins() {
    for (var id in pins) {
      if (!Object.prototype.hasOwnProperty.call(pins, id)) continue;
      var pin = pins[id];
      var el = document.querySelector('[data-steer-id="' + pin.steerId + '"]');
      if (!el) {
        pin.badge.style.display = "none";
        continue;
      }
      var r = el.getBoundingClientRect();
      pin.badge.style.display = "flex";
      pin.badge.style.left =
        r.left + window.scrollX + r.width - PIN_SIZE / 2 + "px";
      pin.badge.style.top = r.top + window.scrollY - PIN_SIZE / 2 + "px";
    }
  }

  function addPin(intentId, steerId, number) {
    removePin(intentId);
    var badge = document.createElement("div");
    badge.setAttribute("data-steer-pin", intentId);
    badge.textContent = String(number);
    badge.style.cssText =
      "position:absolute;z-index:2147483645;width:" + PIN_SIZE + "px;height:" +
      PIN_SIZE + "px;align-items:center;justify-content:flex-start;" +
      "border-radius:9999px;background:" + PIN_COLOR + ";color:#fff;" +
      "font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "display:flex;box-shadow:0 1px 4px #0e0f1166;pointer-events:none;";
    document.body.appendChild(badge);
    pins[intentId] = { steerId: steerId, badge: badge };
    positionPins();
  }

  function removePin(intentId) {
    var pin = pins[intentId];
    if (pin) {
      pin.badge.remove();
      delete pins[intentId];
    }
  }

  function clearPins() {
    for (var id in pins) {
      if (Object.prototype.hasOwnProperty.call(pins, id)) removePin(id);
    }
  }

  window.addEventListener("scroll", positionPins, true);
  window.addEventListener("resize", positionPins);

  function cssProp(camel) {
    return camel.replace(/[A-Z]/g, function (c) {
      return "-" + c.toLowerCase();
    });
  }

  // Navegación SPA: limpiar overrides, pins y selección (UX §5.9).
  // SOLO si el pathname cambió: el router llama replaceState constantemente
  // (scroll restoration, sync) y eso NO es navegación — si notificáramos
  // siempre, el padre deseleccionaría justo después de cada click.
  var lastPath = location.pathname;
  function notifyNavigate(href) {
    if (href === lastPath) return;
    lastPath = href;
    clearOverrides();
    clearPins();
    selectedEl = null;
    selectedId = null;
    if (selectBox) selectBox.style.display = "none";
    if (selectLabel) selectLabel.style.display = "none";
    send({ type: "steer:navigate", href: href });
  }
  var pushState = history.pushState;
  history.pushState = function () {
    pushState.apply(this, arguments);
    notifyNavigate(location.pathname);
  };
  var replaceState = history.replaceState;
  history.replaceState = function () {
    replaceState.apply(this, arguments);
    notifyNavigate(location.pathname);
  };
  window.addEventListener("popstate", function () {
    notifyNavigate(location.pathname);
  });

  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return; // TRD §12
    var msg = e.data;
    if (!msg || typeof msg.type !== "string" || msg.type.indexOf("steer:") !== 0)
      return;
    switch (msg.type) {
      case "steer:inspect-on":
        setInspect(true);
        break;
      case "steer:inspect-off":
        setInspect(false);
        break;
      case "steer:set-overrides":
        setOverrides(msg.overrides);
        break;
      case "steer:clear-overrides":
        clearOverrides();
        break;
      case "steer:highlight":
        highlight(msg.source);
        break;
      case "steer:add-pin":
        addPin(msg.intentId, msg.steerId, msg.number);
        break;
      case "steer:remove-pin":
        removePin(msg.intentId);
        break;
      case "steer:clear-pins":
        clearPins();
        break;
      default:
        break;
    }
  });

  send({ type: "steer:ready" });
})();
