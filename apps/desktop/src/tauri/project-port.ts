// Wrappers finos de Tauri — ARCHITECTURE §3. Los componentes React nunca
// invocan `invoke` de negocio; esto implementa ProjectPort para el
// composition root. Los métodos que faltan corresponden a Fase B (dev
// server) y Fase G (create Start).

import { invoke } from "@tauri-apps/api/core";
import type { ProjectMeta, ProjectPort } from "@steer/ports";

function unimplemented(what: string): never {
  throw new Error(`No implementado todavía: ${what}`);
}

export function createTauriProjectPort(): ProjectPort {
  return {
    open: (path) => invoke<ProjectMeta>("project_open", { path }),
    createStart: async () => unimplemented("project_create_start (Fase G)"),
    startDev: async () => unimplemented("project_dev_start (Fase B)"),
    stopDev: async () => unimplemented("project_dev_stop (Fase B)"),
  };
}
