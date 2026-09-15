// createAppStore — ARCHITECTURE §6/§9. app-state es el único lugar que
// importa ports y los llama. Los adapters se inyectan desde el
// composition root (apps/desktop/src/composition.ts). Sin React aquí.

import { createStore } from "zustand/vanilla";
import type {
  Intent,
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
import type {
  AgentMode,
  AgentPort,
  LayerNode,
  ModelRef,
  PreviewPort,
  ProjectMeta,
  ProjectPort,
  SessionId,
} from "@steer/ports";
import type { ProjectSlice } from "./project";
import type { PreviewMode, TweakDraft } from "./selection";
import { findTweak, initialSelectionSlice, type SelectionSlice } from "./selection";
import { initialPreviewSlice, type PreviewSlice } from "./preview";
import {
  initialIntents,
  newChatSession,
  type ChatAttachment,
  type IntentsSlice,
  type TranscriptBlock,
  type TranscriptTool,
} from "./intents";
import {
  initialAgentSlice,
  pickDefaultModel,
  type AgentSlice,
  type PermissionPolicy,
} from "./agent";

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
  /** AgentPorts inyectados desde composition. UI no conoce estos tipos. */
  agents: AgentPort[];
};

export type SteerState = ProjectSlice &
  PreviewSlice &
  SelectionSlice &
  IntentsSlice &
  AgentSlice & {
    bootstrap(): Promise<void>;
    openProject(path: string): Promise<void>;
    startPreview(): Promise<void>;
    stopPreview(): Promise<void>;
    reloadPreview(): void;
    /** UX §4: modo del toolbar del preview. */
    setMode(mode: PreviewMode): void;
    /** Compat: I alterna inspect ↔ interact. */
    toggleInspect(on?: boolean): void;
    /** Cámara: captura el preview y la adjunta al chat. */
    capturePreview(): void;
    addAttachment(att: Omit<ChatAttachment, "id">): void;
    removeAttachment(id: string): void;
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
    /** Edita el body de un comment ya encolado y re-sincroniza el pin. */
    updateComment(intentId: string, body: string, steerId?: string): void;
    /** Abre el popover del pin en el preview. */
    focusComment(intentId: string): void;
    removeQueued(intentId: string): void;
    /** UX §5.6 / Fase F: lote → AgentPort → clearOverrides en done. */
    applyQueue(): Promise<void>;
    /** Fase F: abortar el turno en curso. */
    abortTurn(): Promise<void>;
    /** Fase F: health + listModels del AgentPort seleccionado. */
    refreshAgent(): Promise<void>;
    /** Fase F: elegir modelo de listModels(). */
    setModel(model: ModelRef): void;
    /** ask | plan | agent (OpenCode: build). */
    setAgentMode(mode: AgentMode): void;
    setPermissionPolicy(policy: PermissionPolicy): void;
    /** Sesiones OpenCode del directorio del proyecto. */
    refreshAgentSessions(): Promise<void>;
    /** Une la sesión de chat local con una sesión OpenCode existente. */
    bindAgentSession(agentSessionId: SessionId): void;
    /** UX §5.6: Vaciar cola. */
    clearQueue(): void;
    setDraftNote(text: string): void;
    /** Columna de chat: mostrar/ocultar (toggle del titlebar). */
    toggleChat(on?: boolean): void;
    /** Panel de capas: mostrar/ocultar (toggle del titlebar). */
    toggleLayers(on?: boolean): void;
    /** Selecciona un nodo desde el árbol de capas. */
    selectLayer(id: string): void;
    /** Historial: crear sesión nueva y activarla. */
    newSession(): void;
    selectSession(id: string): void;
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

function findTreeNodeBySource(
  nodes: LayerNode[] | null,
  key: string,
): LayerNode | null {
  if (nodes == null) return null;
  for (const n of nodes) {
    if (n.source === key) return n;
    const hit = findTreeNodeBySource(n.children, key);
    if (hit !== null) return hit;
  }
  return null;
}

type AgentBlockPatch = Partial<{
  text: string;
  tools: TranscriptTool[];
  status: "streaming" | "done" | "error";
}>;

/** Mutación pura sobre sessions[]: parchea un bloque agent por id. */
function setAgentBlock(
  store: SteerStore,
  blockId: string,
  patch: AgentBlockPatch,
): void {
  store.setState((s) => ({
    sessions: s.sessions.map((sess) =>
      sess.id !== s.activeSessionId
        ? sess
        : {
            ...sess,
            blocks: sess.blocks.map((b) =>
              b.kind === "agent" && b.id === blockId ? { ...b, ...patch } : b,
            ),
          },
    ),
  }));
}

/** Índice del último tool start (ES2022: sin findLastIndex). */
function findLastStartIndex(
  tools: TranscriptTool[],
  name: string,
): number {
  for (let i = tools.length - 1; i >= 0; i -= 1) {
    const t = tools[i];
    if (t !== undefined && t.name === name && t.status === "start") return i;
  }
  return -1;
}

/** AGENTS regla 6: Apply solo con data-tsd-source real (file !== ""). */
function queueHasMissingSource(queue: Intent[]): boolean {
  return queue.some(
    (i) =>
      (i.kind === "tweak" || i.kind === "comment" || i.kind === "select") &&
      i.selection.source.file === "",
  );
}

export function createAppStore({ projectPort, previewPort, prefs, agents }: AppDeps) {
  const primaryAgent = agents[0] ?? null;

  /** Actualiza un bloque `agent` streaming en la sesión activa. */
  function patchAgentBlock(
    blockId: string,
    patch: Partial<{
      text: string;
      tools: TranscriptTool[];
      status: "streaming" | "done" | "error";
    }>,
  ): void {
    setAgentBlock(store, blockId, patch);
  }

  const store = createStore<SteerState>()((set, get) => ({
    projectStatus: "empty",
    projectMeta: null,
    projectError: null,
    lastProject: null,
    ...initialPreviewSlice,
    ...initialSelectionSlice,
    ...initialIntents(),
    ...initialAgentSlice(agents),

    async bootstrap() {
      set({ lastProject: await prefs.getLastProject() });
      await get().refreshAgent();
      if (get().agentStatus === "down") {
        for (const ms of [1200, 2400]) {
          await new Promise((r) => setTimeout(r, ms));
          await get().refreshAgent();
          if (get().agentStatus === "up") break;
        }
      }
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
        ...initialIntents(),
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
        // Sesiones OpenCode del directorio (picker del chat).
        void get().refreshAgentSessions();
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
        ...initialIntents(),
      });
    },

    reloadPreview() {
      set((state) => ({ reloadNonce: state.reloadNonce + 1 }));
    },

    setMode(mode) {
      const inspect = mode !== "interact";
      set({ mode, inspectOn: inspect });
      previewPort.setMode(mode);
      // Compat con bridges viejos / inspect-on explícito.
      previewPort.setInspect(inspect);
    },

    toggleInspect(on) {
      const next = on ?? !get().inspectOn;
      get().setMode(next ? "inspect" : "interact");
    },

    capturePreview() {
      previewPort.capture();
    },

    addAttachment(att) {
      const item: ChatAttachment = { id: crypto.randomUUID(), ...att };
      set((s) => ({
        draftAttachments: [...s.draftAttachments, item],
      }));
    },

    removeAttachment(id) {
      set((s) => ({
        draftAttachments: s.draftAttachments.filter((a) => a.id !== id),
      }));
    },

    deselect() {
      set({ selection: null, selectedId: null });
    },

    setScope(scope) {
      set({ scope });
    },

    setTweak(prop, to) {
      const { selection, selectedId, scope, tweaks, tweakLog, queue } = get();
      if (selection === null || selectedId === null) {
        console.warn("steer:setTweak sin selección activa", { prop, selectedId });
        return;
      }
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
      if (selection === null || selectedId === null) {
        console.warn("steer:queueComment sin selección", {
          hasSelection: selection !== null,
          hasId: selectedId !== null,
        });
        return;
      }
      const trimmed = body.trim();
      if (trimmed === "") return;
      const { queue: nextQueue, intent } = enqueueComment(queue, {
        selection,
        scope,
        body: trimmed,
        pin: nextPin,
      });
      set({ queue: nextQueue, nextPin: nextPin + 1 });
      previewPort.addPin(intent.id, selectedId, nextPin, trimmed);
    },

    updateComment(intentId, body, steerId) {
      const trimmed = body.trim();
      if (trimmed === "") return;
      const existing = get().queue.find(
        (i) => i.id === intentId && i.kind === "comment",
      );
      if (existing === undefined || existing.kind !== "comment") return;
      set((s) => ({
        queue: s.queue.map((i) =>
          i.id === intentId && i.kind === "comment"
            ? { ...i, body: trimmed }
            : i,
        ),
      }));
      const sid = steerId ?? get().selectedId;
      if (sid) {
        previewPort.addPin(intentId, sid, existing.pin, trimmed);
      }
    },

    focusComment(intentId) {
      previewPort.focusPin(intentId);
    },

    removeQueued(intentId) {
      const intent = get().queue.find((i) => i.id === intentId);
      set((s) => ({ queue: removeIntent(s.queue, intentId) }));
      if (intent !== undefined && intent.kind === "comment") {
        previewPort.removePin(intentId);
      }
    },

    async applyQueue() {
      const {
        queue,
        draftNote,
        draftAttachments,
        projectMeta,
        selection,
        agentBusy,
        selectedModel,
      } = get();
      if (agentBusy) return;
      const note = draftNote.trim();
      if (queue.length === 0 && draftAttachments.length === 0 && note === "") {
        return;
      }

      // Regla 6 AGENTS.md: no mandar intents sin data-tsd-source.
      // El inspector ya muestra CTA; acá bloqueamos el Apply.
      if (queueHasMissingSource(queue)) {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== s.activeSessionId
              ? sess
              : {
                  ...sess,
                  blocks: [
                    ...sess.blocks,
                    {
                      kind: "agent" as const,
                      id: crypto.randomUUID(),
                      text: "Apply bloqueado: falta data-tsd-source. Activa TanStack Devtools source injection en el proyecto.",
                      tools: [],
                      status: "error" as const,
                    },
                  ],
                },
          ),
        }));
        return;
      }

      const payload = buildApplyPayload(queue, projectMeta?.root ?? "", {
        route: selection?.route ?? null,
        userNote: note === "" ? undefined : note,
      });
      const sentIds = new Set(queue.map((i) => i.id));
      const attachments = [...draftAttachments];

      const blocks: TranscriptBlock[] = [];
      if (payload.userNote !== undefined) {
        blocks.push({ kind: "user", id: crypto.randomUUID(), text: payload.userNote });
      }
      for (const a of attachments) {
        blocks.push({
          kind: "image",
          id: a.id,
          mime: a.mime,
          dataBase64: a.dataBase64,
          name: a.name,
        });
      }
      if (payload.intents.length > 0) {
        blocks.push({ kind: "batch", id: crypto.randomUUID(), payload });
      }

      // Sin agente o sin modelo: el lote queda en el transcript; la cola se conserva.
      if (primaryAgent === null || selectedModel === null) {
        const reason =
          primaryAgent === null
            ? "Sin AgentPort registrado en composition."
            : "Elige un modelo antes de aplicar.";
        blocks.push({
          kind: "agent",
          id: crypto.randomUUID(),
          text: reason,
          tools: [],
          status: "error",
        });
        set({
          sessions: get().sessions.map((s) =>
            s.id !== get().activeSessionId
              ? s
              : { ...s, blocks: [...s.blocks, ...blocks] },
          ),
        });
        return;
      }

      const agentBlockId = crypto.randomUUID();
      blocks.push({
        kind: "agent",
        id: agentBlockId,
        text: "",
        tools: [],
        status: "streaming",
      });

      // TRD §5: la cola no se vacía hasta done con éxito. Doble apply: agentBusy.
      set({
        sessions: get().sessions.map((s) =>
          s.id !== get().activeSessionId
            ? s
            : {
                ...s,
                blocks: [...s.blocks, ...blocks],
                title: s.title ?? payload.userNote ?? null,
              },
        ),
        agentBusy: true,
      });

      const sessionId = get().sessions.find((s) => s.id === get().activeSessionId)
        ?.agentSessionId as SessionId | null;

      const tools: TranscriptTool[] = [];
      let text = "";
      let liveSessionId: SessionId | null = sessionId;

      const succeed = (): void => {
        for (const i of queue) {
          if (i.kind === "comment") previewPort.removePin(i.id);
        }
        previewPort.clearOverrides();
        patchAgentBlock(agentBlockId, {
          status: "done",
          text: text === "" ? "Listo." : text,
        });
        set({
          agentBusy: false,
          queue: get().queue.filter((i) => !sentIds.has(i.id)),
          draftNote: "",
          draftAttachments: [],
        });
      };

      try {
        const turnParts = [
          ...(payload.intents.length > 0 || payload.userNote !== undefined
            ? ([{ type: "intents" as const, payload }] as const)
            : []),
          ...attachments.map((a) => ({
            type: "image" as const,
            mime: a.mime,
            dataBase64: a.dataBase64,
          })),
        ];
        const events = primaryAgent.startTurn({
          directory: payload.projectRoot,
          sessionId,
          model: selectedModel,
          extras: { agent: get().agentMode },
          parts: [...turnParts],
        });

        for await (const ev of events) {
          switch (ev.type) {
            case "session":
              liveSessionId = ev.sessionId;
              set((s) => ({
                sessions: s.sessions.map((sess) =>
                  sess.id !== s.activeSessionId
                    ? sess
                    : { ...sess, agentSessionId: ev.sessionId },
                ),
              }));
              break;
            case "text-delta":
              text += ev.text;
              patchAgentBlock(agentBlockId, { text });
              break;
            case "tool": {
              if (ev.status === "start") {
                tools.push({ name: ev.name, status: "start", detail: ev.detail });
              } else {
                const idx = findLastStartIndex(tools, ev.name);
                const entry: TranscriptTool = {
                  name: ev.name,
                  status: "end",
                  detail: ev.detail,
                };
                if (idx >= 0) tools[idx] = entry;
                else tools.push(entry);
              }
              patchAgentBlock(agentBlockId, { tools: [...tools] });
              break;
            }
            case "permission": {
              tools.push({
                name: ev.summary,
                status: "start",
                detail: ev.permissionId,
              });
              patchAgentBlock(agentBlockId, { tools: [...tools] });
              if (
                liveSessionId == null ||
                primaryAgent.respondPermission == null
              ) {
                patchAgentBlock(agentBlockId, {
                  status: "error",
                  text: "El agente espera un permiso y no se pudo responder.",
                });
                set({ agentBusy: false });
                return;
              }
              try {
                await primaryAgent.respondPermission(
                  liveSessionId,
                  ev.permissionId,
                  true,
                  get().permissionPolicy === "always",
                );
                const idx = findLastStartIndex(tools, ev.summary);
                const accepted: TranscriptTool = {
                  name: ev.summary,
                  status: "end",
                  detail: "aceptado",
                };
                if (idx >= 0) tools[idx] = accepted;
                else tools.push(accepted);
                patchAgentBlock(agentBlockId, { tools: [...tools] });
              } catch (err) {
                patchAgentBlock(agentBlockId, {
                  status: "error",
                  text:
                    err instanceof Error
                      ? err.message
                      : "No se pudo aceptar el permiso.",
                });
                set({ agentBusy: false });
                return;
              }
              break;
            }
            case "done":
              succeed();
              return;
            case "error":
              patchAgentBlock(agentBlockId, {
                status: "error",
                text: text === "" ? ev.message : `${text}\n\n${ev.message}`,
              });
              set({ agentBusy: false });
              return;
            default:
              break;
          }
        }
        succeed();
      } catch (err) {
        patchAgentBlock(agentBlockId, {
          status: "error",
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        set({ agentBusy: false });
      }
    },

    async abortTurn() {
      const { sessions, activeSessionId, agentBusy } = get();
      if (!agentBusy || primaryAgent === null) return;
      const sessionId =
        sessions.find((s) => s.id === activeSessionId)?.agentSessionId ?? null;
      await primaryAgent.abort(sessionId);
    },

    async refreshAgent() {
      if (primaryAgent === null) {
        set({ agentStatus: "down", agentDetail: "sin adapter" });
        return;
      }
      set({ agentStatus: "checking", agentDetail: null });
      const health = await primaryAgent.health();
      if (!health.ok) {
        set({
          agentStatus: "down",
          agentDetail: health.detail ?? "no responde",
          agentModels: [],
          selectedModel: null,
        });
        return;
      }
      try {
        const models = await primaryAgent.listModels();
        const { selectedModel } = get();
        const still =
          selectedModel != null &&
          models.some(
            (m) =>
              m.providerId === selectedModel.providerId &&
              m.modelId === selectedModel.modelId,
          );
        set({
          agentStatus: "up",
          agentDetail: health.version ?? null,
          agentModels: models,
          selectedModel: still ? selectedModel : pickDefaultModel(models),
        });
      } catch (err) {
        set({
          agentStatus: "down",
          agentDetail: err instanceof Error ? err.message : String(err),
          agentModels: [],
          selectedModel: null,
        });
      }
    },

    setModel(model) {
      set({ selectedModel: model });
    },

    setAgentMode(mode) {
      set({ agentMode: mode });
    },

    setPermissionPolicy(policy) {
      set({ permissionPolicy: policy });
    },

    async refreshAgentSessions() {
      if (primaryAgent?.listSessions == null) {
        set({ agentSessions: [] });
        return;
      }
      const root = get().projectMeta?.root;
      if (!root) {
        set({ agentSessions: [] });
        return;
      }
      try {
        const list = await primaryAgent.listSessions(root);
        set({ agentSessions: list });
      } catch {
        set({ agentSessions: [] });
      }
    },

    bindAgentSession(agentSessionId) {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id !== s.activeSessionId
            ? sess
            : { ...sess, agentSessionId },
        ),
      }));
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

    toggleChat(on) {
      set({ chatOpen: on ?? !get().chatOpen });
    },

    toggleLayers(on) {
      set({ layersOpen: on ?? !get().layersOpen });
    },

    selectLayer(id) {
      previewPort.selectNode(id);
    },

    newSession() {
      const { sessions, activeSessionId } = get();
      const current = sessions.find((s) => s.id === activeSessionId);
      // Si la activa está vacía no tiene sentido duplicar.
      if (current !== undefined && current.blocks.length === 0) return;
      const session = newChatSession();
      set({ sessions: [...sessions, session], activeSessionId: session.id });
    },

    selectSession(id) {
      set((s) => ({ activeSessionId: id, chatOpen: true }));
    },
  }));

  // Mensajes del bridge → estado (ARCHITECTURE §9: previewSlice habla
  // con PreviewPort; select/hover/navigate llegan por acá).
  previewPort.subscribe((msg) => {
    switch (msg.type) {
      case "steer:ready": {
        // Iframe nuevo: reponer modo (comment/inspect/interact). Los
        // overrides son efímeros y mueren con el documento.
        const st = store.getState();
        previewPort.setMode(st.mode);
        break;
      }
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
      case "steer:tree": {
        store.setState({ tree: msg.nodes });
        for (const i of store.getState().queue) {
          if (i.kind !== "comment") continue;
          const node = findTreeNodeBySource(msg.nodes, locKey(i.selection));
          if (node !== null) {
            previewPort.addPin(i.id, node.id, i.pin, i.body);
          }
        }
        break;
      }
      case "steer:captured": {
        // data:image/png;base64,…
        const comma = msg.dataUrl.indexOf(",");
        const b64 = comma >= 0 ? msg.dataUrl.slice(comma + 1) : msg.dataUrl;
        store.getState().addAttachment({
          mime: "image/png",
          dataBase64: b64,
          name: "preview.png",
        });
        break;
      }
      case "steer:capture-error": {
        const text =
          "No pude capturar el diseño del preview. " +
          (msg.message ? msg.message : "Recarga e inténtalo de nuevo.");
        store.setState((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== s.activeSessionId
              ? sess
              : {
                  ...sess,
                  blocks: [
                    ...sess.blocks,
                    {
                      kind: "agent" as const,
                      id: crypto.randomUUID(),
                      text,
                      tools: [],
                      status: "error" as const,
                    },
                  ],
                },
          ),
        }));
        break;
      }
      case "steer:comment-submit": {
        if (msg.intentId) {
          store.getState().updateComment(msg.intentId, msg.body, msg.steerId);
          break;
        }
        // Nuevo comentario: alinear selectedId con el pin del popover.
        if (msg.steerId && store.getState().selectedId !== msg.steerId) {
          store.setState({ selectedId: msg.steerId });
        }
        store.getState().queueComment(msg.body);
        break;
      }
      default:
        break;
    }
  });

  return store;
}
