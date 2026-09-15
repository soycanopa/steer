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
    "lineHeight",
    "letterSpacing",
    "color",
    "backgroundColor",
    "textAlign",
    "width",
    "height",
    "padding",
    "margin",
    "gap",
    "flexDirection",
    "flexWrap",
    "justifyContent",
    "alignItems",
    "maxWidth",
    "objectFit",
    "fontStyle",
    "textDecoration",
    "borderRadius",
    "opacity",
  ];

  var SOURCE_ATTR = "data-tsd-source";
  var ACCENT = "#2b6bff"; // azul tipo Webflow, distinto del brand del proyecto (UX §9)
  var COMMENT_LINE = "#ff4d4d"; // outline delgado del modo comentarios

  var inspect = false;
  var commentMode = false;
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
    // Crosshair solo en Inspección. Comentarios usan el pointer normal.
    if (on && !commentMode) {
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

  function styleOverlayForMode() {
    if (!hoverBox || !selectBox) return;
    if (commentMode) {
      hoverBox.style.border = "1px solid " + COMMENT_LINE;
      hoverBox.style.background = "transparent";
      selectBox.style.border = "1px solid " + COMMENT_LINE;
      selectBox.style.background = "transparent";
    } else {
      hoverBox.style.border = "2px solid " + ACCENT;
      hoverBox.style.background = "rgba(43,107,255,0.08)";
      selectBox.style.border = "2px solid " + ACCENT;
      selectBox.style.background = "transparent";
    }
  }

  function ensureOverlayNodes() {
    if (hoverBox) return;
    function box(z) {
      var d = document.createElement("div");
      d.setAttribute("data-steer-overlay", "");
      d.style.cssText =
        "position:absolute;pointer-events:none;z-index:" + z +
        ";margin:0;padding:0;";
      document.body.appendChild(d);
      return d;
    }
    // Estilo Webflow: relleno azul en hover, padding celeste, margin ámbar.
    paddingBox = box(2147483643);
    paddingBox.style.background = "rgba(120,180,255,0.35)";
    marginBox = box(2147483642);
    marginBox.style.background = "rgba(255,170,60,0.32)";
    hoverBox = box(2147483646);
    hoverBox.style.display = "none";
    selectBox = box(2147483644);
    selectBox.style.display = "none";
    styleOverlayForMode();
    hoverLabel = makeLabel(2147483647);
    selectLabel = makeLabel(2147483645);
  }

  function makeLabel(z) {
    var d = document.createElement("div");
    d.setAttribute("data-steer-overlay", "");
    d.style.cssText =
      "position:absolute;pointer-events:none;z-index:" + z + ";display:none;" +
      "font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "background:" + ACCENT + ";color:#fff;padding:2px 7px;" +
      "border-radius:4px 4px 4px 0;white-space:nowrap;" +
      "transform:translateY(-100%);";
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

  function place(box, el) {
    var r = el.getBoundingClientRect();
    box.style.left = r.left + window.scrollX + "px";
    box.style.top = r.top + window.scrollY + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
    box.style.display = "block";
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

  // "src/components/Hero.tsx:42:6" → {file, line, col}.
  // Faltante → {file:"", line:0, col:0} (TRD §6.1): NO inventar paths.
  // El parent bloquea Apply cuando file === "" (AGENTS regla 6).
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
    // Lados individuales de padding/margin (edición T/R/B/L).
    ["padding", "margin"].forEach(function (p) {
      ["top", "right", "bottom", "left"].forEach(function (side) {
        var key = p + side.charAt(0).toUpperCase() + side.slice(1);
        props[key] = computed.getPropertyValue(p + "-" + side);
      });
    });
    props.display = computed.display;
    var ff = computed.fontFamily || "";
    props.fontFamily = ff.split(",")[0].replace(/['"]/g, "").trim();
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

  function isSteerUi(el) {
    if (!el || !el.closest) return false;
    return !!(
      el.closest("[data-steer-comment-popover]") ||
      el.closest("[data-steer-overlay]") ||
      el.closest("[data-steer-pin]") ||
      el.closest("[data-steer-cursor]")
    );
  }

  function onMove(e) {
    if (!inspect) return;
    if (isSteerUi(e.target)) return;
    var now = Date.now();
    if (now - lastMove < 32) return; // TRD §13: throttle 32ms
    lastMove = now;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hoverBox || el === hoverLabel || el === selectBox || el === selectLabel) return;
    if (isSteerUi(el)) return;
    // Hover sobre el ya seleccionado: sin chip duplicado (el outline de
    // selección ya está); el espaciado se sigue mostrando.
    if (el === selectedEl) {
      if (hoverBox) hoverBox.style.display = "none";
      if (hoverLabel) hoverLabel.style.display = "none";
      if (!commentMode) placeSpacing(el);
      else hideSpacing();
      return;
    }
    ensureOverlayNodes();
    place(hoverBox, el);
    if (commentMode) {
      if (hoverLabel) hoverLabel.style.display = "none";
      hideSpacing();
    } else {
      placeLabel(hoverLabel, el);
      hoverLabel.textContent = labelFor(el);
      placeSpacing(el);
    }
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
    // No secuestrar clicks del popover de comentario ni de los pins.
    if (isSteerUi(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hoverBox || el === hoverLabel || el === selectBox || el === selectLabel) return;
    if (isSteerUi(el)) return;
    selectElement(el);
  }

  // Ruta común de selección: click en canvas o click en el árbol de capas.
  function selectElement(el) {
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
    if (commentMode) {
      if (selectLabel) selectLabel.style.display = "none";
      hideSpacing();
    } else {
      placeLabel(selectLabel, el);
      selectLabel.textContent = labelFor(el);
      placeSpacing(el);
    }
    send({ type: "steer:select", id: selectedId, selection: buildSelection(el) });
    // Modo Comentarios: al elegir nodo, popover de pin en el sitio.
    if (commentMode) {
      var existingId = null;
      for (var pid in pins) {
        if (!Object.prototype.hasOwnProperty.call(pins, pid)) continue;
        if (pins[pid].steerId === selectedId) {
          existingId = pid;
          break;
        }
      }
      showCommentPopover(
        el,
        existingId ? pins[existingId].body || "" : "",
        existingId,
        selectedId,
      );
    }
  }

  // ---- Árbol de capas (Fase layers) — espejo liviano del DOM.
  // Ids estables por elemento: no se regeneran en cada push (si no,
  // el click del panel falla tras cualquier mutación/HMR).
  var treeIndex = {}; // node.id → elemento
  var idByEl = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var idSeq = 0;
  var treeTimer = null;

  function nodeId(el) {
    if (idByEl) {
      var existing = idByEl.get(el);
      if (existing) return existing;
    }
    idSeq += 1;
    var id = "n" + idSeq;
    if (idByEl) idByEl.set(el, id);
    return id;
  }

  function scheduleTree() {
    clearTimeout(treeTimer);
    treeTimer = setTimeout(pushTree, 200);
  }

  function isTreeJunk(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (
      tag === "script" ||
      tag === "style" ||
      tag === "link" ||
      tag === "meta" ||
      tag === "head" ||
      tag === "noscript" ||
      tag === "template"
    ) {
      return true;
    }
    // Overlays propios (no el nodo seleccionado del usuario).
    if (
      el.hasAttribute("data-steer-overlay") ||
      el.hasAttribute("data-steer-hover") ||
      el.hasAttribute("data-steer-pin") ||
      el.hasAttribute("data-steer-cursor") ||
      el.hasAttribute("data-steer-spacing")
    ) {
      return true;
    }
    // Devtools / runtime SSR / HMR: portals y barreras de stream.
    var id = el.id || "";
    var cls = typeof el.className === "string" ? el.className : "";
    var stamp = (id + " " + cls).toLowerCase();
    if (
      stamp.indexOf("devtools") !== -1 ||
      stamp.indexOf("tanstack") !== -1 ||
      stamp.indexOf("$tsr") !== -1 ||
      stamp.indexOf("tsr-stream") !== -1 ||
      stamp.indexOf("steer") !== -1 ||
      tag.indexOf("devtools") !== -1 ||
      tag.indexOf("tanstack-") === 0
    ) {
      return true;
    }
    if (el.hasAttribute("data-tanstack-router-dev-styles")) return true;
    // Vacíos de stream SSR (p.ej. <div style="position:absolute">).
    if (
      tag === "div" &&
      el.children.length === 0 &&
      !(el.textContent || "").trim() &&
      !el.getAttribute("data-tsd-source") &&
      !id &&
      !cls
    ) {
      return true;
    }
    return false;
  }

  /** Subárbol “del producto”: hay data-tsd-source en el nodo o debajo. */
  function hasSourceInTree(el) {
    if (el.getAttribute && el.getAttribute("data-tsd-source")) return true;
    try {
      return !!(el.querySelector && el.querySelector("[data-tsd-source]"));
    } catch (_) {
      return false;
    }
  }

  function pushTree() {
    try {
      treeIndex = {};
      var count = 0;
      function walk(el, depth) {
        if (!el || depth > 12 || count > 400) return null;
        if (isTreeJunk(el)) return null;
        // body/html siempre se muestran; el resto solo si aporta source
        // (evita basura de overlays/portal a un lado del app root).
        var isRootShell =
          el === document.body || el === document.documentElement;
        if (!isRootShell && !hasSourceInTree(el)) return null;
        count += 1;
        var tag = el.tagName ? el.tagName.toLowerCase() : "div";
        var id = nodeId(el);
        treeIndex[id] = el;
        var text = null;
        for (var t = 0; t < el.childNodes.length; t++) {
          var ch = el.childNodes[t];
          if (ch.nodeType === 3 && ch.nodeValue && ch.nodeValue.trim() !== "") {
            text = ch.nodeValue.trim().slice(0, 40);
            break;
          }
        }
        var loc = parseSource(el);
        var node = {
          id: id,
          tag: tag,
          cls:
            el.classList && el.classList.length > 0 ? el.classList[0] : null,
          text: text,
          source: loc.file ? loc.file + ":" + loc.line + ":" + loc.col : null,
          children: [],
        };
        for (var c = 0; c < el.children.length; c++) {
          var child = walk(el.children[c], depth + 1);
          if (child) node.children.push(child);
        }
        return node;
      }
      var root = document.body ? walk(document.body, 0) : null;
      send({ type: "steer:tree", nodes: root ? [root] : [] });
    } catch (err) {
      // Nunca romper el preview por el árbol; el debug del parent lo ve.
      if (typeof console !== "undefined" && console.warn) {
        console.warn("steer:tree failed", err);
      }
      send({ type: "steer:tree", nodes: [] });
    }
  }

  function selectNode(id) {
    var el = treeIndex[id];
    if (el && el.isConnected) selectElement(el);
  }

  // Cámara: pinta el viewport a canvas (colores, radios, imágenes, texto).
  // foreignObject+cloneNode no sirve: en WKWebView/Tauri el CSS de Tailwind
  // no entra al SVG y la captura sale como texto pelado.
  function captureTransparent(color) {
    return !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";
  }

  function captureZ(el) {
    var z = 0;
    var depth = 0;
    var n = el;
    while (n && n.nodeType === 1) {
      depth += 1;
      var zi = window.getComputedStyle(n).zIndex;
      if (zi !== "auto") z += (parseInt(zi, 10) || 0) * 10000;
      n = n.parentElement;
    }
    return z + depth;
  }

  function capturePreview() {
    try {
      var w = Math.max(1, Math.round(window.innerWidth || 800));
      var h = Math.max(1, Math.round(window.innerHeight || 600));
      var maxEdge = 1600;
      var scale = Math.max(w, h) > maxEdge ? maxEdge / Math.max(w, h) : 1;
      scale *= Math.min(2, window.devicePixelRatio || 1);
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      var ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("sin canvas 2d");
      ctx.scale(scale, scale);

      var rootBg = window.getComputedStyle(document.body).backgroundColor;
      ctx.fillStyle = captureTransparent(rootBg) ? "#ffffff" : rootBg;
      ctx.fillRect(0, 0, w, h);

      var raw = document.body.getElementsByTagName("*");
      var list = [document.documentElement, document.body];
      for (var i = 0; i < raw.length; i++) list.push(raw[i]);
      list.sort(function (a, b) {
        return captureZ(a) - captureZ(b);
      });

      for (var e = 0; e < list.length; e++) {
        var el = list[e];
        if (isSteerUi(el)) continue;
        var cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        var op = parseFloat(cs.opacity);
        if (op === 0) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 0.5 || r.height < 0.5) continue;
        if (r.bottom < 0 || r.right < 0 || r.top > h || r.left > w) continue;

        ctx.save();
        ctx.globalAlpha = isNaN(op) ? 1 : op;
        var rad = parseFloat(cs.borderTopLeftRadius) || 0;
        ctx.beginPath();
        if (rad > 0 && ctx.roundRect) {
          ctx.roundRect(r.left, r.top, r.width, r.height, rad);
        } else {
          ctx.rect(r.left, r.top, r.width, r.height);
        }
        var bg = cs.backgroundColor;
        if (!captureTransparent(bg)) {
          ctx.fillStyle = bg;
          ctx.fill();
        }
        var bw = parseFloat(cs.borderTopWidth) || 0;
        if (bw > 0 && !captureTransparent(cs.borderTopColor)) {
          ctx.strokeStyle = cs.borderTopColor;
          ctx.lineWidth = bw;
          ctx.stroke();
        }
        ctx.restore();

        var tag = el.tagName.toLowerCase();
        if (tag === "img" && el.naturalWidth) {
          try {
            ctx.drawImage(el, r.left, r.top, r.width, r.height);
          } catch (_) {
            /* imagen CORS */
          }
        }
        if (tag === "canvas") {
          try {
            ctx.drawImage(el, r.left, r.top, r.width, r.height);
          } catch (_) {}
        }
      }

      var walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
      );
      var node;
      while ((node = walker.nextNode())) {
        var parent = node.parentElement;
        if (!parent || isSteerUi(parent)) continue;
        var text = node.nodeValue;
        if (!text || !text.replace(/\s/g, "")) continue;
        var pcs = window.getComputedStyle(parent);
        if (pcs.display === "none" || pcs.visibility === "hidden") continue;
        var pop = parseFloat(pcs.opacity);
        if (pop === 0) continue;
        var range = document.createRange();
        range.selectNodeContents(node);
        var rects = range.getClientRects();
        if (!rects.length) continue;
        ctx.save();
        ctx.globalAlpha = isNaN(pop) ? 1 : pop;
        ctx.fillStyle = pcs.color;
        ctx.font = pcs.font;
        ctx.textBaseline = "alphabetic";
        var fontSize = parseFloat(pcs.fontSize) || 16;
        var remaining = text.replace(/\s+/g, " ");
        for (var ri = 0; ri < rects.length; ri++) {
          var box = rects[ri];
          if (box.bottom < 0 || box.top > h || box.right < 0 || box.left > w) {
            continue;
          }
          var slice = remaining;
          if (ctx.measureText(slice).width > box.width + 2) {
            while (slice.length > 1 && ctx.measureText(slice).width > box.width + 2) {
              slice = slice.slice(0, -1);
            }
            var sp = slice.lastIndexOf(" ");
            if (sp > 4) slice = slice.slice(0, sp);
          }
          remaining = remaining.slice(slice.length).replace(/^\s+/, "");
          ctx.fillText(
            slice.replace(/^\s+|\s+$/g, ""),
            box.left,
            box.top + fontSize * 0.8,
          );
        }
        ctx.restore();
      }

      send({
        type: "steer:captured",
        mime: "image/png",
        dataUrl: canvas.toDataURL("image/png"),
      });
    } catch (err) {
      send({
        type: "steer:capture-error",
        message: err && err.message ? err.message : String(err),
      });
    }
  }

  function setInspect(on) {
    inspect = on;
    setInspectCursor(on);
    if (on) {
      ensureOverlayNodes();
      styleOverlayForMode();
      if (selectedEl) {
        place(selectBox, selectedEl);
        if (commentMode) {
          if (selectLabel) selectLabel.style.display = "none";
          hideSpacing();
        } else {
          placeLabel(selectLabel, selectedEl);
          selectLabel.textContent = labelFor(selectedEl);
        }
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
    // Dejar trabajar el popover de comentarios y los badges de pin.
    if (isSteerUi(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  // Overrides efímeros: un único <style data-steer-overlay> (TRD §6.2/§13).
  // Tracking en vivo: cuando un override cambia el layout (padding,
  // font-size…), el outline/label/spacing deben seguir al elemento.
  // MutationObserver + ResizeObserver + scroll/resize, todo con rAF.
  var rafPending = false;
  function schedulePosition() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      positionSelection();
      positionPins();
    });
  }

  function positionSelection() {
    if (!selectedEl) return;
    ensureOverlayNodes();
    place(selectBox, selectedEl);
    if (commentMode) {
      if (selectLabel) selectLabel.style.display = "none";
      hideSpacing();
    } else {
      placeLabel(selectLabel, selectedEl);
      selectLabel.textContent = labelFor(selectedEl);
      placeSpacing(selectedEl);
    }
  }

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
    // Edición de espaciado en vivo: mostrar las capas del seleccionado y
    // enfatizar el anillo que se está editando (margin ámbar / padding
    // celeste), aunque el mouse esté en el panel.
    if (selectedEl) {
      var editing = {};
      for (var k = 0; k < overrides.length; k++) {
        if (overrides[k] && overrides[k].prop) editing[overrides[k].prop] = true;
      }
      ensureOverlayNodes();
      placeSpacing(selectedEl);
      if (editing.margin) emphasizeSpacing("margin");
      if (editing.padding) emphasizeSpacing("padding");
    }
    schedulePosition(); // el layout pudo cambiar: seguir al elemento
  }

  function emphasizeSpacing(prop) {
    var target = prop === "margin" ? marginBox : paddingBox;
    if (!target) return;
    target.style.background =
      prop === "margin" ? "rgba(255,170,60,0.55)" : "rgba(120,180,255,0.60)";
    target.style.border = "1px dashed " + (prop === "margin" ? "#ffaa3c" : "#78b4ff");
    clearTimeout(target.__steerEmph);
    target.__steerEmph = setTimeout(function () {
      target.style.background =
        prop === "margin" ? "rgba(255,170,60,0.32)" : "rgba(120,180,255,0.35)";
      target.style.border = "none";
    }, 900);
  }

  function clearOverrides() {
    if (styleEl) styleEl.textContent = "";
    schedulePosition();
  }

  function highlight(source) {
    if (!source || !source.file) {
      if (selectBox && selectedEl) place(selectBox, selectedEl);
      return;
    }
    // P0: el highlight vive sobre la última selección local.
    if (selectBox && selectedEl) place(selectBox, selectedEl);
  }

  // ---- Pins + popover de comentario (modo Comment) —
  // Círculo numerado en el nodo; click = editar. El popover vive en el
  // preview (mismo origin que el DOM del proyecto).
  var pins = {}; // intentId → { steerId, badge, body, number }
  var PIN_SIZE = 18;
  var PIN_COLOR = "#ff8a4c";
  var commentPopover = null;
  var commentTextarea = null;
  var commentSave = null;
  var commentEditing = null; // { intentId, steerId }

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

  function addPin(intentId, steerId, number, body) {
    removePin(intentId);
    var target = document.querySelector('[data-steer-id="' + steerId + '"]');
    if (!target && treeIndex && treeIndex[steerId]) {
      target = treeIndex[steerId];
      if (target && !target.getAttribute("data-steer-id")) {
        target.setAttribute("data-steer-id", steerId);
      }
    }
    var badge = document.createElement("button");
    badge.type = "button";
    badge.setAttribute("data-steer-pin", intentId);
    badge.setAttribute("aria-label", "Comentario #" + number);
    badge.textContent = String(number);
    badge.style.cssText =
      "position:absolute;z-index:2147483645;width:" + PIN_SIZE + "px;height:" +
      PIN_SIZE + "px;align-items:center;justify-content:center;" +
      "border:0;padding:0;cursor:pointer;" +
      "border-radius:9999px;background:" + PIN_COLOR + ";color:#fff;" +
      "font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "display:flex;box-shadow:0 1px 4px #0e0f1166;pointer-events:auto;";
    badge.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var clickTarget =
        document.querySelector('[data-steer-id="' + steerId + '"]') ||
        (treeIndex && treeIndex[steerId]);
      if (clickTarget) selectElement(clickTarget);
      showCommentPopover(
        clickTarget || document.body,
        typeof body === "string" ? body : "",
        intentId,
        steerId,
      );
    });
    document.body.appendChild(badge);
    pins[intentId] = {
      steerId: steerId,
      badge: badge,
      body: typeof body === "string" ? body : "",
      number: number,
    };
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

  function ensureCommentPopover() {
    if (commentPopover) return;
    var pop = document.createElement("div");
    pop.setAttribute("data-steer-overlay", "");
    pop.setAttribute("data-steer-comment-popover", "");
    pop.style.cssText =
      "position:absolute;z-index:2147483647;width:240px;" +
      "background:#16181c;color:#f2f3f5;border:1px solid #2c313a;" +
      "border-radius:10px;padding:8px;box-shadow:0 8px 24px #0e0f1188;" +
      "font:12.5px/1.4 system-ui,sans-serif;display:none;";
    var ta = document.createElement("textarea");
    ta.placeholder = "Comentario para el agente…";
    ta.rows = 3;
    ta.style.cssText =
      "width:100%;box-sizing:border-box;resize:vertical;border:0;" +
      "outline:none;background:#1e2127;color:#f2f3f5;border-radius:6px;" +
      "padding:6px 8px;font:12.5px/1.4 system-ui,sans-serif;";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;margin-top:6px;justify-content:flex-end;";
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    cancel.style.cssText =
      "border:0;background:#272b33;color:#c4c8d0;border-radius:6px;" +
      "padding:4px 10px;font:12px system-ui,sans-serif;cursor:pointer;";
    var save = document.createElement("button");
    save.type = "button";
    save.textContent = "Guardar";
    save.style.cssText =
      "border:0;background:#5b8cff;color:#fff;border-radius:6px;" +
      "padding:4px 10px;font:12px system-ui,sans-serif;cursor:pointer;";
    row.appendChild(cancel);
    row.appendChild(save);
    pop.appendChild(ta);
    pop.appendChild(row);
    document.body.appendChild(pop);
    commentPopover = pop;
    commentTextarea = ta;
    commentSave = save;
    cancel.addEventListener("click", function () {
      hideCommentPopover();
    });
    save.addEventListener("click", function () {
      submitComment();
    });
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitComment();
      } else if (e.key === "Escape") {
        e.preventDefault();
        hideCommentPopover();
      }
    });
  }

  function hideCommentPopover() {
    if (commentPopover) commentPopover.style.display = "none";
    commentEditing = null;
  }

  function showCommentPopover(el, body, intentId, steerId) {
    ensureCommentPopover();
    var r = el.getBoundingClientRect();
    commentEditing = {
      intentId: intentId || null,
      steerId: steerId || (el && el.getAttribute ? el.getAttribute("data-steer-id") : null),
    };
    commentTextarea.value = body || "";
    commentPopover.style.display = "block";
    var top = r.bottom + window.scrollY + 8;
    var left = r.left + window.scrollX;
    commentPopover.style.top = top + "px";
    commentPopover.style.left = Math.max(8, Math.min(left, window.innerWidth - 256)) + "px";
    setTimeout(function () {
      commentTextarea.focus();
    }, 0);
  }

  function submitComment() {
    var body = (commentTextarea.value || "").trim();
    if (body === "" || !commentEditing) {
      // No cerrar: deja el popover abierto para escribir.
      if (commentTextarea) commentTextarea.focus();
      return;
    }
    var steerId =
      commentEditing.steerId ||
      (selectedEl && selectedEl.getAttribute
        ? selectedEl.getAttribute("data-steer-id")
        : null);
    send({
      type: "steer:comment-submit",
      intentId: commentEditing.intentId || null,
      body: body,
      steerId: steerId || "",
      selection: selectedEl ? buildSelection(selectedEl) : null,
    });
    hideCommentPopover();
  }

  function clearSelection() {
    selectedEl = null;
    selectedId = null;
    if (selectBox) selectBox.style.display = "none";
    if (selectLabel) selectLabel.style.display = "none";
    hideSpacing();
  }

  function setPreviewMode(mode) {
    commentMode = mode === "comment";
    var inspectOn = mode !== "interact";
    if (mode === "interact") {
      clearSelection();
    }
    setInspect(inspectOn);
    styleOverlayForMode();
    if (commentMode) {
      if (hoverLabel) hoverLabel.style.display = "none";
      if (selectLabel) selectLabel.style.display = "none";
      hideSpacing();
    } else if (inspectOn && selectedEl) {
      positionSelection();
    }
    if (!commentMode) hideCommentPopover();
  }

  function focusPin(intentId) {
    var pin = pins[intentId];
    if (!pin) return;
    var el = document.querySelector('[data-steer-id="' + pin.steerId + '"]');
    if (el) selectElement(el);
    showCommentPopover(el || document.body, pin.body || "", intentId, pin.steerId);
  }

  window.addEventListener("scroll", schedulePosition, true);
  window.addEventListener("resize", schedulePosition);

  // Cambios del DOM (HMR, re-renders, overrides) → reposicionar overlay
  // y refrescar el árbol de capas con debounce.
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(function (records) {
      var structural = false;
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === "childList") {
          structural = true;
          break;
        }
        // Atributos: ignorar data-steer-* (overlays) para no buclear.
        if (
          r.type === "attributes" &&
          r.attributeName &&
          r.attributeName.indexOf("data-steer") !== 0
        ) {
          structural = true;
          break;
        }
      }
      schedulePosition();
      if (structural) scheduleTree();
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

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
        commentMode = false;
        hideCommentPopover();
        break;
      case "steer:set-mode":
        setPreviewMode(msg.mode);
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
        addPin(msg.intentId, msg.steerId, msg.number, msg.body);
        break;
      case "steer:remove-pin":
        removePin(msg.intentId);
        break;
      case "steer:focus-pin":
        focusPin(msg.intentId);
        break;
      case "steer:select-node":
        selectNode(msg.id);
        break;
      case "steer:clear-pins":
        clearPins();
        break;
      case "steer:capture":
        capturePreview();
        break;
      case "steer:request-tree":
        pushTree();
        break;
      default:
        break;
    }
  });

  send({ type: "steer:ready" });
  // Push inmediato (no solo debounce): el panel de capas no debe
  // quedarse en "esperando el árbol" si no hay mutaciones.
  pushTree();
  scheduleTree();
})();
