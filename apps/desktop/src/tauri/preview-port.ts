// Adapter PreviewPort — ARCHITECTURE §4/TRD §6. Controla el iframe del
// preview vía postMessage steer:* y expone los mensajes del bridge como
// eventos suscribibles. La UI nunca habla con el iframe directamente.

import type { FrameToParent, ParentToFrame, PreviewPort } from "@steer/ports";

export function createIframePreviewPort(
  getFrame: () => HTMLIFrameElement | null,
): PreviewPort {
  const handlers = new Set<(msg: FrameToParent) => void>();

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
    for (const handler of handlers) {
      handler(data as FrameToParent);
    }
  });

  function post(msg: ParentToFrame): void {
    const frameWindow = getFrame()?.contentWindow;
    if (frameWindow) {
      frameWindow.postMessage(msg, "*");
    } else {
      console.warn("steer:preview postMessage sin iframe", msg.type);
    }
  }

  return {
    setInspect: (on) => post({ type: on ? "steer:inspect-on" : "steer:inspect-off" }),
    setOverrides: (overrides) => post({ type: "steer:set-overrides", overrides }),
    clearOverrides: () => post({ type: "steer:clear-overrides" }),
    highlight: (source) => post({ type: "steer:highlight", source }),
    addPin: (intentId, steerId, number) =>
      post({ type: "steer:add-pin", intentId, steerId, number }),
    removePin: (intentId) => post({ type: "steer:remove-pin", intentId }),
    clearPins: () => post({ type: "steer:clear-pins" }),
    subscribe: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
