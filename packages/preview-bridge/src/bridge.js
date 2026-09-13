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
  var styleEl = null;
  var lastMove = 0;

  function send(msg) {
    try {
      window.parent.postMessage(msg, "*");
    } catch (_) {
      /* parent cerrado; nada que hacer */
    }
  }

  function ensureOverlayNodes() {
    if (hoverBox) return;
    hoverBox = document.createElement("div");
    hoverBox.setAttribute("data-steer-hover", "");
    hoverBox.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid " +
      OVERLAY_COLOR +
      ";display:none;margin:0;padding:0;background:transparent;";
    hoverLabel = document.createElement("div");
    hoverLabel.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483647;display:none;" +
      "font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "background:#0e0f11cc;color:#f2f3f5;padding:1px 5px;border-radius:4px;" +
      "white-space:nowrap;transform:translateY(-110%);";
    selectBox = document.createElement("div");
    selectBox.setAttribute("data-steer-select", "");
    selectBox.style.cssText = hoverBox.style.cssText;
    document.body.appendChild(hoverBox);
    document.body.appendChild(hoverLabel);
    document.body.appendChild(selectBox);
  }

  function boxFor(el) {
    var r = el.getBoundingClientRect();
    return {
      left: r.left + "px",
      top: r.top + "px",
      width: r.width + "px",
      height: r.height + "px",
    };
  }

  function place(box, el) {
    var r = boxFor(el);
    box.style.left = r.left;
    box.style.top = r.top;
    box.style.width = r.width;
    box.style.height = r.height;
    box.style.display = "block";
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

  function sourceLabel(loc) {
    return loc.file ? loc.file + ":" + loc.line : "";
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
    if (!el || el === hoverBox || el === hoverLabel || el === selectBox) return;
    ensureOverlayNodes();
    place(hoverBox, el);
    var loc = parseSource(el);
    var label = sourceLabel(loc);
    hoverLabel.textContent = label || "sin " + SOURCE_ATTR;
    var r = boxFor(el);
    hoverLabel.style.left = r.left;
    hoverLabel.style.top = r.top;
    hoverLabel.style.display = "block";
    send({ type: "steer:hover", selection: buildSelection(el) });
  }

  function onLeave() {
    if (hoverBox) hoverBox.style.display = "none";
    if (hoverLabel) hoverLabel.style.display = "none";
    send({ type: "steer:hover", selection: null });
  }

  function onClick(e) {
    if (!inspect) return;
    e.preventDefault();
    e.stopPropagation();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hoverBox || el === hoverLabel || el === selectBox) return;
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
    send({ type: "steer:select", id: selectedId, selection: buildSelection(el) });
  }

  function setInspect(on) {
    inspect = on;
    if (on) {
      ensureOverlayNodes();
      if (selectedEl) place(selectBox, selectedEl);
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

  function cssProp(camel) {
    return camel.replace(/[A-Z]/g, function (c) {
      return "-" + c.toLowerCase();
    });
  }

  // Navegación SPA: limpiar overrides y selección (UX §5.9).
  function notifyNavigate(href) {
    clearOverrides();
    selectedEl = null;
    selectedId = null;
    if (selectBox) selectBox.style.display = "none";
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
      default:
        break;
    }
  });

  send({ type: "steer:ready" });
})();
