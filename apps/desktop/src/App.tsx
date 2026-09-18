import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  AppShell,
  ChatPanel,
  HomeComposer,
  HomeView,
  InspectorPanel,
  LayersPanel,
  type LayersTreeState,
  PreviewFrame,
  ProjectTabStrip,
  groupModelsByProvider,
  t,
  tweakEditLabel,
} from "@steer/ui";
import { joinPreviewPageUrl } from "@steer/app-state";
import { setFrameEl, store } from "./composition";
import { DebugDrawer } from "./DebugDrawer";
import { pickDirectory } from "./tauri/dialog";
import { openUrlInBrowser } from "./tauri/open-url";
import { startWindowDrag } from "./tauri/window";


// Capas: mapa del árbol del bridge al view model, marcando activo el
// nodo cuya source coincide con la selección actual.
function lastFolderName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

function mapTree(
  nodes: Array<{ id: string; tag: string; cls: string | null; text: string | null; source: string | null; children: unknown[] }> | null,
  activeSource: { file: string; line: number; col: number } | null,
): Array<{
  id: string;
  tag: string;
  cls: string | null;
  text: string | null;
  source: string | null;
  active: boolean;
  children: ReturnType<typeof mapTree>;
}> {
  if (nodes === null) return [];
  const activeKey =
    activeSource === null
      ? null
      : `${activeSource.file}:${activeSource.line}:${activeSource.col}`;
  return nodes.map((n) => ({
    id: n.id,
    tag: n.tag,
    cls: n.cls,
    text: n.text,
    source: n.source,
    active: n.source !== null && n.source === activeKey,
    children: mapTree(n.children as never, activeSource),
  }));
}

export default function App() {
  const [debugOpen, setDebugOpen] = useState(false);
  const projectStatus = useStore(store, (s) => s.projectStatus);
  const projectMeta = useStore(store, (s) => s.projectMeta);
  const projectError = useStore(store, (s) => s.projectError);
  const previewStatus = useStore(store, (s) => s.previewStatus);
  const previewUrl = useStore(store, (s) => s.previewUrl);
  const previewPath = useStore(store, (s) => s.previewPath);
  const previewError = useStore(store, (s) => s.previewError);
  const previewMismatch = useStore(store, (s) => s.previewMismatch);
  const reloadNonce = useStore(store, (s) => s.reloadNonce);
  const inspectOn = useStore(store, (s) => s.inspectOn);
  const mode = useStore(store, (s) => s.mode);
  const selection = useStore(store, (s) => s.selection);
  const selectedId = useStore(store, (s) => s.selectedId);
  const scope = useStore(store, (s) => s.scope);
  const tweaks = useStore(store, (s) => s.tweaks);
  const queue = useStore(store, (s) => s.queue);
  const tree = useStore(store, (s) => s.tree);
  const projectRoutes = useStore(store, (s) => s.projectRoutes);
  const layersOpen = useStore(store, (s) => s.layersOpen);
  const sessions = useStore(store, (s) => s.sessions);
  const activeSessionId = useStore(store, (s) => s.activeSessionId);
  const chatOpen = useStore(store, (s) => s.chatOpen);
  const draftNote = useStore(store, (s) => s.draftNote);
  const draftAttachments = useStore(store, (s) => s.draftAttachments);
  const agentStatus = useStore(store, (s) => s.agentStatus);
  const agentDetail = useStore(store, (s) => s.agentDetail);
  const agentPorts = useStore(store, (s) => s.agentPorts);
  const agentModels = useStore(store, (s) => s.agentModels);
  const selectedModel = useStore(store, (s) => s.selectedModel);
  const reasoningEffort = useStore(store, (s) => s.reasoningEffort);
  const modelParamValues = useStore(store, (s) => s.modelParamValues);
  const agentBusy = useStore(store, (s) => s.agentBusy);
  const permissionPolicy = useStore(store, (s) => s.permissionPolicy);
  const agentSessions = useStore(store, (s) => s.agentSessions);
  const [chatWidth, setChatWidth] = useState(340);
  const [layersWidth, setLayersWidth] = useState(240);
  const [workspaceView, setWorkspaceView] = useState<"home" | "project">("home");
  const openProjectTabs = useStore(store, (s) => s.openProjectTabs);
  const recentProjects = useStore(store, (s) => s.recentProjects);
  const projectThumbnails = useStore(store, (s) => s.projectThumbnails);
  const recentPreviewUrls = useStore(store, (s) => s.recentPreviewUrls);
  const createProgress = useStore(store, (s) => s.createProgress);
  const [createParentDir, setCreateParentDir] = useState<string | null>(null);
  const userChoseHomeRef = useRef(false);
  const projectCreating = projectStatus === "creating";

  // No map dentro del selector de Zustand: devuelve array nuevo y
  // dispara render loops. Derivar fuera con useMemo.
  const pendingComments = useMemo(
    () =>
      queue.flatMap((i) =>
        i.kind === "comment"
          ? [{ id: i.id, pin: i.pin, body: i.body }]
          : [],
      ),
    [queue],
  );

  const pendingEdits = useMemo(() => {
    let n = 0;
    return queue.flatMap((i) => {
      if (i.kind !== "tweak") return [];
      n += 1;
      return [
        {
          id: i.id,
          pin: n,
          prop: i.prop,
          from: i.from,
          to: i.to,
          label: tweakEditLabel(i.prop, i.to),
        },
      ];
    });
  }, [queue]);

  const activeAgentSessionId =
    sessions.find((s) => s.id === activeSessionId)?.agentSessionId ?? null;

  const agentSessionItems = useMemo(
    () =>
      agentSessions.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        bound: s.id === activeAgentSessionId,
      })),
    [agentSessions, activeAgentSessionId],
  );

  const agentTabs = useMemo(
    () => agentPorts.map((p) => ({ id: p.id, label: p.label })),
    [agentPorts],
  );
  const providerGroups = useMemo(
    () => groupModelsByProvider(agentModels),
    [agentModels],
  );
  const selectedModelKey =
    selectedModel != null
      ? `${selectedModel.providerId}/${selectedModel.modelId}`
      : null;
  const showModelReasoning =
    selectedModel?.adapterId !== "antigravity" &&
    selectedModel?.capabilities.reasoning === true;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < 60 && !cancelled; i += 1) {
        if (isTauri()) {
          await store.getState().bootstrap();
          await store.getState().syncPersistedWorkspace();
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Asegura que prefs tenga el último proyecto si cierran con el proyecto abierto.
  useEffect(() => {
    const flush = () => void store.getState().persistLastProject();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  async function openViaDialog() {
    const path = await pickDirectory();
    if (!path) return;
    userChoseHomeRef.current = false;
    await store.getState().openProjectInNewTab(path);
    setWorkspaceView("project");
  }

  async function pickCreateParentDir() {
    const path = await pickDirectory(t.dialogs.createParentDir);
    if (path) setCreateParentDir(path);
  }

  async function submitCreateProject(name: string, prompt: string) {
    if (createParentDir == null) return;
    userChoseHomeRef.current = false;
    await store.getState().createStartProject(createParentDir, name);
    if (store.getState().projectStatus !== "open") return;
    setCreateParentDir(null);
    // El prompt del home queda listo como primer mensaje del proyecto.
    store.getState().setDraftNote(prompt);
    store.getState().toggleChat(true);
    setWorkspaceView("project");
  }

  async function selectProject(path: string) {
    userChoseHomeRef.current = false;
    await store.getState().switchProjectTab(path);
    setWorkspaceView("project");
  }

  async function closeProjectTab(path: string) {
    userChoseHomeRef.current = openProjectTabs.length <= 1;
    await store.getState().closeProjectTab(path);
    if (store.getState().openProjectTabs.length === 0) {
      setWorkspaceView("home");
    }
  }

  useEffect(() => {
    if (projectStatus !== "open" || projectMeta == null) return;
    if (!userChoseHomeRef.current) {
      setWorkspaceView("project");
    }
  }, [projectStatus, projectMeta?.root]);

  // Home visible: refrescar las URLs live de los recientes (previews).
  useEffect(() => {
    if (workspaceView === "home") {
      void store.getState().refreshRecentPreviewUrls();
    }
  }, [workspaceView]);

  // UX.md §7: ⌘O abre · ⌘L composer · ⌘Z undo local · ⌘Enter aplica ·
  // I toggle Inspect · C comentarios · V interactuar · Esc deselecciona.
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target;
      return (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openViaDialog();
        return;
      }
      if (e.metaKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        store.getState().undoLastTweak();
        return;
      }
      if (e.metaKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        const composer = document.querySelector("[data-steer-composer]");
        if (composer instanceof HTMLElement) composer.focus();
        return;
      }
      if (e.metaKey && e.key === ".") {
        e.preventDefault();
        setDebugOpen((v) => !v);
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        store.getState().applyQueue();
        return;
      }
      if (isTyping(e)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "i") {
        store.getState().toggleInspect();
      } else if (e.key.toLowerCase() === "c") {
        store.getState().setMode("comment");
      } else if (e.key.toLowerCase() === "v") {
        store.getState().setMode("interact");
      } else if (e.key === "Escape") {
        store.getState().deselect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);

  const projectOpen = projectStatus === "open" && projectMeta != null;
  const showProjectWorkspace = projectOpen && workspaceView === "project";
  const previewFrameUrl =
    previewUrl != null ? joinPreviewPageUrl(previewUrl, previewPath) : null;
  const layersTreeState: LayersTreeState =
    previewStatus !== "live"
      ? "idle"
      : tree === null
        ? "loading"
        : tree.length === 0
          ? "empty"
          : "ready";
  const devStatus =
    previewStatus === "live" ? "live" : previewStatus === "down" ? "down" : "idle";
  const agentUiStatus =
    agentStatus === "up" ? "live" : agentStatus === "down" ? "down" : "idle";

  const currentTweaks =
    selection !== null && selectedId !== null
      ? tweaks
          .filter((t) => t.steerId === selectedId && t.scope === scope)
          .map((t) => ({ prop: t.prop, from: t.from, to: t.to }))
      : [];

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null;

  const sessionViews = [...sessions]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      blockCount: s.blocks.length,
      active: s.id === activeSessionId,
    }));

  const inspectorVisible = selection !== null && inspectOn;

  const projectTabs = openProjectTabs.map((path) => ({
    path,
    name: lastFolderName(path),
    active: projectMeta?.root === path && workspaceView === "project",
  }));

  const recents = recentProjects.map((path) => ({
    path,
    name: lastFolderName(path),
    active: projectMeta?.root === path,
    // El activo ya tiene su preview vivo (oculto en el home): su card usa
    // thumbnail para no duplicar la carga.
    previewUrl:
      projectMeta?.root === path ? null : (recentPreviewUrls[path] ?? null),
    thumbnail: projectThumbnails[path] ?? null,
  }));

  return (
    <AppShell
      projectTabs={
        <ProjectTabStrip
          tabs={projectTabs}
          homeActive={workspaceView === "home"}
          onGoHome={() => {
            userChoseHomeRef.current = true;
            setWorkspaceView("home");
          }}
          onSelectTab={(path) => void selectProject(path)}
          onCloseTab={(path) => void closeProjectTab(path)}
          onNewProject={() => void openViaDialog()}
          onStartDrag={startWindowDrag}
        />
      }
      devStatus={devStatus}
      agentStatus={agentUiStatus}
      agentDetail={agentDetail}
      agentBusy={agentBusy}
      modelLabel={selectedModel?.label ?? null}
      mode={mode}
      queueCount={queue.length}
    >
      <DebugDrawer open={debugOpen} />
      {showProjectWorkspace ? (
        <PreviewFrame
              url={previewFrameUrl}
              previewPath={previewPath}
              status={previewStatus}
              error={previewError}
              iframeKey={`${previewUrl ?? "none"}#${reloadNonce}`}
              mode={mode}
              onSetMode={(m) => store.getState().setMode(m)}
              onReload={() => void store.getState().recoverPreview({ waitMs: 0 })}
              onRetry={() => void store.getState().recoverPreview({ waitMs: 0 })}
              onCapture={() => store.getState().capturePreview()}
              pages={projectRoutes.map((route) => ({
                ...route,
                active: route.path === previewPath,
              }))}
              onSelectPage={(path) => store.getState().navigatePreview(path)}
              onOpenInBrowser={() => {
                const { previewUrl: base, previewPath: path } = store.getState();
                if (base != null) {
                  void openUrlInBrowser(joinPreviewPageUrl(base, path));
                }
              }}
              onFrameEl={setFrameEl}
              layersOpen={layersOpen}
              onToggleLayers={() => store.getState().toggleLayers()}
              layersPanel={
                <LayersPanel
                  nodes={mapTree(tree, selection?.source ?? null)}
                  pages={projectRoutes.map((route) => ({
                    ...route,
                    active: route.path === previewPath,
                  }))}
                  treeState={layersTreeState}
                  onSelect={(id) => store.getState().selectLayer(id)}
                  onSelectPage={(path) => store.getState().navigatePreview(path)}
                />
              }
              layersWidth={layersWidth}
              onLayersWidthChange={setLayersWidth}
              chatOpen={chatOpen}
              onToggleChat={() => store.getState().toggleChat()}
              mismatchToast={previewMismatch}
              onDismissMismatch={() => store.getState().dismissPreviewMismatch()}
              sidePanel={
                inspectorVisible ? (
                  <InspectorPanel
                    selection={selection}
                    tweaks={currentTweaks}
                    onSetTweak={(prop, to) => store.getState().setTweak(prop, to)}
                    onResetTweak={(prop) => store.getState().resetTweak(prop)}
                    onResetAll={() => store.getState().resetAllTweaks()}
                    onSelectAncestor={() => store.getState().selectAncestor()}
                    onClose={() => store.getState().deselect()}
                  />
                ) : chatOpen && activeSession !== null ? (
                  <ChatPanel
                    transcript={activeSession.blocks}
                    sessionTitle={activeSession.title}
                    sessions={sessionViews}
                    queueCount={queue.length}
                    attachments={draftAttachments}
                    draftNote={draftNote}
                    pendingComments={pendingComments}
                    pendingEdits={pendingEdits}
                    agentTabs={agentTabs}
                    providerGroups={providerGroups}
                    selectedModelKey={selectedModelKey}
                    reasoningEffort={reasoningEffort}
                    modelParamValues={modelParamValues}
                    showModelReasoning={showModelReasoning}
                    permissionPolicy={permissionPolicy}
                    agentSessions={agentSessionItems}
                    todos={activeSession.todos}
                    agentBusy={agentBusy}
                    agentOnline={agentUiStatus === "live"}
                    onDraftNote={(text) => store.getState().setDraftNote(text)}
                    onApply={() => void store.getState().applyQueue()}
                    onClearQueue={() => store.getState().clearQueue()}
                    onNewSession={() => store.getState().newSession()}
                    onSelectSession={(id) => store.getState().selectSession(id)}
                    onSelectModel={(key) => {
                      const m = agentModels.find(
                        (mod) => `${mod.providerId}/${mod.modelId}` === key,
                      );
                      if (m) store.getState().setModel(m);
                    }}
                    onSetReasoningEffort={(effort) =>
                      store.getState().setReasoningEffort(effort)
                    }
                    onSetModelParam={(id, value) =>
                      store.getState().setModelParam(id, value)
                    }
                    onSetPermissionPolicy={(policy) =>
                      store.getState().setPermissionPolicy(policy)
                    }
                    onRefreshAgentSessions={() =>
                      void store.getState().refreshAgentSessions()
                    }
                    onOpenAgentSession={(id, title) =>
                      store.getState().openAgentSession(id, title)
                    }
                    onDeleteLocalSession={(id) =>
                      store.getState().deleteLocalSession(id)
                    }
                    onDeleteAgentSession={(id) =>
                      store.getState().deleteAgentSession(id)
                    }
                    onAbort={() => void store.getState().abortTurn()}
                    onRemoveComment={(id) => store.getState().removeQueued(id)}
                    onFocusComment={(id) => store.getState().focusComment(id)}
                    onRemoveEdit={(id) => store.getState().removeQueued(id)}
                    onFocusEdit={(id) => store.getState().focusEdit(id)}
                    onRemoveAttachment={(id) =>
                      store.getState().removeAttachment(id)
                    }
                    onAnswerQuestion={(blockId, answers) =>
                      void store.getState().answerQuestion(blockId, answers)
                    }
                  />
                ) : null
              }
              sidePanelWidth={chatWidth}
              onSidePanelWidthChange={setChatWidth}
            />
      ) : (
        <HomeView
          recents={recents}
          opening={projectStatus === "opening"}
          error={projectError}
          onOpenProject={() => void openViaDialog()}
          onSelectProject={(path) => void selectProject(path)}
          onDeleteProject={(path) => void store.getState().deleteProject(path)}
          composer={
            <HomeComposer
              creating={projectCreating}
              progress={createProgress}
              error={projectCreating ? null : projectError}
              parentDir={createParentDir}
              onPickParentDir={() => void pickCreateParentDir()}
              onSubmit={(name, prompt) => void submitCreateProject(name, prompt)}
              agentTabs={agentTabs}
              providerGroups={providerGroups}
              selectedModelKey={selectedModelKey}
              reasoningEffort={reasoningEffort}
              modelParamValues={modelParamValues}
              showModelReasoning={showModelReasoning}
              agentOnline={agentUiStatus === "live"}
              onSelectModel={(key) => {
                const m = agentModels.find(
                  (mod) => `${mod.providerId}/${mod.modelId}` === key,
                );
                if (m) store.getState().setModel(m);
              }}
              onSetReasoningEffort={(effort) =>
                store.getState().setReasoningEffort(effort)
              }
              onSetModelParam={(id, value) =>
                store.getState().setModelParam(id, value)
              }
              permissionPolicy={permissionPolicy}
              onSetPermissionPolicy={(policy) =>
                store.getState().setPermissionPolicy(policy)
              }
            />
          }
        />
      )}
    </AppShell>
  );
}
