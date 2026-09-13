// createAppStore — ARCHITECTURE §6/§9. app-state es el único lugar que
// importa ports y los llama. Los adapters se inyectan desde el
// composition root (apps/desktop/src/composition.ts). Sin React aquí.

import { createStore } from "zustand/vanilla";
import type {
  OverlayOverride,
  Scope,
  TweakProp,
} from "@steer/domain";
import {
  buildApplyPayload,
  enqueueComment,
  enqueueTweak,
  removeIntent,
} from "@steer/domain";
import type { PreviewPort, ProjectMeta, ProjectPort } from "@steer/ports";
import type { ProjectSlice } from "./project";
import type { TweakDraft } from "./selection";
import { findTweak, initialSelectionSlice, type SelectionSlice } from "./selection";
import { initialPreviewSlice, type PreviewSlice } from "./preview";
import { initialIntentsSlice, type IntentsSlice, type TranscriptBlock } from "./intents";

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
  SelectionSlice &
  IntentsSlice & {
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
    /** UX §5.5: encola el comment y ancla el pin al nodo. */
    queueComment(body: string): void;
    removeQueued(intentId: string): void;
    /** UX §5.6: lote → transcript. Fase E: sin llamada a agente. */
    applyQueue(): void;
    /** UX §5.6: Vaciar cola. */
    clearQueue(): void;
    setDraftNote(text: string): void;
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

/** Clave de nodo estable entre drafts e intents: el source anclado. */
function locKey(s: { source: { file: string; line: number; col: number } }): string {
  return `${s.source.file}:${s.source.line}:${s.source.col}`;
}

export function createAppStore({ projectPort, previewPort, prefs }: AppDeps) {
  const store = createStore<SteerState>()((set, get) => ({
    projectStatus: "empty",
    projectMeta: null,
    projectError: null,
    lastProject: null,
    ...initialPreviewSlice,
    ...initialSelectionSlice,
    ...initialIntentsSlice,

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
        ...initialIntentsSlice,
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
        ...initialIntentsSlice,
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
      const { selection, selectedId, scope, tweaks, tweakLog, queue } = get();
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

      set({
        tweaks: nextTweaks,
        tweakLog: nextLog,
        // Cola de intents: replace-by-prop en domain (TRD §5).
        queue: enqueueTweak(queue, {
          selection,
          scope,
          prop,
          from: draft.from,
          to: draft.to,
        }),
      });
      previewPort.setOverrides(buildOverrides(nextTweaks));
    },

    resetTweak(prop) {
      const { selectedId, scope, tweaks, queue, selection } = get();
      if (selectedId === null) return;
      const nextTweaks = tweaks.filter(
        (t) => !(t.steerId === selectedId && t.scope === scope && t.prop === prop),
      );
      const nextQueue =
        selection === null
          ? queue
          : queue.filter(
              (i) =>
                !(
                  i.kind === "tweak" &&
                  i.prop === prop &&
                  i.scope === scope &&
                  locKey(i.selection) === locKey(selection)
                ),
            );
      set({ tweaks: nextTweaks, queue: nextQueue });
      previewPort.setOverrides(buildOverrides(nextTweaks));
    },

    resetAllTweaks() {
      // Los comments encolados no se tocan: reset solo afecta tweaks.
      set((s) => ({
        tweaks: [],
        tweakLog: [],
        queue: s.queue.filter((i) => i.kind !== "tweak"),
      }));
      previewPort.clearOverrides();
    },

    undoLastTweak() {
      const { tweaks, tweakLog, queue } = get();
      const last = tweakLog[tweakLog.length - 1];
      if (last === undefined) return;
      const draft = findTweak(tweaks, last.steerId, last.scope, last.prop);
      const nextTweaks = draft
        ? tweaks.filter((t) => t !== draft)
        : tweaks;
      const nextQueue = draft
        ? queue.filter(
            (i) =>
              !(
                i.kind === "tweak" &&
                i.prop === draft.prop &&
                i.scope === draft.scope &&
                locKey(i.selection) === locKey(draft.selection)
              ),
          )
        : queue;
      set({
        tweaks: nextTweaks,
        tweakLog: tweakLog.slice(0, -1),
        queue: nextQueue,
      });
      previewPort.setOverrides(buildOverrides(nextTweaks));
    },

    queueComment(body) {
      const { selection, selectedId, scope, queue, nextPin } = get();
      if (selection === null || selectedId === null) return;
      const trimmed = body.trim();
      if (trimmed === "") return; // pin vacío no se encola (UX §5.5)
      const { queue: nextQueue, intent } = enqueueComment(queue, {
        selection,
        scope,
        body: trimmed,
        pin: nextPin,
      });
      set({ queue: nextQueue, nextPin: nextPin + 1 });
      previewPort.addPin(intent.id, selectedId, nextPin);
    },

    removeQueued(intentId) {
      const intent = get().queue.find((i) => i.id === intentId);
      set((s) => ({ queue: removeIntent(s.queue, intentId) }));
      if (intent !== undefined && intent.kind === "comment") {
        previewPort.removePin(intentId);
      }
    },

    applyQueue() {
      const { queue, draftNote, projectMeta, selection } = get();
      if (queue.length === 0) return; // UX §5.6: sin cola no hay apply
      const payload = buildApplyPayload(queue, projectMeta?.root ?? "", {
        route: selection?.route ?? null,
        userNote: draftNote.trim() === "" ? undefined : draftNote.trim(),
      });
      const blocks: TranscriptBlock[] = [];
      if (payload.userNote !== undefined) {
        blocks.push({ kind: "user", id: crypto.randomUUID(), text: payload.userNote });
      }
      blocks.push({ kind: "batch", id: crypto.randomUUID(), payload });
      set((s) => ({
        transcript: [...s.transcript, ...blocks],
        queue: [],
        draftNote: "",
      }));
      // Fase E: sin agente. Los overrides quedan pintados; la F los
      // deja hasta `done` del AgentPort y entonces limpia (UX §5.6).
    },

    clearQueue() {
      get()
        .queue.filter((i) => i.kind === "comment")
        .forEach((i) => previewPort.removePin(i.id));
      set({ queue: [] });
    },

    setDraftNote(text) {
      set({ draftNote: text });
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
