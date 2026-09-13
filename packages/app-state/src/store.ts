// createAppStore — ARCHITECTURE §6/§9. app-state es el único lugar que
// importa ports y los llama. Los adapters se inyectan desde el
// composition root (apps/desktop/src/composition.ts). Sin React aquí.

import { createStore } from "zustand/vanilla";
import type {
  OverlayOverride,
  Scope,
  TweakProp,
} from "@steer/domain";
import type { PreviewPort, ProjectMeta, ProjectPort } from "@steer/ports";
import type { ProjectSlice } from "./project";
import type { TweakDraft } from "./selection";
import { findTweak, initialSelectionSlice, type SelectionSlice } from "./selection";
import { initialPreviewSlice, type PreviewSlice } from "./preview";

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
    /** UX §5.3: Instancia vs Componente. */
    setScope(scope: Scope): void;
    /** UX §5.4: cambio de tweak → override inmediato + replace-by-prop. */
    setTweak(prop: TweakProp, to: string): void;
    resetTweak(prop: TweakProp): void;
    resetAllTweaks(): void;
    /** UX §7: ⌘Z — undo del último override local. */
    undoLastTweak(): void;
  };

export type SteerStore = ReturnType<typeof createAppStore>;

function buildOverrides(tweaks: TweakDraft[]): OverlayOverride[] {
  return tweaks.map((t) => ({
    steerId: t.steerId,
    prop: t.prop,
    value: t.to,
    source: t.selection.source,
    scope: t.scope,
  }));
}

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
      set({ selection: null, selectedId: null });
    },

    setScope(scope) {
      set({ scope });
    },

    setTweak(prop, to) {
      const { selection, selectedId, scope, tweaks, tweakLog } = get();
      if (selection === null || selectedId === null) return;
      const existing = findTweak(tweaks, selectedId, scope, prop);
      const draft: TweakDraft = existing
        ? { ...existing, to }
        : { steerId: selectedId, scope, selection, prop, from: selection.computed[prop] ?? to, to };

      const nextTweaks = existing
        ? tweaks.map((t) => (t === existing ? draft : t))
        : [...tweaks, draft];
      const nextLog = existing
        ? tweakLog
        : [...tweakLog, { steerId: selectedId, scope, prop }];

      set({ tweaks: nextTweaks, tweakLog: nextLog });
      previewPort.setOverrides(buildOverrides(nextTweaks));
    },

    resetTweak(prop) {
      const { selectedId, scope, tweaks } = get();
      if (selectedId === null) return;
      const nextTweaks = tweaks.filter(
        (t) => !(t.steerId === selectedId && t.scope === scope && t.prop === prop),
      );
      set({ tweaks: nextTweaks });
      previewPort.setOverrides(buildOverrides(nextTweaks));
    },

    resetAllTweaks() {
      set({ tweaks: [], tweakLog: [] });
      previewPort.clearOverrides();
    },

    undoLastTweak() {
      const { tweaks, tweakLog } = get();
      const last = tweakLog[tweakLog.length - 1];
      if (last === undefined) return;
      const draft = findTweak(tweaks, last.steerId, last.scope, last.prop);
      const nextTweaks = draft
        ? tweaks.filter((t) => t !== draft)
        : tweaks;
      set({
        tweaks: nextTweaks,
        tweakLog: tweakLog.slice(0, -1),
      });
      previewPort.setOverrides(buildOverrides(nextTweaks));
    },
  }));

  // Mensajes del bridge → estado (ARCHITECTURE §9: previewSlice habla
  // con PreviewPort; select/hover/navigate llegan por acá).
  previewPort.subscribe((msg) => {
    switch (msg.type) {
      case "steer:ready":
        // Iframe nuevo (reload/remount): reenviar el modo Inspect vigente.
        // Los overrides NO se reenvían: son efímeros y mueren con el
        // documento (criterio de hecho de la Fase D).
        previewPort.setInspect(store.getState().inspectOn);
        break;
      case "steer:select":
        store.setState({
          selection: msg.selection,
          selectedId: msg.id,
          scope: "instance",
        });
        break;
      case "steer:hover":
        store.setState({ hoverSelection: msg.selection });
        break;
      case "steer:navigate":
        // UX §5.9: la cola de intents (Fase E) se conservará; los drafts
        // de override son del documento anterior y se limpian.
        store.setState({ selection: null, selectedId: null, hoverSelection: null, tweaks: [], tweakLog: [] });
        break;
      default:
        break;
    }
  });

  return store;
}
