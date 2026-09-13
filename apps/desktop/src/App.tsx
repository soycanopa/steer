import { useEffect } from "react";
import { useStore } from "zustand";
import {
  AppShell,
  ChatPanel,
  EmptyState,
  InspectorPanel,
  PreviewFrame,
  SplitPane,
} from "@steer/ui";
import { setFrameEl, store } from "./composition";
import { pickDirectory } from "./tauri/dialog";

export default function App() {
  const projectStatus = useStore(store, (s) => s.projectStatus);
  const projectMeta = useStore(store, (s) => s.projectMeta);
  const projectError = useStore(store, (s) => s.projectError);
  const lastProject = useStore(store, (s) => s.lastProject);
  const previewStatus = useStore(store, (s) => s.previewStatus);
  const previewUrl = useStore(store, (s) => s.previewUrl);
  const previewError = useStore(store, (s) => s.previewError);
  const reloadNonce = useStore(store, (s) => s.reloadNonce);
  const inspectOn = useStore(store, (s) => s.inspectOn);
  const selection = useStore(store, (s) => s.selection);
  const selectedId = useStore(store, (s) => s.selectedId);
  const scope = useStore(store, (s) => s.scope);
  const tweaks = useStore(store, (s) => s.tweaks);
  const queue = useStore(store, (s) => s.queue);
  const transcript = useStore(store, (s) => s.transcript);
  const draftNote = useStore(store, (s) => s.draftNote);

  useEffect(() => {
    void store.getState().bootstrap();
  }, []);

  async function openViaDialog() {
    const path = await pickDirectory();
    if (path) await store.getState().openProject(path);
  }

  // UX.md §7: ⌘O abre · ⌘Z undo local · ⌘Enter aplica · I Inspect ·
  // C pin sobre selección · Esc deselecciona.
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
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        store.getState().applyQueue();
        return;
      }
      if (isTyping(e)) return;
      if (e.key.toLowerCase() === "i" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        store.getState().toggleInspect();
      } else if (e.key.toLowerCase() === "c" && selection !== null) {
        document.getElementById("steer-pin-input")?.focus();
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
    return (
      <AppShell
        projectName={projectMeta.name}
        projectPath={projectMeta.root}
        devStatus={devStatus}
        mode={inspectOn ? "inspect" : "interact"}
        queueCount={queue.length}
      >
        <SplitPane
          left={
            <PreviewFrame
              url={previewUrl}
              status={previewStatus}
              error={previewError}
              iframeKey={`${previewUrl ?? "none"}#${reloadNonce}`}
              inspectOn={inspectOn}
              onToggleInspect={() => store.getState().toggleInspect()}
              onReload={() => store.getState().reloadPreview()}
              onRetry={() => void store.getState().startPreview()}
              onFrameEl={setFrameEl}
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
            <ChatPanel
              transcript={transcript}
              queueCount={queue.length}
              draftNote={draftNote}
              onDraftNote={(text) => store.getState().setDraftNote(text)}
              onApply={() => store.getState().applyQueue()}
              onClearQueue={() => store.getState().clearQueue()}
            />
          }
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
    />
  );
}
