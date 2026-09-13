// Wrappers finos de Tauri — ARCHITECTURE §3. Los componentes React nunca
// invocan `invoke` de negocio; esto implementa ProjectPort para el
// composition root. createStart llega en Fase G.

import { invoke } from "@tauri-apps/api/core";
import type { ProjectMeta, ProjectPort } from "@steer/ports";

function unimplemented(what: string): never {
  throw new Error(`No implementado todavía: ${what}`);
}

export function createTauriProjectPort(): ProjectPort {
  return {
    open: (path) => invoke<ProjectMeta>("project_open", { path }),
    startDev: (path) =>
      invoke<{ url: string; spawned: boolean }>("project_dev_start", { path }),
    stopDev: (path) => invoke<void>("project_dev_stop", { path }),
    createStart: async () => unimplemented("project_create_start (Fase G)"),
  };
}
