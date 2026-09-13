// Composition root — ARCHITECTURE §6. ÚNICO archivo con permiso de
// importar UI + state + adapters + wrappers Tauri. Cualquier import de
// un adapter desde un componente React es un bug.

import { createAppStore } from "@steer/app-state";
import { createPrefs } from "./tauri/prefs";
import { createIframePreviewPort } from "./tauri/preview-port";
import { createTauriProjectPort } from "./tauri/project-port";

// Ref al iframe del preview; el adapter lo lee al postear/suscribir.
const frameRef: { current: HTMLIFrameElement | null } = { current: null };

// Anillo de debug del canal steer:* (TRD §15) — lo muestra ⌘D.
const debugLines: string[] = [];
export function pushDebug(line: string): void {
  const time = new Date().toLocaleTimeString();
  debugLines.push(`${time}  ${line}`);
  if (debugLines.length > 40) debugLines.shift();
}
export function getDebugLines(): string[] {
  return [...debugLines];
}

const projectPort = createTauriProjectPort();
const previewPort = createIframePreviewPort(() => frameRef.current, pushDebug);
const prefs = createPrefs();

// Fase F registra aquí los AgentPort:
// const agents: AgentPort[] = [createOpencodeAgent({ baseUrl })]

export const store = createAppStore({ projectPort, previewPort, prefs });

/** La UI registra el iframe; el adapter no toca React. */
export function setFrameEl(el: HTMLIFrameElement | null): void {
  frameRef.current = el;
}
