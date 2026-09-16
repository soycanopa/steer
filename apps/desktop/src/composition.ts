// Composition root — ARCHITECTURE §6. ÚNICO archivo con permiso de
// importar UI + state + adapters + wrappers Tauri. Cualquier import de
// un adapter desde un componente React es un bug.

import { createAppStore, type SteerStore } from "@steer/app-state";
import {
  AGENT_OPENCODE_DEFAULT_URL,
  createOpencodeAgent,
  type OpencodeAgentPort,
} from "@steer/agent-opencode";
import {
  AGENT_CURSOR_DEFAULT_URL,
  createCursorAgent,
  type CursorAgentPort,
} from "@steer/agent-cursor";
import {
  AGENT_GROK_DEFAULT_URL,
  createGrokAgent,
  type GrokAgentPort,
} from "@steer/agent-grok";
import {
  AGENT_ANTIGRAVITY_DEFAULT_URL,
  createAntigravityAgent,
  type AntigravityAgentPort,
} from "@steer/agent-antigravity";
import type { AgentPort } from "@steer/ports";
import { ensureAntigravity } from "./tauri/antigravity-runtime";
import { ensureCursor } from "./tauri/cursor-runtime";
import { ensureGrok } from "./tauri/grok-runtime";
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

const cursorAgent: CursorAgentPort = createCursorAgent({
  baseUrl: AGENT_CURSOR_DEFAULT_URL,
});

const grokAgent: GrokAgentPort = createGrokAgent({
  baseUrl: AGENT_GROK_DEFAULT_URL,
});

const antigravityAgent: AntigravityAgentPort = createAntigravityAgent({
  baseUrl: AGENT_ANTIGRAVITY_DEFAULT_URL,
});

const agents: AgentPort[] = [
  {
    ...opencodeAgent,
    async ensureRuntime(directory) {
      const info = await ensureOpencode(directory);
      opencodeAgent.setBaseUrl(info.baseUrl);
    },
  },
  {
    ...cursorAgent,
    async ensureRuntime(_directory) {
      const info = await ensureCursor();
      cursorAgent.setBaseUrl(info.baseUrl);
      await cursorAgent.login();
    },
  },
  {
    ...grokAgent,
    async ensureRuntime(_directory) {
      const info = await ensureGrok();
      grokAgent.setBaseUrl(info.baseUrl);
    },
  },
  {
    ...antigravityAgent,
    async ensureRuntime(_directory) {
      const info = await ensureAntigravity();
      antigravityAgent.setBaseUrl(info.baseUrl);
    },
  },
];

// Conservar el store entre HMR de Vite; sin esto el proyecto “desaparece” al
// recargar módulos en dev aunque prefs.json siga teniendo lastProject.
const hot = import.meta.hot;
export const store: SteerStore =
  (hot?.data.store as SteerStore | undefined) ??
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
