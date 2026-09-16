// Adapter PreviewPort — ARCHITECTURE §4/TRD §6. Controla el iframe del
// preview vía postMessage steer:* y expone los mensajes del bridge como
// eventos suscribibles. La UI nunca habla con el iframe directamente.

import { invoke } from "@tauri-apps/api/core";
import type { FrameToParent, ParentToFrame, PreviewPort } from "@steer/ports";

/** Baja la captura (PNG del snapshot nativo) a un JPEG chico y liviano. */
async function downscaleJpeg(
  dataUrl: string,
  maxWidth: number,
  quality: number,
): Promise<string | null> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    if (img.naturalWidth === 0 || img.naturalHeight === 0) return null;
    const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (ctx == null) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

export function createIframePreviewPort(
  getFrame: () => HTMLIFrameElement | null,
  onDebug?: (line: string) => void,
): PreviewPort {
  const handlers = new Set<(msg: FrameToParent) => void>();
  const pending: ParentToFrame[] = [];
  let resolveThumbnail: ((url: string | null) => void) | null = null;

  window.addEventListener("message", (e) => {
    if (e.source !== getFrame()?.contentWindow) return;
    const data: unknown = e.data;
    if (
      typeof data !== "object" ||
      data === null ||
      !("type" in data) ||
      typeof data.type !== "string" ||
      !data.type.startsWith("steer:")
    ) {
      return;
    }
    onDebug?.(`← ${data.type}`);
    if (data.type === "steer:thumbnail" && resolveThumbnail != null) {
      const resolve = resolveThumbnail;
      resolveThumbnail = null;
      resolve((data as { dataUrl?: string }).dataUrl ?? null);
    }
    for (const handler of handlers) {
      handler(data as FrameToParent);
    }
  });

  function post(msg: ParentToFrame): void {
    const frameWindow = getFrame()?.contentWindow;
    if (frameWindow) {
      onDebug?.(`→ ${msg.type}`);
      frameWindow.postMessage(msg, "*");
    } else {
      pending.push(msg);
      onDebug?.(`⏳ ${msg.type} (sin iframe)`);
    }
  }

  function flushPending(): void {
    const frameWindow = getFrame()?.contentWindow;
    if (!frameWindow || pending.length === 0) return;
    for (const msg of pending) {
      onDebug?.(`→ ${msg.type} (flush)`);
      frameWindow.postMessage(msg, "*");
    }
    pending.length = 0;
  }

  /** Fallback: pide la captura al bridge (painter) y espera steer:thumbnail. */
  function captureViaBridge(): Promise<string | null> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (url: string | null): void => {
        if (done) return;
        done = true;
        resolveThumbnail = null;
        resolve(url);
      };
      resolveThumbnail = finish;
      post({ type: "steer:capture-thumbnail" });
      window.setTimeout(() => finish(null), 8000);
    });
  }

  return {
    setInspect: (on) => post({ type: on ? "steer:inspect-on" : "steer:inspect-off" }),
    setMode: (mode) => post({ type: "steer:set-mode", mode }),
    setOverrides: (overrides) => post({ type: "steer:set-overrides", overrides }),
    clearOverrides: () => post({ type: "steer:clear-overrides" }),
    highlight: (source) => post({ type: "steer:highlight", source }),
    addPin: (intentId, steerId, number, body, kind) =>
      post({ type: "steer:add-pin", intentId, steerId, number, body, kind }),
    removePin: (intentId) => post({ type: "steer:remove-pin", intentId }),
    clearPins: () => post({ type: "steer:clear-pins" }),
    selectNode: (id) => post({ type: "steer:select-node", id }),
    selectBySource: (source) => post({ type: "steer:select-source", source }),
    selectAncestor: () => post({ type: "steer:select-ancestor" }),
    focusPin: (intentId) => post({ type: "steer:focus-pin", intentId }),
    capture: () => post({ type: "steer:capture" }),
    captureThumbnail: async () => {
      const el = getFrame();
      if (el == null) {
        onDebug?.("thumb: sin iframe → bridge");
      } else {
        const rect = el.getBoundingClientRect();
        const x = Math.max(0, rect.left);
        const y = Math.max(0, rect.top);
        const width = Math.min(window.innerWidth - x, rect.width);
        const height = Math.min(window.innerHeight - y, rect.height);
        onDebug?.(
          `thumb: rect ${Math.round(x)},${Math.round(y)} ${Math.round(width)}x${Math.round(height)} vp ${window.innerWidth}x${window.innerHeight}`,
        );
        if (width >= 2 && height >= 2) {
          try {
            const info = await invoke<{ dataUrl: string }>("window_snapshot", {
              x,
              y,
              width,
              height,
            });
            const len = info?.dataUrl?.length ?? 0;
            const small = await downscaleJpeg(info.dataUrl, 640, 0.72);
            onDebug?.(
              `thumb: native ok (${len}b) → ${small ? "jpeg" : "png"}`,
            );
            return small ?? info.dataUrl;
          } catch (err) {
            onDebug?.(
              `thumb: native fail → ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        } else {
          onDebug?.("thumb: rect chico → bridge");
        }
      }
      onDebug?.("thumb: bridge fallback");
      return await captureViaBridge();
    },
    requestTree: () => post({ type: "steer:request-tree" }),
    flushPending,
    subscribe: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
