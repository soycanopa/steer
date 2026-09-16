import type { ProjectMeta, ProjectRoute } from "@steer/ports";

// projectSlice → ProjectPort (ARCHITECTURE §9). Habla con el puerto,
// no con una implementación.
export type ProjectStatus = "empty" | "creating" | "opening" | "open" | "error";

export type CreateProgressState = {
  percent: number;
  message: string;
};

export type ProjectSlice = {
  projectStatus: ProjectStatus;
  projectMeta: ProjectMeta | null;
  projectError: string | null;
  lastProject: string | null;
  /** Rutas de `src/routes` (TanStack Start). */
  projectRoutes: ProjectRoute[];
  /** Proyectos abiertos en tabs (orden de apertura). */
  openProjectTabs: string[];
  /** Proyectos recientes (más nuevo primero, incluye cerrados). */
  recentProjects: string[];
  /** Thumbnail del preview por root (data URL). */
  projectThumbnails: Record<string, string>;
  /** URL live del dev server por root (home). */
  recentPreviewUrls: Record<string, string>;
  /** Progreso del scaffold TanStack Start (null si no está creando). */
  createProgress: CreateProgressState | null;
};
