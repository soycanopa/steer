import { useEffect } from "react";
import { useStore } from "zustand";
import { AppShell, EmptyState } from "@steer/ui";
import { store } from "./composition";
import { pickDirectory } from "./tauri/dialog";

export default function App() {
  const projectStatus = useStore(store, (s) => s.projectStatus);
  const projectMeta = useStore(store, (s) => s.projectMeta);
  const projectError = useStore(store, (s) => s.projectError);
  const lastProject = useStore(store, (s) => s.lastProject);

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
    return (
      <AppShell projectName={projectMeta.name} projectPath={projectMeta.root}>
        <div className="flex h-full items-center justify-center">
          <p className="text-[length:var(--fs-2)] text-[var(--text-2)]">
            El preview vive aquí. Todavía no — llega con la Fase B.
          </p>
        </div>
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
