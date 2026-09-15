import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import {
  AppShell,
  ChatPanel,
  EmptyState,
  InspectorPanel,
  LayersPanel,
  PreviewFrame,
  SplitPane,
} from "@steer/ui";
import { setFrameEl, store } from "./composition";
import { DebugDrawer } from "./DebugDrawer";
import { pickDirectory } from "./tauri/dialog";
import { startWindowDrag } from "./tauri/window";


// Capas: mapa del árbol del bridge al view model, marcando activo el
// nodo cuya source coincide con la selección actual.
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
  const lastProject = useStore(store, (s) => s.lastProject);
  const previewStatus = useStore(store, (s) => s.previewStatus);
  const previewUrl = useStore(store, (s) => s.previewUrl);
  const previewError = useStore(store, (s) => s.previewError);
  const reloadNonce = useStore(store, (s) => s.reloadNonce);
  const inspectOn = useStore(store, (s) => s.inspectOn);
  const mode = useStore(store, (s) => s.mode);
  const selection = useStore(store, (s) => s.selection);
  const selectedId = useStore(store, (s) => s.selectedId);
  const scope = useStore(store, (s) => s.scope);
  const tweaks = useStore(store, (s) => s.tweaks);
  const queue = useStore(store, (s) => s.queue);
  const tree = useStore(store, (s) => s.tree);
  const layersOpen = useStore(store, (s) => s.layersOpen);
  const sessions = useStore(store, (s) => s.sessions);
  const activeSessionId = useStore(store, (s) => s.activeSessionId);
  const chatOpen = useStore(store, (s) => s.chatOpen);
  const draftNote = useStore(store, (s) => s.draftNote);
  const draftAttachments = useStore(store, (s) => s.draftAttachments);
  const agentStatus = useStore(store, (s) => s.agentStatus);
  const agentDetail = useStore(store, (s) => s.agentDetail);
  const agentModels = useStore(store, (s) => s.agentModels);
  const selectedModel = useStore(store, (s) => s.selectedModel);
  const agentBusy = useStore(store, (s) => s.agentBusy);
  const permissionPolicy = useStore(store, (s) => s.permissionPolicy);
  const agentSessions = useStore(store, (s) => s.agentSessions);
  const [chatWidth, setChatWidth] = useState(340);

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

  useEffect(() => {
    void store.getState().bootstrap();
  }, []);

  async function openViaDialog() {
    const path = await pickDirectory();
    if (path) await store.getState().openProject(path);
  }

  // UX.md §7: ⌘O abre · ⌘Z undo local · ⌘Enter aplica · I Inspect ·
  // C comentarios · V interactuar · Esc deselecciona.
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
        store.getState().setMode("inspect");
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

  if (projectStatus === "open" && projectMeta) {
    const devStatus =
      previewStatus === "live" ? "live" : previewStatus === "down" ? "down" : "idle";
    const agentUiStatus =
      agentStatus === "up" ? "live" : agentStatus === "down" ? "down" : "idle";

    const modelOptions = agentModels.map((m) => ({
      key: `${m.providerId}/${m.modelId}`,
      label: m.label.length > 28 ? `${m.label.slice(0, 26)}…` : m.label,
      reasoning: m.capabilities.reasoning,
    }));
    const selectedModelKey =
      selectedModel != null
        ? `${selectedModel.providerId}/${selectedModel.modelId}`
        : null;

    const currentTweaks =
      selection !== null && selectedId !== null
        ? tweaks
            .filter((t) => t.steerId === selectedId && t.scope === scope)
            .map((t) => ({ prop: t.prop, from: t.from, to: t.to }))
        : [];

    const currentPins =
      selection !== null
        ? queue
            .filter(
              (i) =>
                i.kind === "comment" &&
                i.scope === scope &&
                `${i.selection.source.file}:${i.selection.source.line}:${i.selection.source.col}` ===
                  `${selection.source.file}:${selection.source.line}:${selection.source.col}`,
            )
            .map((i) =>
              i.kind === "comment" ? { id: i.id, pin: i.pin, body: i.body } : null,
            )
            .filter((p) => p !== null)
        : [];

    // UX §3 (ajustada): preview | inspector (solo con selección) |
    // chat — el chat es columna propia, no parte del inspector.
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

    return (
      <AppShell
        projectName={projectMeta.name}
        projectPath={projectMeta.root}
        devStatus={devStatus}
        agentStatus={agentUiStatus}
        agentLabel={selectedModel?.label ?? "listo"}
        agentDetail={agentDetail}
        agentBusy={agentBusy}
        modelLabel={selectedModel?.label ?? null}
        mode={mode}
        queueCount={queue.length}
        chatOpen={chatOpen}
        onToggleChat={() => store.getState().toggleChat()}
        onStartDrag={startWindowDrag}
      >
        <DebugDrawer open={debugOpen} />
        <SplitPane
          layers={
            layersOpen ? (
              <LayersPanel
                nodes={mapTree(tree, selection?.source ?? null)}
                onSelect={(id) => store.getState().selectLayer(id)}
              />
            ) : null
          }
          left={
            <PreviewFrame
              url={previewUrl}
              status={previewStatus}
              error={previewError}
              iframeKey={`${previewUrl ?? "none"}#${reloadNonce}`}
              mode={mode}
              onSetMode={(m) => store.getState().setMode(m)}
              onReload={() => store.getState().reloadPreview()}
              onRetry={() => void store.getState().startPreview()}
              onCapture={() => store.getState().capturePreview()}
              onFrameEl={setFrameEl}
              layersOpen={layersOpen}
              onToggleLayers={() => store.getState().toggleLayers()}
            />
          }
          middle={
            // Inspector solo con nodo seleccionado Y modo Inspect ON;
            // en Interact el panel de propiedades no aparece.
            selection !== null && inspectOn ? (
              <InspectorPanel
                selection={selection}
                scope={scope}
                tweaks={currentTweaks}
                pins={currentPins}
                onSetScope={(s) => store.getState().setScope(s)}
                onSetTweak={(prop, to) => store.getState().setTweak(prop, to)}
                onResetTweak={(prop) => store.getState().resetTweak(prop)}
                onResetAll={() => store.getState().resetAllTweaks()}
                onAddPin={(body) => store.getState().queueComment(body)}
                onRemovePin={(id) => store.getState().removeQueued(id)}
              />
            ) : null
          }
          right={
            chatOpen && activeSession !== null ? (
              <ChatPanel
                transcript={activeSession.blocks}
                sessionTitle={activeSession.title}
                sessions={sessionViews}
                queueCount={queue.length}
                attachments={draftAttachments}
                draftNote={draftNote}
                pendingComments={pendingComments}
                models={modelOptions}
                selectedModelKey={selectedModelKey}
                permissionPolicy={permissionPolicy}
                agentSessions={agentSessionItems}
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
                onSetPermissionPolicy={(policy) =>
                  store.getState().setPermissionPolicy(policy)
                }
                onRefreshAgentSessions={() =>
                  void store.getState().refreshAgentSessions()
                }
                onBindAgentSession={(id) =>
                  store.getState().bindAgentSession(id)
                }
                onAbort={() => void store.getState().abortTurn()}
                onRemoveComment={(id) => store.getState().removeQueued(id)}
                onFocusComment={(id) => store.getState().focusComment(id)}
                onRemoveAttachment={(id) =>
                  store.getState().removeAttachment(id)
                }
              />
            ) : null
          }
          rightWidth={chatWidth}
          onRightWidthChange={setChatWidth}
        />
      </AppShell>
    );
  }

  return (
    <EmptyState
      recents={lastProject ? [lastProject] : []}
      opening={projectStatus === "opening"}
      error={projectError}
      onOpenProject={() => void openViaDialog()}
      onOpenRecent={(path) => void store.getState().openProject(path)}
      onStartDrag={startWindowDrag}
    />
  );
}
