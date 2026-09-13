import { useEffect } from "react";
import { useStore } from "zustand";
import { AppShell, EmptyState, PreviewFrame } from "@steer/ui";
import { store } from "./composition";
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

  useEffect(() => {
    void store.getState().bootstrap();
  }, []);

  async function openViaDialog() {
    const path = await pickDirectory();
    if (path) await store.getState().openProject(path);
  }

  // UX.md §7: ⌘O abre proyecto desde cualquier pantalla.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openViaDialog();
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
          onReload={() => store.getState().reloadPreview()}
          onRetry={() => void store.getState().startPreview()}
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
