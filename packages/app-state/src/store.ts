// createAppStore — ARCHITECTURE §6/§9. app-state es el único lugar que
// importa ports y los llama. Los adapters se inyectan desde el
// composition root (apps/desktop/src/composition.ts). Sin React aquí.

import { createStore } from "zustand/vanilla";
import type { ProjectMeta, ProjectPort } from "@steer/ports";
import type { ProjectSlice } from "./project";

// Persistencia de prefs vía host (TRD §2). El adapter real vive en
// apps/desktop/src/tauri/prefs.ts; app-state no conoce Tauri.
export type PrefsApi = {
  getLastProject(): Promise<string | null>;
  setLastProject(path: string): Promise<void>;
};

export type AppDeps = {
  projectPort: ProjectPort;
  prefs: PrefsApi;
};

export type SteerState = ProjectSlice & {
  bootstrap(): Promise<void>;
  openProject(path: string): Promise<void>;
};

export type SteerStore = ReturnType<typeof createAppStore>;

export function createAppStore({ projectPort, prefs }: AppDeps) {
  return createStore<SteerState>()((set) => ({
    projectStatus: "empty",
    projectMeta: null,
    projectError: null,
    lastProject: null,

    async bootstrap() {
      set({ lastProject: await prefs.getLastProject() });
    },

    async openProject(path) {
      set({ projectStatus: "opening", projectError: null });
      try {
        const meta: ProjectMeta = await projectPort.open(path);
        set({ projectStatus: "open", projectMeta: meta, lastProject: path });
        await prefs.setLastProject(path);
      } catch (err) {
        set({
          projectStatus: "error",
          projectError: err instanceof Error ? err.message : String(err),
        });
      }
    },
  }));
}
