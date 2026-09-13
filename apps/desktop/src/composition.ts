// Composition root — ARCHITECTURE §6. ÚNICO archivo con permiso de
// importar UI + state + adapters + wrappers Tauri. Cualquier import de
// un adapter desde un componente React es un bug.

import { createAppStore } from "@steer/app-state";
import { createPrefs } from "./tauri/prefs";
import { createTauriProjectPort } from "./tauri/project-port";

const projectPort = createTauriProjectPort();
const prefs = createPrefs();

// Fase F registra aquí los AgentPort:
// const agents: AgentPort[] = [createOpencodeAgent({ baseUrl })]

export const store = createAppStore({ projectPort, prefs });
