import { useEffect } from "react";
import { useStore } from "zustand";
import { AppShell, EmptyState, InspectorPanel, PreviewFrame, SplitPane } from "@steer/ui";
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

  useEffect(() => {
    void store.getState().bootstrap();
  }, []);

  async function openViaDialog() {
    const path = await pickDirectory();
    if (path) await store.getState().openProject(path);
  }

  // UX.md §7: ⌘O abre · I alterna Inspect · Esc deselecciona ·
  // ⌘Z deshace el último override local.
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
      if (isTyping(e)) return;
      if (e.key.toLowerCase() === "i" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        store.getState().toggleInspect();
      } else if (e.key === "Escape") {
        store.getState().deselect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (projectStatus === "open" && projectMeta) {
    const devStatus =
      previewStatus === "live" ? "live" : previewStatus === "down" ? "down" : "idle";

    const currentTweaks =
      selection !== null && selectedId !== null
        ? tweaks
            .filter((t) => t.steerId === selectedId && t.scope === scope)
            .map((t) => ({ prop: t.prop, from: t.from, to: t.to }))
        : [];

    return (
      <AppShell
        projectName={projectMeta.name}
        projectPath={projectMeta.root}
        devStatus={devStatus}
      >
        <SplitPane
          // El Inspector solo aparece con un nodo seleccionado; el iframe
          // queda en la misma posición del árbol para no remontarse.
          leftPct={selection !== null ? 62 : 100}
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
          right={
            selection !== null ? (
              <InspectorPanel
                selection={selection}
                scope={scope}
                tweaks={currentTweaks}
                onSetScope={(s) => store.getState().setScope(s)}
                onSetTweak={(prop, to) => store.getState().setTweak(prop, to)}
                onResetTweak={(prop) => store.getState().resetTweak(prop)}
                onResetAll={() => store.getState().resetAllTweaks()}
              />
            ) : null
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
