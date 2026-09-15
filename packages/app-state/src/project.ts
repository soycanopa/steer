import type { ProjectMeta, ProjectRoute } from "@steer/ports";

// projectSlice → ProjectPort (ARCHITECTURE §9). Habla con el puerto,
// no con una implementación.
export type ProjectStatus = "empty" | "opening" | "open" | "error";

export type ProjectSlice = {
  projectStatus: ProjectStatus;
  projectMeta: ProjectMeta | null;
  projectError: string | null;
  lastProject: string | null;
  /** Rutas de `src/routes` (TanStack Start). */
  projectRoutes: ProjectRoute[];
};
