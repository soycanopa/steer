// createAppStore — ARCHITECTURE §6/§9. app-state es el único lugar que
// importa ports y los llama. Los adapters se inyectan desde el
// composition root (apps/desktop/src/composition.ts). Sin React aquí.

import { createStore } from "zustand/vanilla";
import type {
  Intent,
  OverlayOverride,
  Scope,
  SourceLoc,
  TweakProp,
} from "@steer/domain";
import {
  buildApplyPayload,
  computedMatchesTweak,
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
import {
  cacheWorkspace,
  deleteWorkspace,
  restoreWorkspace,
  snapshotWorkspace,
  type WorkspaceSnapshot,
} from "./workspaces";
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
  type ReasoningEffort,
} from "./agent";

// Persistencia de prefs vía host (TRD §2). El adapter real vive en
// apps/desktop/src/tauri/prefs.ts; app-state no conoce Tauri.
export type AgentPrefs = {
  providerId: string | null;
  modelId: string | null;
  reasoningEffort: ReasoningEffort | null;
};

export type PrefsApi = {
  getLastProject(): Promise<string | null>;
  setLastProject(path: string): Promise<void>;
  getOpenProjectTabs(): Promise<string[]>;
  setOpenProjectTabs(tabs: string[]): Promise<void>;
  getProjectWorkspace(projectRoot: string): Promise<WorkspaceSnapshot | null>;
  setProjectWorkspace(
    projectRoot: string,
    workspace: WorkspaceSnapshot,
  ): Promise<void>;
  deleteProjectWorkspace(projectRoot: string): Promise<void>;
  getAgentPrefs(): Promise<AgentPrefs>;
  setAgentPrefs(prefs: AgentPrefs): Promise<void>;
  getLastAgentSession(projectRoot: string): Promise<string | null>;
  setLastAgentSession(projectRoot: string, sessionId: string): Promise<void>;
  getRecentProjects(): Promise<string[]>;
  setRecentProjects(paths: string[]): Promise<void>;
  getProjectThumbnails(): Promise<Record<string, string>>;
  setProjectThumbnail(projectRoot: string, dataUrl: string): Promise<void>;
  clearProjectThumbnail(projectRoot: string): Promise<void>;
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
    /** Alinea tabs y proyecto activo con prefs (también tras HMR en dev). */
    syncPersistedWorkspace(): Promise<void>;
    /** Guarda el proyecto actual en prefs (p. ej. antes de cerrar la app). */
    persistLastProject(): Promise<void>;
    /** P0-01: scaffold TanStack Start vía CLI del host. */
    createStartProject(parentDir: string, name: string): Promise<void>;
    openProject(path: string): Promise<void>;
    /** Abre o enfoca un proyecto en un tab nuevo sin cerrar los demás. */
    openProjectInNewTab(path: string): Promise<void>;
    /** Cambia al tab de un proyecto ya abierto. */
    switchProjectTab(path: string): Promise<void>;
    /** Cierra un tab de proyecto y apaga su dev server. */
    closeProjectTab(path: string): Promise<void>;
    /**
     * Elimina el proyecto de Steer: recents, historial, thumbnail, tab y
     * dev server. NO toca archivos del disco.
     */
    deleteProject(path: string): Promise<void>;
    /** Cierra el proyecto activo y apaga preview/dev. */
    closeProject(): Promise<void>;
    /** Apaga solo el proxy del preview (el dev server sigue vivo). */
    detachPreview(): Promise<void>;
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
    /** UX §5.3: click en breadcrumb (componente) sube al host con source distinto. */
    selectAncestor(): void;
    /** UX §5.6: cierra el toast de preview vs tweak. */
    dismissPreviewMismatch(): void;
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
    /** Selecciona en el preview el nodo de un tweak encolado. */
    focusEdit(intentId: string): void;
    removeQueued(intentId: string): void;
    /** UX §5.6 / Fase F: lote → AgentPort → clearOverrides en done. */
    applyQueue(): Promise<void>;
    /** Fase F: abortar el turno en curso. */
    abortTurn(): Promise<void>;
    /** Fase F: health + listModels del AgentPort seleccionado. */
    refreshAgent(): Promise<void>;
    /** Fase F: elegir modelo de listModels(). */
    setModel(model: ModelRef): void;
    setReasoningEffort(effort: ReasoningEffort): void;
    /** ask | plan | agent (OpenCode: build). */
    setAgentMode(mode: AgentMode): void;
    setPermissionPolicy(policy: PermissionPolicy): void;
    /** Sesiones OpenCode del directorio del proyecto. */
    refreshAgentSessions(): Promise<void>;
    /** Une la sesión de chat local con una sesión OpenCode existente. */
    bindAgentSession(agentSessionId: SessionId): void;
    /** Abre una sesión OpenCode: enlaza y activa una conversación local. */
    openAgentSession(agentSessionId: SessionId, title?: string): void;
    /** Elimina una conversación local de Steer. */
    deleteLocalSession(id: string): void;
    /** Elimina una sesión OpenCode del proyecto. */
    deleteAgentSession(sessionId: SessionId): Promise<void>;
    /** UX §5.6: Vaciar cola. */
    clearQueue(): void;
    setDraftNote(text: string): void;
    /** Columna de chat: mostrar/ocultar (toggle del titlebar). */
    toggleChat(on?: boolean): void;
    /** Panel de capas: mostrar/ocultar (toggle del titlebar). */
    toggleLayers(on?: boolean): void;
    /** Selecciona un nodo desde el árbol de capas. */
    selectLayer(id: string): void;
    /** Navega el preview a otra ruta (p. ej. desde el panel de páginas). */
    navigatePreview(path: string): void;
    /** Relee `src/routes` del proyecto abierto y alinea previewPath. */
    refreshProjectRoutes(): Promise<void>;
    /** Carga las URLs live de los recientes (previews del home). */
    refreshRecentPreviewUrls(): Promise<void>;
    /** Responde una pregunta del agente (OpenCode question API). */
    answerQuestion(blockId: string, answers: string[][]): Promise<void>;
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
  reasoning: string;
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
  id?: string,
): number {
  if (id !== undefined) {
    for (let i = tools.length - 1; i >= 0; i -= 1) {
      const t = tools[i];
      if (t !== undefined && t.status === "start" && t.id === id) return i;
    }
  }
  for (let i = tools.length - 1; i >= 0; i -= 1) {
    const t = tools[i];
    if (t !== undefined && t.status === "start" && t.name === name) return i;
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

function captureCurrentWorkspace(
  get: () => SteerState,
  onCaptured?: (root: string) => void,
): void {
  const root = get().projectMeta?.root;
  if (root == null) return;
  snapshotWorkspace(root, get());
  onCaptured?.(root);
}

function applyWorkspaceSnapshot(
  set: (
    partial:
      | Partial<SteerState>
      | ((state: SteerState) => Partial<SteerState>),
  ) => void,
  snap: WorkspaceSnapshot,
): void {
  set({
    projectStatus: "open",
    projectMeta: snap.meta,
    projectError: null,
    lastProject: snap.meta.root,
    projectRoutes: snap.projectRoutes,
    ...snap.preview,
    previewUrl: null,
    previewStatus: "starting",
    previewError: null,
    ...snap.selection,
    ...snap.intents,
    tree: null,
    agentSessions: snap.agentSessions,
  });
}

/** Total de bloques de transcript del workspace (para el guard de persist). */
function countBlocks(snap: WorkspaceSnapshot): number {
  const sessions = snap.intents?.sessions ?? [];
  return sessions.reduce((n, s) => n + (s.blocks?.length ?? 0), 0);
}

export function createAppStore({ projectPort, previewPort, prefs, agents }: AppDeps) {
  const primaryAgent = agents[0] ?? null;
  let bootstrapRun: Promise<void> | null = null;
  let syncRun: Promise<void> | null = null;
  // Generación de cambio de proyecto: una apertura nueva aborta la anterior
  // (last-wins) para no abrir dos proyectos en paralelo.
  let switchToken = 0;
  let savedAgentPrefs: AgentPrefs | null = null;
  let previewStartTask: Promise<void> | null = null;
  let agentTurnInFlight = false;
  let treeRequestTimers: ReturnType<typeof setTimeout>[] = [];
  let mismatchTimer: ReturnType<typeof setTimeout> | null = null;
  let mismatchToastTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingMismatch: Array<{
    prop: TweakProp;
    to: string;
    source: SourceLoc;
  }> | null = null;

  const MISMATCH_TOAST =
    "el agente terminó; el preview no refleja el tweak — revisa el diff";

  function clearMismatchCheck(): void {
    if (mismatchTimer !== null) {
      clearTimeout(mismatchTimer);
      mismatchTimer = null;
    }
    pendingMismatch = null;
  }

  function showMismatchToast(): void {
    store.setState({ previewMismatch: MISMATCH_TOAST });
    if (mismatchToastTimer !== null) clearTimeout(mismatchToastTimer);
    mismatchToastTimer = setTimeout(() => {
      mismatchToastTimer = null;
      store.setState({ previewMismatch: null });
    }, 3500);
  }

  /** UX §5.6: a los 2s releer computed del nodo y tostar si no se acerca. */
  function scheduleMismatchCheck(
    tweaks: Array<{ prop: TweakProp; to: string; source: SourceLoc }>,
  ): void {
    clearMismatchCheck();
    if (tweaks.length === 0 || tweaks[0] === undefined) return;
    const source = tweaks[0].source;
    if (source.file === "") return;
    mismatchTimer = setTimeout(() => {
      mismatchTimer = null;
      pendingMismatch = tweaks;
      previewPort.selectBySource(source);
      setTimeout(() => {
        if (pendingMismatch !== null) pendingMismatch = null;
      }, 800);
    }, 2000);
  }

  let editPinIds = new Set<string>();

  /** Círculos azules numerados en el preview, uno por tweak encolado. */
  function syncEditPins(): void {
    const { queue, tweaks, tree } = store.getState();
    const next = new Set<string>();
    let n = 0;
    for (const i of queue) {
      if (i.kind !== "tweak") continue;
      n += 1;
      next.add(i.id);
      const draft = tweaks.find(
        (t) =>
          t.prop === i.prop &&
          t.scope === i.scope &&
          locKey(t.selection) === locKey(i.selection),
      );
      const node = findTreeNodeBySource(tree, locKey(i.selection));
      const steerId = node?.id ?? draft?.steerId;
      if (steerId == null || steerId === "") continue;
      previewPort.addPin(i.id, steerId, n, undefined, "edit");
    }
    for (const id of editPinIds) {
      if (!next.has(id)) previewPort.removePin(id);
    }
    editPinIds = next;
  }

  let thumbnailTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTreeRequestTimers(): void {
    for (const t of treeRequestTimers) clearTimeout(t);
    treeRequestTimers = [];
  }

  function scheduleTreeRequests(): void {
    clearTreeRequestTimers();
    previewPort.requestTree();
    for (const delay of [1500, 4000, 9000]) {
      treeRequestTimers.push(
        setTimeout(() => {
          if (store.getState().previewStatus === "live") {
            previewPort.requestTree();
          }
        }, delay),
      );
    }
    treeRequestTimers.push(
      setTimeout(() => {
        if (
          store.getState().previewStatus === "live" &&
          store.getState().tree === null
        ) {
          store.setState({ tree: [] });
        }
      }, 16000),
    );
  }

  /** Snapshot del preview activo; lo persiste como thumbnail del root. */
  async function captureThumbnailFor(root: string): Promise<void> {
    if (root === "" || store.getState().previewStatus !== "live") return;
    try {
      const dataUrl = await previewPort.captureThumbnail();
      if (dataUrl != null && dataUrl.startsWith("data:image/")) {
        store.setState((s) => ({
          projectThumbnails: { ...s.projectThumbnails, [root]: dataUrl },
        }));
        void prefs.setProjectThumbnail(root, dataUrl);
      }
    } catch {
      // best-effort
    }
  }

  /** Captura el thumbnail un rato después de quedar live (layout estable). */
  function scheduleThumbnail(root: string): void {
    if (thumbnailTimer !== null) clearTimeout(thumbnailTimer);
    thumbnailTimer = setTimeout(() => {
      thumbnailTimer = null;
      const st = store.getState();
      if (st.projectMeta?.root === root && st.previewStatus === "live") {
        void captureThumbnailFor(root);
      }
    }, 3500);
  }

  /** Marca un proyecto como reciente (más nuevo primero, cap 8). Apaga los
   *  dev servers que salen de la lista para no acumular procesos. */
  function touchRecentProject(root: string): void {
    if (root === "") return;
    const current = store.getState().recentProjects;
    const next = [root, ...current.filter((p) => p !== root)].slice(0, 8);
    const dropped = current.filter((p) => !next.includes(p));
    store.setState({ recentProjects: next });
    void prefs.setRecentProjects(next);
    for (const p of dropped) void projectPort.stopDev(p);
  }

  function modelFromPrefs(
    models: ModelRef[],
    agentPrefs: AgentPrefs | null,
  ): ModelRef | null {
    if (agentPrefs?.providerId == null || agentPrefs.modelId == null) {
      return null;
    }
    return (
      models.find(
        (m) =>
          m.providerId === agentPrefs.providerId &&
          m.modelId === agentPrefs.modelId,
      ) ?? null
    );
  }

  /** Actualiza un bloque `agent` streaming en la sesión activa. */
  function patchAgentBlock(
    blockId: string,
    patch: Partial<{
      text: string;
      reasoning: string;
      tools: TranscriptTool[];
      status: "streaming" | "done" | "error";
    }>,
  ): void {
    setAgentBlock(store, blockId, patch);
  }

  let persistWorkspacePrefs: () => Promise<void>;
  let persistProjectWorkspace: (root: string) => Promise<void>;
  let schedulePersistProjectWorkspace: (root: string) => void;

  const store = createStore<SteerState>()((set, get) => ({
    projectStatus: "empty",
    projectMeta: null,
    projectError: null,
    lastProject: null,
    projectRoutes: [],
    openProjectTabs: [],
    recentProjects: [],
    projectThumbnails: {},
    recentPreviewUrls: {},
    createProgress: null,
    ...initialPreviewSlice,
    ...initialSelectionSlice,
    ...initialIntents(),
    ...initialAgentSlice(agents),

    async bootstrap() {
      if (bootstrapRun !== null) return bootstrapRun;
      bootstrapRun = (async () => {
        const agentPrefs = await prefs.getAgentPrefs();
        savedAgentPrefs = agentPrefs;
        if (
          agentPrefs.reasoningEffort === "low" ||
          agentPrefs.reasoningEffort === "high" ||
          agentPrefs.reasoningEffort === "max"
        ) {
          set({ reasoningEffort: agentPrefs.reasoningEffort });
        }

        const [recents, thumbs] = await Promise.all([
          prefs.getRecentProjects(),
          prefs.getProjectThumbnails(),
        ]);
        set({ recentProjects: recents, projectThumbnails: thumbs });

        await get().syncPersistedWorkspace();

        void (async () => {
          await get().refreshAgent();
          if (get().agentStatus === "down") {
            for (const ms of [1200, 2400]) {
              await new Promise((r) => setTimeout(r, ms));
              await get().refreshAgent();
              if (get().agentStatus === "up") break;
            }
          }
        })();
      })();
      return bootstrapRun;
    },

    async syncPersistedWorkspace() {
      // Guard: StrictMode monta App dos veces y ambas ramas llamaban a este
      // método en paralelo, abriendo el proyecto (y arrancando el preview)
      // dos veces → el proxy se reiniciaba y el iframe "parpadeaba".
      if (syncRun !== null) return syncRun;
      syncRun = (async () => {
        const [lastProject, savedTabs] = await Promise.all([
          prefs.getLastProject(),
          prefs.getOpenProjectTabs(),
        ]);
        const activeProject =
          lastProject != null &&
          (savedTabs.length === 0 || savedTabs.includes(lastProject))
            ? lastProject
            : savedTabs[savedTabs.length - 1] ?? lastProject;

        set({
          lastProject: activeProject,
          ...(savedTabs.length > 0 ? { openProjectTabs: savedTabs } : {}),
        });

        if (activeProject == null) return;

        const current = get().projectMeta?.root;
        if (get().projectStatus === "empty" || current !== activeProject) {
          await get().openProject(activeProject);
        }
      })();
      try {
        await syncRun;
      } finally {
        syncRun = null;
      }
    },

    async persistLastProject() {
      await persistWorkspacePrefs();
    },

    async createStartProject(parentDir, name) {
      set({
        projectStatus: "creating",
        projectError: null,
        createProgress: { percent: 0, message: "Iniciando…" },
      });
      try {
        const meta = await projectPort.createStart(parentDir, name, (progress) => {
          set({ createProgress: progress });
        });
        set({ createProgress: { percent: 100, message: "Listo" } });
        await get().openProjectInNewTab(meta.root);
        await get().persistLastProject();
        set({ createProgress: null });
      } catch (err) {
        set({
          projectStatus: "error",
          projectError: err instanceof Error ? err.message : String(err),
          createProgress: null,
        });
      }
    },

    async closeProject() {
      const root = get().projectMeta?.root;
      if (root != null) {
        await get().closeProjectTab(root);
        return;
      }
      await get().detachPreview();
      set({
        projectStatus: "empty",
        projectMeta: null,
        projectError: null,
        projectRoutes: [],
        openProjectTabs: [],
        agentSessions: [],
      });
    },

    async detachPreview() {
      try {
        await projectPort.detachPreview();
      } catch {
        // detach es best-effort al cambiar de tab.
      }
      set((s) => ({
        previewUrl: null,
        tree: null,
        previewStatus: s.previewStatus === "down" ? "down" : "idle",
      }));
    },

    async openProjectInNewTab(path) {
      const token = ++switchToken;
      const current = get().projectMeta?.root;
      if (current != null && current !== path) {
        captureCurrentWorkspace(get, (root) => schedulePersistProjectWorkspace(root));
        if (get().previewStatus === "live") void captureThumbnailFor(current);
        await get().detachPreview();
        if (token !== switchToken) return;
        set({
          projectMeta: null,
          projectStatus: "opening",
          projectRoutes: [],
        });
      }

      if (token !== switchToken) return;
      set({ lastProject: path });
      touchRecentProject(path);
      const tabs = get().openProjectTabs;
      if (!tabs.includes(path)) {
        set({ openProjectTabs: [...tabs, path] });
      }
      void persistWorkspacePrefs();

      let snap = restoreWorkspace(path);
      if (snap == null) {
        snap = await prefs.getProjectWorkspace(path);
        if (token !== switchToken) return;
        if (snap != null) {
          cacheWorkspace(snap);
        }
      }
      if (snap != null) {
        applyWorkspaceSnapshot(set, snap);
        await get().refreshProjectRoutes();
        if (token !== switchToken) return;
        await get().startPreview();
        void persistWorkspacePrefs();
        void get().refreshAgent();
        void get()
          .refreshAgentSessions()
          .then(() => restoreAgentSessionForProject(path));
        return;
      }

      set({
        projectStatus: "opening",
        projectError: null,
        lastProject: path,
        projectRoutes: [],
        ...initialPreviewSlice,
        ...initialSelectionSlice,
        ...initialIntents(),
      });
      try {
        let meta: ProjectMeta = await projectPort.open(path);
        if (token !== switchToken) return;
        if (!meta.hasDevtoolsVite) {
          try {
            meta = await projectPort.ensureDevtools(path);
          } catch {
            // El proyecto abre igual; el inspector mostrará el CTA de Devtools.
          }
        }
        const routes = await projectPort.listRoutes(path);
        if (token !== switchToken) return;
        set({
          projectStatus: "open",
          projectMeta: meta,
          lastProject: path,
          projectRoutes: routes,
          previewStatus: "starting",
          previewError: null,
        });
        await get().refreshProjectRoutes();
        if (token !== switchToken) return;
        await get().startPreview();
        if (token !== switchToken) return;
        void persistWorkspacePrefs();
        void get().refreshAgent();
        void get()
          .refreshAgentSessions()
          .then(() => restoreAgentSessionForProject(path));
      } catch (err) {
        if (token !== switchToken) return;
        set({
          projectStatus: "error",
          projectError: err instanceof Error ? err.message : String(err),
          lastProject: path,
        });
      }
    },

    async switchProjectTab(path) {
      const { projectMeta, projectStatus, previewStatus } = get();
      if (
        projectMeta?.root === path &&
        projectStatus === "open" &&
        (previewStatus === "live" || previewStatus === "starting")
      ) {
        return;
      }
      if (projectMeta?.root === path && projectStatus === "open") {
        await get().startPreview();
        return;
      }
      await get().openProjectInNewTab(path);
    },

    async closeProjectTab(path) {
      const tabs = get().openProjectTabs.filter((tab) => tab !== path);
      // Cerrar un tab NO borra el historial: el workspace (memoria + disco)
      // se conserva para que reabrir restaure el chat. Borrar es explícito
      // (`deleteProject`). Tampoco apagamos el dev server.
      void captureCurrentWorkspace(get, (root) =>
        schedulePersistProjectWorkspace(root),
      );

      if (get().projectMeta?.root === path) {
        if (get().previewStatus === "live") void captureThumbnailFor(path);
        await get().detachPreview();
        if (tabs.length > 0) {
          const next = tabs[tabs.length - 1]!;
          set({
            openProjectTabs: tabs,
            projectStatus: "empty",
            projectMeta: null,
            projectError: null,
            projectRoutes: [],
            agentSessions: [],
            ...initialPreviewSlice,
            ...initialSelectionSlice,
            ...initialIntents(),
          });
          await get().openProjectInNewTab(next);
          void get().refreshRecentPreviewUrls();
          return;
        }
        set({
          openProjectTabs: [],
          projectStatus: "empty",
          projectMeta: null,
          projectError: null,
          projectRoutes: [],
          agentSessions: [],
          ...initialPreviewSlice,
          ...initialSelectionSlice,
          ...initialIntents(),
        });
        void persistWorkspacePrefs();
        void get().refreshRecentPreviewUrls();
        return;
      }

      set({ openProjectTabs: tabs });
      void persistWorkspacePrefs();
      void get().refreshRecentPreviewUrls();
    },

    async deleteProject(path) {
      // Cerrar el tab si está abierto (detach del proxy; ajusta tabs/activo).
      if (get().openProjectTabs.includes(path)) {
        await get().closeProjectTab(path);
      }
      // Detener su dev server.
      try {
        await projectPort.stopDev(path);
      } catch {
        // best-effort
      }
      // Borrar metadata de Steer (memoria + disco de prefs). NO toca archivos.
      deleteWorkspace(path);
      void prefs.deleteProjectWorkspace(path);
      void prefs.clearProjectThumbnail(path);
      const nextRecents = get().recentProjects.filter((p) => p !== path);
      const nextThumbs = { ...get().projectThumbnails };
      delete nextThumbs[path];
      const nextUrls = { ...get().recentPreviewUrls };
      delete nextUrls[path];
      set({
        recentProjects: nextRecents,
        projectThumbnails: nextThumbs,
        recentPreviewUrls: nextUrls,
      });
      void prefs.setRecentProjects(nextRecents);
    },

    async openProject(path) {
      await get().openProjectInNewTab(path);
    },

    async startPreview() {
      const meta = get().projectMeta;
      if (meta === null) {
        return;
      }
      const root = meta.root;

      // Ya live con URL para este mismo root: no reiniciar el proxy (cada
      // reinicio cambia la URL y remonta el iframe → "parpadeo").
      if (
        get().projectStatus === "open" &&
        get().previewStatus === "live" &&
        get().previewUrl != null &&
        get().projectMeta?.root === root
      ) {
        return;
      }

      if (previewStartTask !== null) {
        await previewStartTask;
        if (
          get().previewStatus === "live" &&
          get().projectMeta?.root === root &&
          get().previewUrl != null
        ) {
          return;
        }
      }

      if (get().projectMeta?.root !== root) {
        return;
      }

      const previewPath = get().previewPath;
      previewStartTask = (async () => {
        set({ previewStatus: "starting", previewError: null });
        try {
          const { url } = await projectPort.startDev(root);
          if (get().projectMeta?.root !== root) {
            return;
          }
          set({
            previewStatus: "live",
            previewUrl: url,
            previewPath,
          });
          set({ tree: null });
          scheduleTreeRequests();
          scheduleThumbnail(root);
        } catch (err) {
          if (get().projectMeta?.root !== root) {
            return;
          }
          clearTreeRequestTimers();
          set({
            previewStatus: "down",
            previewError: err instanceof Error ? err.message : String(err),
            previewUrl: null,
            tree: null,
          });
        }
      })();

      try {
        await previewStartTask;
      } finally {
        previewStartTask = null;
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
      set((state) => ({
        reloadNonce: state.reloadNonce + 1,
        tree: null,
      }));
      scheduleTreeRequests();
    },

    setMode(mode) {
      const inspect = mode !== "interact";
      if (mode === "interact") {
        set({
          mode,
          inspectOn: false,
          selection: null,
          selectedId: null,
          hoverSelection: null,
        });
      } else {
        set({ mode, inspectOn: inspect });
      }
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
      syncEditPins();
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
      syncEditPins();
    },

    resetAllTweaks() {
      // Los comments encolados no se tocan: reset solo afecta tweaks.
      set((s) => ({
        tweaks: [],
        tweakLog: [],
        queue: s.queue.filter((i) => i.kind !== "tweak"),
      }));
      previewPort.clearOverrides();
      syncEditPins();
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
      syncEditPins();
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

    focusEdit(intentId) {
      const intent = get().queue.find((i) => i.id === intentId);
      if (intent?.kind !== "tweak") return;
      const draft = get().tweaks.find(
        (t) =>
          t.prop === intent.prop &&
          t.scope === intent.scope &&
          locKey(t.selection) === locKey(intent.selection),
      );
      get().setMode("inspect");
      set({
        selection: intent.selection,
        selectedId: draft?.steerId ?? get().selectedId,
        scope: intent.scope,
      });
      if (intent.selection.source.file !== "") {
        previewPort.selectBySource(intent.selection.source);
      } else if (draft?.steerId) {
        previewPort.selectNode(draft.steerId);
      }
    },

    removeQueued(intentId) {
      const intent = get().queue.find((i) => i.id === intentId);
      if (intent === undefined) return;

      if (intent.kind === "tweak") {
        const { tweaks, tweakLog, queue } = get();
        const draft = tweaks.find(
          (t) =>
            t.prop === intent.prop &&
            t.scope === intent.scope &&
            locKey(t.selection) === locKey(intent.selection),
        );
        const nextTweaks =
          draft !== undefined ? tweaks.filter((t) => t !== draft) : tweaks;
        const nextLog =
          draft !== undefined
            ? tweakLog.filter(
                (e) =>
                  !(
                    e.steerId === draft.steerId &&
                    e.scope === draft.scope &&
                    e.prop === draft.prop
                  ),
              )
            : tweakLog;
        set({
          queue: removeIntent(queue, intentId),
          tweaks: nextTweaks,
          tweakLog: nextLog,
        });
        previewPort.setOverrides(buildOverrides(nextTweaks));
        syncEditPins();
        return;
      }

      set((s) => ({ queue: removeIntent(s.queue, intentId) }));
      if (intent.kind === "comment") {
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
      if (agentTurnInFlight || agentBusy) return;
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
                      reasoning: "",
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
          reasoning: "",
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
        reasoning: "",
        tools: [],
        status: "streaming",
      });

      agentTurnInFlight = true;

      // TRD §5: la cola no se vacía hasta done con éxito. Doble apply: agentBusy.
      // El composer se limpia al enviar; la cola de intents se conserva hasta done.
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
        draftNote: "",
        draftAttachments: [],
      });

      const sessionId = get().sessions.find((s) => s.id === get().activeSessionId)
        ?.agentSessionId as SessionId | null;

      const tools: TranscriptTool[] = [];
      let text = "";
      let reasoning = "";
      let liveSessionId: SessionId | null = sessionId;
      let awaitingQuestion = false;

      // Los deltas de OpenCode llegan por token. Re-renderizar por cada uno
      // satura el main thread (markdown de todo el transcript) y la UI se
      // congela. Coalescemos a una actualización por frame.
      let streamFlush: ReturnType<typeof setTimeout> | null = null;
      const flushStream = (): void => {
        streamFlush = null;
        patchAgentBlock(agentBlockId, { text, reasoning });
      };
      const scheduleStreamFlush = (): void => {
        if (streamFlush !== null) return;
        if (typeof requestAnimationFrame === "function") {
          streamFlush = requestAnimationFrame(
            flushStream,
          ) as unknown as ReturnType<typeof setTimeout>;
        } else {
          streamFlush = setTimeout(flushStream, 16);
        }
      };
      const cancelStreamFlush = (): void => {
        if (streamFlush === null) return;
        if (typeof requestAnimationFrame === "function") {
          cancelAnimationFrame(streamFlush as unknown as number);
        } else {
          clearTimeout(streamFlush);
        }
        streamFlush = null;
      };
      /** Vuelca lo pendiente ahora (antes de tool/done/error). */
      const flushStreamNow = (): void => {
        if (streamFlush === null) return;
        cancelStreamFlush();
        patchAgentBlock(agentBlockId, { text, reasoning });
      };

      const succeed = (): void => {
        cancelStreamFlush();
        for (const i of queue) {
          if (i.kind === "comment") previewPort.removePin(i.id);
        }
        previewPort.clearOverrides();
        patchAgentBlock(agentBlockId, {
          status: "done",
          text,
          reasoning,
          tools: [...tools],
        });
        const root = get().projectMeta?.root;
        if (root != null) {
          captureCurrentWorkspace(get, (r) => schedulePersistProjectWorkspace(r));
        }
        const { previewStatus } = get();
        const agentChangedProject =
          payload.intents.length > 0 ||
          tools.some((t) => t.status === "end");
        if (previewStatus === "live" && agentChangedProject) {
          get().reloadPreview();
          scheduleTreeRequests();
        }
        void get().refreshProjectRoutes();
        set({
          agentBusy: false,
          queue: get().queue.filter((i) => !sentIds.has(i.id)),
          draftNote: "",
          draftAttachments: [],
        });
        syncEditPins();
        const expected = payload.intents
          .filter(
            (i): i is Extract<Intent, { kind: "tweak" }> => i.kind === "tweak",
          )
          .map((i) => ({
            prop: i.prop,
            to: i.to,
            source: i.selection.source,
          }));
        scheduleMismatchCheck(expected);
      };

      try {
        const turnParts = [
          ...(payload.intents.length > 0
            ? ([{ type: "intents" as const, payload }] as const)
            : payload.userNote !== undefined
              ? ([{ type: "text" as const, text: payload.userNote }] as const)
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
          extras: {
            agent: get().agentMode,
            ...(get().selectedModel?.capabilities.reasoning === true
              ? { reasoning: { effort: get().reasoningEffort } }
              : {}),
          },
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
              if (payload.projectRoot !== "") {
                void prefs.setLastAgentSession(payload.projectRoot, ev.sessionId);
              }
              break;
            case "text-delta":
              text += ev.text;
              scheduleStreamFlush();
              break;
            case "reasoning-delta":
              reasoning += ev.text;
              scheduleStreamFlush();
              break;
            case "tool": {
              flushStreamNow();
              if (ev.status === "start") {
                tools.push({
                  id: ev.id,
                  name: ev.name,
                  status: "start",
                  detail: ev.detail,
                });
              } else {
                const idx = findLastStartIndex(tools, ev.name, ev.id);
                const entry: TranscriptTool = {
                  id: ev.id,
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
            case "question": {
              flushStreamNow();
              awaitingQuestion = true;
              const [first] = ev.questions;
              if (first == null) break;
              const prompt =
                ev.questions.length === 1
                  ? first.prompt
                  : ev.questions
                      .map((q, i) => `${i + 1}. ${q.prompt}`)
                      .join("\n");
              const options = first.options;
              set((s) => ({
                agentBusy: false,
                chatOpen: true,
                sessions: s.sessions.map((sess) =>
                  sess.id !== s.activeSessionId
                    ? sess
                    : {
                        ...sess,
                        blocks: sess.blocks.some(
                          (b) =>
                            b.kind === "question" &&
                            b.questionId === ev.questionId &&
                            b.status === "pending",
                        )
                          ? sess.blocks
                          : [
                              ...sess.blocks,
                              {
                                kind: "question" as const,
                                id: crypto.randomUUID(),
                                questionId: ev.questionId,
                                prompt,
                                options,
                                questions: ev.questions.map((q) => ({
                                  prompt: q.prompt,
                                  options: q.options,
                                })),
                                status: "pending" as const,
                              },
                            ],
                      },
                ),
              }));
              break;
            }
            case "permission": {
              flushStreamNow();
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
            case "done": {
              if (awaitingQuestion) {
                const pendingQuestion = get()
                  .sessions.find((s) => s.id === get().activeSessionId)
                  ?.blocks.some(
                    (b) => b.kind === "question" && b.status === "pending",
                  );
                if (pendingQuestion === true) break;
                awaitingQuestion = false;
              }
              succeed();
              return;
            }
            case "error":
              cancelStreamFlush();
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
        if (!awaitingQuestion) {
          succeed();
        }
      } catch (err) {
        cancelStreamFlush();
        patchAgentBlock(agentBlockId, {
          status: "error",
          text: err instanceof Error ? err.message : String(err),
        });
        set({ agentBusy: false });
      } finally {
        agentTurnInFlight = false;
        if (!awaitingQuestion && get().agentBusy) {
          set({ agentBusy: false });
        }
      }
    },

    async abortTurn() {
      const { sessions, activeSessionId, agentBusy } = get();
      if (!agentBusy || primaryAgent === null) return;
      const sessionId =
        sessions.find((s) => s.id === activeSessionId)?.agentSessionId ?? null;
      await primaryAgent.abort(sessionId);
      clearMismatchCheck();
      set({ agentBusy: false });
    },

    async refreshProjectRoutes() {
      const root = get().projectMeta?.root;
      if (root == null || root === "") return;
      try {
        const routes = await projectPort.listRoutes(root);
        const currentPath = get().previewPath;
        const pathOk =
          currentPath === "/" ||
          routes.some((route) => route.path === currentPath);
        set({
          projectRoutes: routes,
          ...(pathOk
            ? {}
            : {
                previewPath: "/",
                reloadNonce: get().reloadNonce + 1,
              }),
        });
      } catch {
        // best-effort
      }
    },

    async refreshRecentPreviewUrls() {
      const paths = Array.from(
        new Set([...get().recentProjects, ...get().openProjectTabs]),
      );
      const entries = await Promise.all(
        paths.map(async (p) => [p, await projectPort.previewUrl(p)] as const),
      );
      const next: Record<string, string> = {};
      for (const [p, url] of entries) {
        if (url != null && url !== "") next[p] = url;
      }
      set({ recentPreviewUrls: next });
    },

    async answerQuestion(blockId, answers) {
      const normalized = answers
        .map((row) => row.map((cell) => cell.trim()).filter((cell) => cell !== ""))
        .filter((row) => row.length > 0);
      if (normalized.length === 0 || primaryAgent?.respondQuestion == null) {
        return;
      }
      const root = get().projectMeta?.root;
      if (root == null || root === "") return;
      const sessionId =
        get().sessions.find((s) => s.id === get().activeSessionId)
          ?.agentSessionId ?? null;
      if (sessionId == null || sessionId === "") return;

      const block = get()
        .sessions.find((s) => s.id === get().activeSessionId)
        ?.blocks.find(
          (b) => b.kind === "question" && b.id === blockId,
        );
      if (block == null || block.kind !== "question") return;

      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id !== s.activeSessionId
            ? sess
            : {
                ...sess,
                blocks: sess.blocks.map((b) =>
                  b.kind === "question" && b.id === blockId
                    ? { ...b, error: undefined }
                    : b,
                ),
              },
        ),
      }));

      try {
        await primaryAgent.respondQuestion(
          sessionId,
          block.questionId,
          normalized,
          root,
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "No se pudo enviar la respuesta.";
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== s.activeSessionId
              ? sess
              : {
                  ...sess,
                  blocks: sess.blocks.map((b) =>
                    b.kind === "question" && b.id === blockId
                      ? { ...b, error: message }
                      : b,
                  ),
                },
          ),
        }));
        return;
      }

      const answerLabel = normalized.flat().join(", ");
      set((s) => ({
        agentBusy: true,
        sessions: s.sessions.map((sess) =>
          sess.id !== s.activeSessionId
            ? sess
            : {
                ...sess,
                blocks: sess.blocks.map((b) =>
                  b.kind === "question" && b.id === blockId
                    ? {
                        ...b,
                        status: "answered" as const,
                        answer: answerLabel,
                        error: undefined,
                      }
                    : b,
                ),
              },
        ),
      }));
      captureCurrentWorkspace(get, (r) => schedulePersistProjectWorkspace(r));
    },

    async refreshAgent() {
      if (primaryAgent === null) {
        set({ agentStatus: "down", agentDetail: "sin adapter" });
        return;
      }
      set({ agentStatus: "checking", agentDetail: null });

      if (primaryAgent.ensureRuntime != null) {
        const directory =
          get().projectMeta?.root ?? get().lastProject ?? "";
        try {
          await primaryAgent.ensureRuntime(directory);
        } catch (err) {
          set({
            agentStatus: "down",
            agentDetail:
              err instanceof Error
                ? err.message
                : "No pude arrancar OpenCode.",
            agentModels: [],
            selectedModel: null,
          });
          return;
        }
      }

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
        const fromPrefs = modelFromPrefs(models, savedAgentPrefs);
        const nextModel =
          still
            ? selectedModel
            : fromPrefs ?? pickDefaultModel(models);
        set({
          agentStatus: "up",
          agentDetail: health.version ?? null,
          agentModels: models,
          selectedModel: nextModel,
        });
        if (nextModel != null) {
          void persistAgentPrefs();
        }
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
      const variants = model.capabilities.reasoningVariants ?? [];
      let effort = get().reasoningEffort;
      if (
        model.capabilities.reasoning &&
        variants.length > 0 &&
        !variants.includes(effort)
      ) {
        effort = variants.includes("high") ? "high" : variants[0]!;
      }
      set({ selectedModel: model, reasoningEffort: effort });
      void persistAgentPrefs();
    },

    setReasoningEffort(effort) {
      set({ reasoningEffort: effort });
      void persistAgentPrefs();
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
      const root = get().projectMeta?.root;
      if (root != null && root !== "") {
        void prefs.setLastAgentSession(root, agentSessionId);
      }
    },

    openAgentSession(agentSessionId, title) {
      const { sessions } = get();
      const existing = sessions.find((s) => s.agentSessionId === agentSessionId);
      if (existing != null) {
        set({ activeSessionId: existing.id, chatOpen: true });
        get().bindAgentSession(agentSessionId);
        return;
      }
      const session = { ...newChatSession(title ?? null), agentSessionId };
      set({
        sessions: [...sessions, session],
        activeSessionId: session.id,
        chatOpen: true,
      });
      const root = get().projectMeta?.root;
      if (root != null && root !== "") {
        void prefs.setLastAgentSession(root, agentSessionId);
      }
    },

    deleteLocalSession(id) {
      if (get().agentBusy) return;
      let { sessions, activeSessionId } = get();
      const remaining = sessions.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fresh = newChatSession();
        set({ sessions: [fresh], activeSessionId: fresh.id });
        return;
      }
      const nextActive =
        activeSessionId === id ? remaining[0]!.id : activeSessionId;
      set({ sessions: remaining, activeSessionId: nextActive });
    },

    async deleteAgentSession(sessionId) {
      if (primaryAgent?.deleteSession == null) {
        throw new Error("El agente no soporta eliminar sesiones.");
      }
      const root = get().projectMeta?.root;
      if (root == null || root === "") {
        throw new Error("No hay proyecto abierto.");
      }
      await primaryAgent.deleteSession(sessionId, root);
      set((s) => ({
        agentSessions: s.agentSessions.filter((sess) => sess.id !== sessionId),
        sessions: s.sessions.map((sess) =>
          sess.agentSessionId === sessionId
            ? { ...sess, agentSessionId: null }
            : sess,
        ),
      }));
      if (root != null) {
        const saved = await prefs.getLastAgentSession(root);
        if (saved === sessionId) {
          const active = get().sessions.find(
            (sess) => sess.id === get().activeSessionId,
          )?.agentSessionId;
          if (active != null && active !== "") {
            await prefs.setLastAgentSession(root, active);
          }
        }
      }
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
      const next = on ?? !get().layersOpen;
      set({ layersOpen: next });
      if (next && get().previewStatus === "live") {
        previewPort.requestTree();
      }
    },

    selectLayer(id) {
      previewPort.selectNode(id);
    },

    selectAncestor() {
      previewPort.selectAncestor();
    },

    dismissPreviewMismatch() {
      if (mismatchToastTimer !== null) {
        clearTimeout(mismatchToastTimer);
        mismatchToastTimer = null;
      }
      set({ previewMismatch: null });
    },

    navigatePreview(path) {
      const normalized = path.startsWith("/") ? path : `/${path}`;
      set({
        previewPath: normalized,
        selection: null,
        selectedId: null,
        hoverSelection: null,
        tweaks: [],
        tweakLog: [],
        reloadNonce: get().reloadNonce + 1,
      });
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

  persistWorkspacePrefs = async () => {
    const { projectMeta, lastProject, openProjectTabs } = store.getState();
    const path = projectMeta?.root ?? lastProject;
    if (path != null && path !== "") {
      await prefs.setLastProject(path);
      await persistProjectWorkspace(path);
    }
    await prefs.setOpenProjectTabs(openProjectTabs);
  };

  persistProjectWorkspace = async (root: string) => {
    const snap = restoreWorkspace(root);
    if (snap == null) return;
    // Guard anti-sobrescritura: no reemplazar un workspace con historial por
    // uno vacío (evita pérdidas por resets transitorios).
    const blocks = countBlocks(snap);
    if (blocks === 0) {
      const existing = await prefs.getProjectWorkspace(root);
      if (existing != null && countBlocks(existing) > 0) return;
    }
    await prefs.setProjectWorkspace(root, snap);
  };

  let persistProjectWorkspaceTimer: ReturnType<typeof setTimeout> | null = null;
  schedulePersistProjectWorkspace = (root: string) => {
    if (persistProjectWorkspaceTimer != null) {
      clearTimeout(persistProjectWorkspaceTimer);
    }
    persistProjectWorkspaceTimer = setTimeout(() => {
      void persistProjectWorkspace(root);
    }, 600);
  };

  store.subscribe((state, prev) => {
    const root = state.projectMeta?.root;
    if (root == null) return;
    if (
      state.sessions !== prev.sessions ||
      state.activeSessionId !== prev.activeSessionId ||
      state.draftNote !== prev.draftNote
    ) {
      snapshotWorkspace(root, state);
      schedulePersistProjectWorkspace(root);
    }
  });

  async function persistAgentPrefs(): Promise<void> {
    const { selectedModel, reasoningEffort, agentPorts } = store.getState();
    await prefs.setAgentPrefs({
      providerId:
        selectedModel?.providerId ?? agentPorts[0]?.id ?? null,
      modelId: selectedModel?.modelId ?? null,
      reasoningEffort,
    });
  }

  async function restoreAgentSessionForProject(root: string): Promise<void> {
    const savedId = await prefs.getLastAgentSession(root);
    if (savedId == null || savedId === "") return;
    const hit = store.getState().agentSessions.find((s) => s.id === savedId);
    if (hit != null) {
      store.getState().bindAgentSession(savedId);
    }
  }

  // Mensajes del bridge → estado (ARCHITECTURE §9: previewSlice habla
  // con PreviewPort; select/hover/navigate llegan por acá).
  previewPort.subscribe((msg) => {
    switch (msg.type) {
      case "steer:ready": {
        // Iframe nuevo: reponer modo (comment/inspect/interact). Los
        // overrides son efímeros y mueren con el documento.
        const st = store.getState();
        previewPort.setMode(st.mode);
        scheduleTreeRequests();
        break;
      }
      case "steer:select": {
        store.setState({
          selection: msg.selection,
          selectedId: msg.id,
          scope: "instance",
        });
        const pending = pendingMismatch;
        if (pending == null) break;
        const key = locKey(msg.selection);
        const relevant = pending.filter(
          (t) => locKey({ source: t.source }) === key,
        );
        if (relevant.length === 0) break;
        pendingMismatch = null;
        const miss = relevant.some(
          (t) =>
            !computedMatchesTweak(t.prop, msg.selection.computed[t.prop], t.to),
        );
        if (miss) showMismatchToast();
        break;
      }
      case "steer:open-inspector":
        store.getState().setMode("inspect");
        break;
      case "steer:hover":
        store.setState({ hoverSelection: msg.selection });
        break;
      case "steer:navigate":
        // UX §5.9: la cola de intents (Fase E) se conservará; los drafts
        // de override son del documento anterior y se limpian.
        clearMismatchCheck();
        store.setState({
          previewPath: msg.href,
          selection: null,
          selectedId: null,
          hoverSelection: null,
          tweaks: [],
          tweakLog: [],
        });
        break;
      case "steer:tree": {
        store.setState({ tree: msg.nodes });
        for (const i of store.getState().queue) {
          if (i.kind !== "comment") continue;
          const node = findTreeNodeBySource(msg.nodes, locKey(i.selection));
          if (node !== null) {
            previewPort.addPin(i.id, node.id, i.pin, i.body, "comment");
          }
        }
        syncEditPins();
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
                      reasoning: "",
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
        // Nuevo comentario: el bridge manda selection + steerId del nodo.
        const patch: {
          selectedId?: string;
          selection?: typeof msg.selection;
        } = {};
        if (msg.steerId) patch.selectedId = msg.steerId;
        if (msg.selection != null) patch.selection = msg.selection;
        if (Object.keys(patch).length > 0) {
          store.setState(patch);
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
