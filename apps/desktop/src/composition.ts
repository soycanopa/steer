// Composition root — ARCHITECTURE §6. ÚNICO archivo con permiso de
// importar UI + state + adapters + wrappers Tauri. Cualquier import de
// un adapter desde un componente React es un bug.

import { createAppStore } from "@steer/app-state";
import {
  AGENT_OPENCODE_DEFAULT_URL,
  createOpencodeAgent,
  type OpencodeAgentPort,
} from "@steer/agent-opencode";
import type { AgentPort } from "@steer/ports";
import { ensureOpencode } from "./tauri/opencode-runtime";
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

// Fase F: adapter OpenCode registrado aquí (y solo aquí).
// Un provider nuevo = packages/agent-<id> + una línea acá.
const opencodeAgent: OpencodeAgentPort = createOpencodeAgent({
  baseUrl: AGENT_OPENCODE_DEFAULT_URL,
});

const agents: AgentPort[] = [
  {
    ...opencodeAgent,
    async ensureRuntime(directory) {
      const info = await ensureOpencode(directory);
      opencodeAgent.setBaseUrl(info.baseUrl);
    },
  },
];

// Conservar el store entre HMR de Vite; sin esto el proyecto “desaparece” al
// recargar módulos en dev aunque prefs.json siga teniendo lastProject.
const hot = import.meta.hot;
export const store =
  hot?.data.store ??
  createAppStore({ projectPort, previewPort, prefs, agents });
if (hot) hot.data.store = store;

/** La UI registra el iframe; el adapter no toca React. */
export function setFrameEl(el: HTMLIFrameElement | null): void {
  frameRef.current = el;
  if (el?.contentWindow) {
    previewPort.flushPending();
    const st = store.getState();
    previewPort.setMode(st.mode);
    previewPort.setInspect(st.inspectOn);
  }
}
