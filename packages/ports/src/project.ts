// ProjectPort — ARCHITECTURE §4 / TRD §9. El adapter vive en
// apps/desktop/src/tauri/project-port.ts (invoke). Rust nunca conoce Intent.

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";
export type FrameworkGuess = "tanstack-start" | "unknown";

export type ProjectMeta = {
  root: string;
  name: string;
  packageManager: PackageManager;
  hasDevtoolsVite: boolean;
  frameworkGuess: FrameworkGuess;
};

/** Ruta de archivo Start (`src/routes/…`) → pathname del router. */
export type ProjectRoute = {
  path: string;
  label: string;
  file: string;
};

export type CreateProgress = {
  percent: number;
  message: string;
};

export type VcsBranches = {
  /** Branch actual; null si el directorio no es un repo git. */
  current: string | null;
  branches: string[];
};

export type ProjectPort = {
  open(path: string): Promise<ProjectMeta>;
  /** Instala y configura @tanstack/devtools-vite si falta (data-tsd-source). */
  ensureDevtools(path: string): Promise<ProjectMeta>;
  listRoutes(path: string): Promise<ProjectRoute[]>;
  createStart(
    parentDir: string,
    name: string,
    onProgress?: (progress: CreateProgress) => void,
  ): Promise<ProjectMeta>;
  startDev(path: string): Promise<{ url: string; spawned: boolean }>;
  /**
   * URL del dev server si está vivo (sin spawnear). Lo usa el home para
   * previews live de los recientes. `null` si no responde.
   */
  previewUrl(path: string): Promise<string | null>;
  /** Apaga solo el proxy del preview; el dev server sigue vivo. */
  detachPreview(): Promise<void>;
  stopDev(path: string): Promise<void>;
  /** Branch actual + lista local. Opcional: host sin git => current null. */
  vcsBranches?(path: string): Promise<VcsBranches>;
  /** Hace switch de branch (git switch). Errores de git suben tal cual. */
  vcsSwitchBranch?(path: string, branch: string): Promise<void>;
};
