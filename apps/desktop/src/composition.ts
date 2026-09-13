// Composition root — ARCHITECTURE §6. ÚNICO archivo con permiso de
// importar UI + state + adapters + wrappers Tauri. Cualquier import de
// un adapter desde un componente React es un bug.

import { createAppStore } from "@steer/app-state";
import { createPrefs } from "./tauri/prefs";
import { createIframePreviewPort } from "./tauri/preview-port";
import { createTauriProjectPort } from "./tauri/project-port";

// Ref al iframe del preview; el adapter lo lee al postear/suscribir.
const frameRef: { current: HTMLIFrameElement | null } = { current: null };

const projectPort = createTauriProjectPort();
const previewPort = createIframePreviewPort(() => frameRef.current);
const prefs = createPrefs();

// Fase F registra aquí los AgentPort:
// const agents: AgentPort[] = [createOpencodeAgent({ baseUrl })]

export const store = createAppStore({ projectPort, previewPort, prefs });

/** La UI registra el iframe; el adapter no toca React. */
export function setFrameEl(el: HTMLIFrameElement | null): void {
  frameRef.current = el;
}
