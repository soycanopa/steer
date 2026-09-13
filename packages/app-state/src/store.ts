// createAppStore — ARCHITECTURE §6/§9. app-state es el único lugar que
// importa ports y los llama. Los adapters se inyectan desde el
// composition root (apps/desktop/src/composition.ts). Sin React aquí.

import { createStore } from "zustand/vanilla";
import type { PreviewPort, ProjectMeta, ProjectPort } from "@steer/ports";
import type { ProjectSlice } from "./project";
import { initialPreviewSlice, type PreviewSlice } from "./preview";
import { initialSelectionSlice, type SelectionSlice } from "./selection";

// Persistencia de prefs vía host (TRD §2). El adapter real vive en
// apps/desktop/src/tauri/prefs.ts; app-state no conoce Tauri.
export type PrefsApi = {
  getLastProject(): Promise<string | null>;
  setLastProject(path: string): Promise<void>;
};

export type AppDeps = {
  projectPort: ProjectPort;
  previewPort: PreviewPort;
  prefs: PrefsApi;
};

export type SteerState = ProjectSlice &
  PreviewSlice &
  SelectionSlice & {
    bootstrap(): Promise<void>;
    openProject(path: string): Promise<void>;
    startPreview(): Promise<void>;
    stopPreview(): Promise<void>;
    reloadPreview(): void;
    /** UX §4: modo Inspect — clicks seleccionan en vez de navegar. */
    toggleInspect(on?: boolean): void;
    /** UX §5.3: Esc o click vacío deselecciona, no apaga Inspect. */
    deselect(): void;
  };

export type SteerStore = ReturnType<typeof createAppStore>;

export function createAppStore({ projectPort, previewPort, prefs }: AppDeps) {
  const store = createStore<SteerState>()((set, get) => ({
    projectStatus: "empty",
    projectMeta: null,
    projectError: null,
    lastProject: null,
    ...initialPreviewSlice,
    ...initialSelectionSlice,

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
        ...initialSelectionSlice,
      });
      try {
        const meta: ProjectMeta = await projectPort.open(path);
        // "starting" ya en este set: sin flash de estado idle (UX §5.2).
        set({
          projectStatus: "open",
          projectMeta: meta,
          lastProject: path,
          previewStatus: "starting",
          previewError: null,
        });
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
      if (meta === null) {
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
      set({
        ...initialPreviewSlice,
        ...initialSelectionSlice,
      });
    },

    reloadPreview() {
      set((state) => ({ reloadNonce: state.reloadNonce + 1 }));
    },

    toggleInspect(on) {
      const next = on ?? !get().inspectOn;
      set({ inspectOn: next });
      previewPort.setInspect(next);
    },

    deselect() {
      set({ selection: null });
    },
  }));
  // Mensajes del bridge → estado (ARCHITECTURE §9: previewSlice habla
  // con PreviewPort; select/hover/navigate llegan por acá).
  previewPort.subscribe((msg) => {
    switch (msg.type) {
      case "steer:ready":
        // Iframe nuevo (reload/remount): reenviar el modo Inspect vigente.
        previewPort.setInspect(store.getState().inspectOn);
        break;
      case "steer:select":
        store.setState({ selection: msg.selection });
        break;
      case "steer:hover":
        store.setState({ hoverSelection: msg.selection });
        break;
      case "steer:navigate":
        // UX §5.9: overrides y selección se limpian; la cola (Fase E)
        // se conservará. El iframe navega por su cuenta: no remontar.
        store.setState({ selection: null, hoverSelection: null });
        break;
      default:
        break;
    }
  });

  return store;
}
