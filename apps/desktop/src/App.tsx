import { useEffect } from "react";
import { useStore } from "zustand";
import { AppShell, EmptyState, PreviewFrame } from "@steer/ui";
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

  useEffect(() => {
    void store.getState().bootstrap();
  }, []);

  async function openViaDialog() {
    const path = await pickDirectory();
    if (path) await store.getState().openProject(path);
  }

  // UX.md §7: ⌘O abre, I alterna Inspect, Esc deselecciona (focus fuera
  // de inputs; los atajos del composer llegan con el chat, Fase E).
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

    return (
      <AppShell
        projectName={projectMeta.name}
        projectPath={projectMeta.root}
        devStatus={devStatus}
      >
        <PreviewFrame
          url={previewUrl}
          status={previewStatus}
          error={previewError}
          iframeKey={`${previewUrl ?? "none"}#${reloadNonce}`}
          inspectOn={inspectOn}
          selection={selection}
          onToggleInspect={() => store.getState().toggleInspect()}
          onReload={() => store.getState().reloadPreview()}
          onRetry={() => void store.getState().startPreview()}
          onFrameEl={setFrameEl}
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
