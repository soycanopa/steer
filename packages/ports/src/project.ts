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

export type ProjectPort = {
  open(path: string): Promise<ProjectMeta>;
  listRoutes(path: string): Promise<ProjectRoute[]>;
  createStart(parentDir: string, name: string): Promise<ProjectMeta>;
  startDev(path: string): Promise<{ url: string; spawned: boolean }>;
  stopDev(path: string): Promise<void>;
};
