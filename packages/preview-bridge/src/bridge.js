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

  // Copy visible del overlay (es-US). Un solo lugar para futuros locales.
  var STRINGS = {
    editPin: "Edit #",
    commentPin: "Comment #",
    commentPlaceholder: "Comment for the agent…",
    cancel: "Cancel",
    save: "Save",
    captureBlocked:
      "The preview includes cross-origin content without CORS that blocks the capture.",
    cropHint: "Drag to crop · click = full screen · Esc cancels",
  };

  var inspect = false;
  var commentMode = false;
  var selectedEl = null;
  var selectedId = null;

  var hoverBox = null;
  var hoverLabel = null;
  var selectBox = null;
  var selectLabel = null;
  var marginBox = null;
  var paddingBox = null;
  var inspectStyle = null;
  var styleEl = null;
  var textTouched = [];
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

  // El overlay es `position:absolute` hijo de `body`. Su containing block es
  // el `offsetParent` (body si está posicionado; si no, el initial containing
  // block). NO asumimos que el body arranca en (0,0): con
  // `body{position:relative}` y un margen superior colapsado, el body queda
  // corrido y el overlay se dibujaba desfasado (p. ej. 87px más abajo).
  // Devuelve el origen del containing block en coordenadas de viewport.
  function overlayOrigin(box) {
    var op = box && box.offsetParent;
    if (op == null) {
      return { x: -window.scrollX, y: -window.scrollY };
    }
    var r = op.getBoundingClientRect();
    var cs = window.getComputedStyle(op);
    var bl = parseFloat(cs.borderLeftWidth) || 0;
    var bt = parseFloat(cs.borderTopWidth) || 0;
    return { x: r.left + bl - op.scrollLeft, y: r.top + bt - op.scrollTop };
  }

  function place(box, el) {
    var r = el.getBoundingClientRect();
    var o = overlayOrigin(box);
    box.style.left = r.left - o.x + "px";
    box.style.top = r.top - o.y + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
    box.style.display = "block";
  }

  function placeLabel(label, el) {
    var r = el.getBoundingClientRect();
    var o = overlayOrigin(label);
    var x = r.left - o.x;
    var y = r.top - o.y - 20;
    // Si el label quedaría fuera del borde superior del viewport, va debajo.
    if (r.top - 20 < 2) y = r.top - o.y + 2;
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
    // Coordenadas de viewport; placeSpacing las traduce al containing block.
    return {
      margin: {
        left: r.left - mL,
        top: r.top - mT,
        width: r.width + mL + mR,
        height: r.height + mT + mB,
      },
      padding: {
        left: r.left + bL,
        top: r.top + bT,
        width: r.width - bL - bR,
        height: r.height - bT - bB,
      },
    };
  }

  function placeSpacing(el) {
    ensureOverlayNodes();
    var s = rectsForSpacing(el);
    var om = overlayOrigin(marginBox);
    marginBox.style.left = s.margin.left - om.x + "px";
    marginBox.style.top = s.margin.top - om.y + "px";
    marginBox.style.width = s.margin.width + "px";
    marginBox.style.height = s.margin.height + "px";
    var op = overlayOrigin(paddingBox);
    paddingBox.style.left = s.padding.left - op.x + "px";
    paddingBox.style.top = s.padding.top - op.y + "px";
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
      textPreview: (el.textContent || "").trim().slice(0, 4000),
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
    // Mismo id que el árbol de capas (`n…`). Si el pin usa `s…` y el
    // tree rehidrata con `n…`, positionPins no encuentra el nodo y
    // esconde el círculo (el chat sí muestra el comentario).
    selectedId = nodeId(el);
    selectedEl.setAttribute("data-steer-id", selectedId);
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

  function sourceKey(loc) {
    return loc.file + ":" + loc.line + ":" + loc.col;
  }

  function findBySource(source) {
    if (!source || !source.file) return null;
    var want = source.file + ":" + source.line + ":" + source.col;
    var nodes = document.querySelectorAll("[" + SOURCE_ATTR + "]");
    for (var i = 0; i < nodes.length; i++) {
      var loc = parseSource(nodes[i]);
      if (loc.file && sourceKey(loc) === want) return nodes[i];
    }
    return null;
  }

  function selectBySource(source) {
    var el = findBySource(source);
    if (el) selectElement(el);
  }

  /** UX §5.3: click en el nombre del componente sube al host con source distinto. */
  function selectAncestor() {
    if (!selectedEl) return;
    var current = parseSource(selectedEl);
    if (!current.file) return;
    var host =
      selectedEl.closest && selectedEl.closest("[" + SOURCE_ATTR + "]");
    var n = host && host.parentElement ? host.parentElement : selectedEl.parentElement;
    while (n && n !== document.documentElement) {
      var loc = parseSource(n);
      if (loc.file && sourceKey(loc) !== sourceKey(current)) {
        selectElement(n);
        return;
      }
      n = n.parentElement;
    }
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

  // Las imágenes cross-origin sin `crossorigin` taintan el canvas y
  // `toDataURL` lanza "The operation is insecure.". Las recargamos con CORS
  // (si el server lo permite) y cacheamos; las que no, se omiten.
  var captureImageCache = {};

  function captureSrc(img) {
    return img.currentSrc || img.src || "";
  }

  function captureNeedsCors(src) {
    if (!src || src.indexOf("data:") === 0 || src.indexOf("blob:") === 0) {
      return false;
    }
    try {
      return new URL(src, location.href).origin !== location.origin;
    } catch (_) {
      return false;
    }
  }

  function loadCaptureImage(src) {
    if (Object.prototype.hasOwnProperty.call(captureImageCache, src)) {
      return Promise.resolve(captureImageCache[src]);
    }
    return new Promise(function (resolve) {
      var img = document.createElement("img");
      img.crossOrigin = "anonymous";
      img.onload = function () {
        captureImageCache[src] = img;
        resolve(img);
      };
      img.onerror = function () {
        captureImageCache[src] = null;
        resolve(null);
      };
      img.src = src;
    });
  }

  function captureDrawable(img) {
    var src = captureSrc(img);
    if (!captureNeedsCors(src)) return img;
    return captureImageCache[src] || null; // null → no cargó con CORS
  }

  function preloadCaptureImages() {
    var imgs = document.body.getElementsByTagName("img");
    var pending = [];
    for (var i = 0; i < imgs.length; i++) {
      var src = captureSrc(imgs[i]);
      if (
        src &&
        captureNeedsCors(src) &&
        !Object.prototype.hasOwnProperty.call(captureImageCache, src)
      ) {
        pending.push(loadCaptureImage(src));
      }
    }
    return Promise.all(pending);
  }

  async function paintPreview(region) {
    await preloadCaptureImages();
    var fullW = Math.max(1, Math.round(window.innerWidth || 800));
      var fullH = Math.max(1, Math.round(window.innerHeight || 600));
      var vx = 0;
      var vy = 0;
      var vw = fullW;
      var vh = fullH;
      if (region && region.width >= 2 && region.height >= 2) {
        vx = Math.max(0, Math.round(region.left));
        vy = Math.max(0, Math.round(region.top));
        vw = Math.max(1, Math.min(fullW - vx, Math.round(region.width)));
        vh = Math.max(1, Math.min(fullH - vy, Math.round(region.height)));
      }
      var w = vw;
      var h = vh;
      var maxEdge = 1600;
      var scale = Math.max(w, h) > maxEdge ? maxEdge / Math.max(w, h) : 1;
      scale *= Math.min(2, window.devicePixelRatio || 1);
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      var ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("sin canvas 2d");
      ctx.scale(scale, scale);
      ctx.translate(-vx, -vy);

      var rootBg = window.getComputedStyle(document.body).backgroundColor;
      ctx.fillStyle = captureTransparent(rootBg) ? "#ffffff" : rootBg;
      ctx.fillRect(vx, vy, vw, vh);

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
        if (r.bottom < vy || r.right < vx || r.top > vy + vh || r.left > vx + vw) {
          continue;
        }

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
          var drawable = captureDrawable(el);
          if (drawable) {
            try {
              ctx.drawImage(
                drawable,
                r.left,
                r.top,
                r.width,
                r.height,
              );
            } catch (_) {
              /* imagen CORS */
            }
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
          if (
            box.bottom < vy ||
            box.top > vy + vh ||
            box.right < vx ||
            box.left > vx + vw
          ) {
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

    return canvas;
  }

  async function capturePreview(region) {
    try {
      var canvas = await paintPreview(region);
      var dataUrl;
      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch (_taint) {
        send({
          type: "steer:capture-error",
          message: STRINGS.captureBlocked,
        });
        return;
      }
      send({ type: "steer:captured", mime: "image/png", dataUrl: dataUrl });
    } catch (err) {
      send({
        type: "steer:capture-error",
        message: err && err.message ? err.message : String(err),
      });
    }
  }

  // Thumbnail silencioso para el home: full viewport, downscale, JPEG.
  async function captureThumbnail() {
    try {
      var canvas = await paintPreview(null);
      var maxW = 640;
      var ratio = canvas.width > maxW ? maxW / canvas.width : 1;
      var tw = Math.max(1, Math.round(canvas.width * ratio));
      var th = Math.max(1, Math.round(canvas.height * ratio));
      var thumb = document.createElement("canvas");
      thumb.width = tw;
      thumb.height = th;
      var tctx = thumb.getContext("2d");
      if (!tctx) return;
      tctx.drawImage(canvas, 0, 0, tw, th);
      var dataUrl;
      try {
        dataUrl = thumb.toDataURL("image/jpeg", 0.7);
      } catch (_taint) {
        return;
      }
      send({ type: "steer:thumbnail", dataUrl: dataUrl });
    } catch (_) {
      /* thumbnail best-effort */
    }
  }

  // ---- Selección de área de captura ----
  // Click cámara → overlay; click simple = viewport completo; drag = región;
  // Esc cancela.
  var captureOverlay = null;
  var captureRectEl = null;
  var captureStart = null;

  function onCaptureKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      removeCaptureOverlay();
    }
  }

  function removeCaptureOverlay() {
    if (captureOverlay && captureOverlay.parentNode) {
      captureOverlay.parentNode.removeChild(captureOverlay);
    }
    captureOverlay = null;
    captureRectEl = null;
    captureStart = null;
    document.removeEventListener("keydown", onCaptureKey, true);
  }

  function updateCaptureRect(x, y) {
    if (!captureStart || !captureRectEl) return;
    var left = Math.min(captureStart.x, x);
    var top = Math.min(captureStart.y, y);
    captureRectEl.style.left = left + "px";
    captureRectEl.style.top = top + "px";
    captureRectEl.style.width = Math.abs(x - captureStart.x) + "px";
    captureRectEl.style.height = Math.abs(y - captureStart.y) + "px";
  }

  function onCaptureMove(e) {
    if (!captureStart) return;
    e.preventDefault();
    updateCaptureRect(e.clientX, e.clientY);
  }

  function onCaptureDown(e) {
    e.preventDefault();
    e.stopPropagation();
    captureStart = { x: e.clientX, y: e.clientY };
    if (captureRectEl) captureRectEl.style.display = "block";
    updateCaptureRect(e.clientX, e.clientY);
  }

  function onCaptureUp(e) {
    if (!captureStart) return;
    e.preventDefault();
    e.stopPropagation();
    var start = captureStart;
    var left = Math.min(start.x, e.clientX);
    var top = Math.min(start.y, e.clientY);
    var w = Math.abs(e.clientX - start.x);
    var h = Math.abs(e.clientY - start.y);
    var region =
      w >= 8 && h >= 8
        ? { left: left, top: top, width: w, height: h }
        : null;
    removeCaptureOverlay();
    capturePreview(region);
  }

  function beginCaptureSelection() {
    if (captureOverlay) {
      removeCaptureOverlay();
      return;
    }
    var ov = document.createElement("div");
    ov.setAttribute("data-steer-overlay", "");
    ov.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;" +
      "user-select:none;-webkit-user-select:none;";
    var hint = document.createElement("div");
    hint.setAttribute("data-steer-overlay", "");
    hint.textContent = STRINGS.cropHint;
    hint.style.cssText =
      "position:absolute;top:12px;left:50%;transform:translateX(-50%);" +
      "font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;" +
      "background:rgba(10,12,16,0.85);padding:4px 10px;border-radius:9999px;" +
      "white-space:nowrap;pointer-events:none;";
    var rect = document.createElement("div");
    rect.setAttribute("data-steer-overlay", "");
    rect.style.cssText =
      "position:absolute;display:none;pointer-events:none;" +
      "border:2px solid " +
      ACCENT +
      ";background:transparent;" +
      "box-shadow:0 0 0 9999px rgba(10,12,16,0.35);";
    ov.appendChild(hint);
    ov.appendChild(rect);
    document.body.appendChild(ov);
    captureOverlay = ov;
    captureRectEl = rect;
    captureStart = null;
    ov.addEventListener("mousedown", onCaptureDown, true);
    ov.addEventListener("mousemove", onCaptureMove, true);
    ov.addEventListener("mouseup", onCaptureUp, true);
    document.addEventListener("keydown", onCaptureKey, true);
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
        if (rules[j].prop === "text") continue;
        css += cssProp(rules[j].prop) + ":" + rules[j].value + " !important;";
      }
      css += "}";
    }
    styleEl.textContent = css;
    applyTextOverrides(overrides);
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

  function restoreTextOverrides() {
    for (var i = 0; i < textTouched.length; i++) {
      var el = textTouched[i];
      if (el && el.__steerTextOrig != null) {
        if (el.isConnected) el.textContent = el.__steerTextOrig;
        try {
          delete el.__steerTextOrig;
        } catch (_) {
          el.__steerTextOrig = undefined;
        }
      }
    }
    textTouched = [];
  }

  function textTargets(o) {
    if (
      o.scope === "component" &&
      o.source &&
      o.source.file
    ) {
      return document.querySelectorAll(
        '[data-tsd-source="' +
          o.source.file +
          ":" +
          o.source.line +
          ":" +
          o.source.col +
          '"]',
      );
    }
    var el = pinTarget(o.steerId);
    return el ? [el] : [];
  }

  function applyTextOverrides(overrides) {
    restoreTextOverrides();
    if (!Array.isArray(overrides)) return;
    for (var i = 0; i < overrides.length; i++) {
      var o = overrides[i];
      if (!o || o.prop !== "text" || o.value == null) continue;
      var els = textTargets(o);
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        if (!el) continue;
        if (el.__steerTextOrig == null) el.__steerTextOrig = el.textContent;
        textTouched.push(el);
        el.textContent = o.value;
      }
    }
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
    restoreTextOverrides();
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
  var pins = {}; // intentId → { steerId, badge, body, number, kind }
  var PIN_SIZE = 18;
  var PIN_COLOR = "#ff8a4c";
  var EDIT_PIN_COLOR = "#5b8cff";
  var commentPopover = null;
  var commentTextarea = null;
  var commentSave = null;
  var commentEditing = null; // { intentId, steerId }

  function pinTarget(steerId) {
    if (!steerId) return null;
    var el = document.querySelector('[data-steer-id="' + steerId + '"]');
    if (!el && treeIndex && treeIndex[steerId]) {
      el = treeIndex[steerId];
    }
    if (!el || !el.isConnected) return null;
    if (el.getAttribute("data-steer-id") !== steerId) {
      el.setAttribute("data-steer-id", steerId);
    }
    return el;
  }

  function positionPins() {
    var slotByNode = {};
    for (var id in pins) {
      if (!Object.prototype.hasOwnProperty.call(pins, id)) continue;
      var pin = pins[id];
      var el = pinTarget(pin.steerId);
      if (!el) {
        pin.badge.style.display = "none";
        continue;
      }
      var r = el.getBoundingClientRect();
      var o = overlayOrigin(pin.badge);
      var slot = slotByNode[pin.steerId] || 0;
      slotByNode[pin.steerId] = slot + 1;
      pin.badge.style.display = "flex";
      pin.badge.style.left =
        r.left - o.x + r.width - PIN_SIZE / 2 - slot * 14 + "px";
      pin.badge.style.top = r.top - o.y - PIN_SIZE / 2 + "px";
    }
  }

  function addPin(intentId, steerId, number, body, kind) {
    removePin(intentId);
    var pinKind = kind === "edit" ? "edit" : "comment";
    var color = pinKind === "edit" ? EDIT_PIN_COLOR : PIN_COLOR;
    var target = pinTarget(steerId);
    var badge = document.createElement("button");
    badge.type = "button";
    badge.setAttribute("data-steer-pin", intentId);
    badge.setAttribute(
      "aria-label",
      pinKind === "edit"
        ? STRINGS.editPin + number
        : STRINGS.commentPin + number,
    );
    badge.textContent = String(number);
    badge.style.cssText =
      "position:absolute;z-index:2147483645;width:" + PIN_SIZE + "px;height:" +
      PIN_SIZE + "px;align-items:center;justify-content:center;" +
      "border:0;padding:0;cursor:pointer;" +
      "border-radius:9999px;background:" + color + ";color:#fff;" +
      "font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "display:flex;box-shadow:0 1px 4px #0e0f1166;pointer-events:auto;";
    badge.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var clickTarget = pinTarget(steerId);
      if (clickTarget) selectElement(clickTarget);
      if (pinKind === "edit") {
        send({ type: "steer:open-inspector" });
        return;
      }
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
      kind: pinKind,
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
    ta.placeholder = STRINGS.commentPlaceholder;
    ta.rows = 3;
    ta.style.cssText =
      "width:100%;box-sizing:border-box;resize:vertical;border:0;" +
      "outline:none;background:#1e2127;color:#f2f3f5;border-radius:6px;" +
      "padding:6px 8px;font:12.5px/1.4 system-ui,sans-serif;";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;margin-top:6px;justify-content:flex-end;";
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = STRINGS.cancel;
    cancel.style.cssText =
      "border:0;background:#272b33;color:#c4c8d0;border-radius:6px;" +
      "padding:4px 10px;font:12px system-ui,sans-serif;cursor:pointer;";
    var save = document.createElement("button");
    save.type = "button";
    save.textContent = STRINGS.save;
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
    var o = overlayOrigin(commentPopover);
    var top = r.bottom - o.y + 8;
    var left = r.left - o.x;
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
    var el = pinTarget(pin.steerId);
    if (el) selectElement(el);
    if (pin.kind === "edit") {
      send({ type: "steer:open-inspector" });
      return;
    }
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
        addPin(msg.intentId, msg.steerId, msg.number, msg.body, msg.kind);
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
      case "steer:select-source":
        selectBySource(msg.source);
        break;
      case "steer:select-ancestor":
        selectAncestor();
        break;
      case "steer:clear-pins":
        clearPins();
        break;
      case "steer:capture":
        beginCaptureSelection();
        break;
      case "steer:capture-thumbnail":
        captureThumbnail();
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
