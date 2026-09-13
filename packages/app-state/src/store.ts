// createAppStore — ARCHITECTURE §6/§9. app-state es el único lugar que
// importa ports y los llama. Los adapters se inyectan desde el
// composition root (apps/desktop/src/composition.ts). Sin React aquí.

import { createStore } from "zustand/vanilla";
import type { ProjectMeta, ProjectPort } from "@steer/ports";
import type { ProjectSlice } from "./project";
import { initialPreviewSlice, type PreviewSlice } from "./preview";

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

export type SteerState = ProjectSlice &
  PreviewSlice & {
    bootstrap(): Promise<void>;
    openProject(path: string): Promise<void>;
    startPreview(): Promise<void>;
    stopPreview(): Promise<void>;
    reloadPreview(): void;
  };

export type SteerStore = ReturnType<typeof createAppStore>;

export function createAppStore({ projectPort, prefs }: AppDeps) {
  return createStore<SteerState>()((set, get) => ({
    projectStatus: "empty",
    projectMeta: null,
    projectError: null,
    lastProject: null,
    ...initialPreviewSlice,

    async bootstrap() {
      set({ lastProject: await prefs.getLastProject() });
    },

    async openProject(path) {
      // Si había un dev server corriendo de otro proyecto, pararlo.
      const { previewStatus, previewUrl } = get();
      if (previewStatus !== "idle" && previewUrl !== null) {
        await get().stopPreview();
      }

      set({
        projectStatus: "opening",
        projectError: null,
        ...initialPreviewSlice,
      });
      try {
        const meta: ProjectMeta = await projectPort.open(path);
        set({ projectStatus: "open", projectMeta: meta, lastProject: path });
        await prefs.setLastProject(path);
        // UX.md §5.2: abierto → arrancar o reusar dev server.
        void get().startPreview();
      } catch (err) {
        set({
          projectStatus: "error",
          projectError: err instanceof Error ? err.message : String(err),
        });
      }
    },

    async startPreview() {
      const meta = get().projectMeta;
      if (meta === null || get().previewStatus === "starting") {
        return;
      }
      set({ previewStatus: "starting", previewError: null });
      try {
        const { url } = await projectPort.startDev(meta.root);
        set({ previewStatus: "live", previewUrl: url });
      } catch (err) {
        set({
          previewStatus: "down",
          previewError: err instanceof Error ? err.message : String(err),
          previewUrl: null,
        });
      }
    },

    async stopPreview() {
      const meta = get().projectMeta;
      if (meta !== null) {
        try {
          await projectPort.stopDev(meta.root);
        } catch {
          // stop es best-effort; el estado local sí se limpia.
        }
      }
      set(initialPreviewSlice);
    },

    reloadPreview() {
      set((state) => ({ reloadNonce: state.reloadNonce + 1 }));
    },
  }));
}
