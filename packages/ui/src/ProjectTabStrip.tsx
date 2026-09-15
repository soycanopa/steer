// ProjectTabStrip — tabs compactos alineados con la columna de preview.

import { FolderOpen, Home, Plus } from "lucide-react";

export type ProjectTabStripProps = {
  projectName?: string | null;
  homeActive?: boolean;
  projectActive?: boolean;
  onGoHome(): void;
  onSelectProject?(): void;
  onNewProject(): void;
  onStartDrag?(): void;
};

export function ProjectTabStrip({
  projectName = null,
  homeActive = false,
  projectActive = false,
  onGoHome,
  onSelectProject,
  onNewProject,
  onStartDrag,
}: ProjectTabStripProps) {
  return (
    <>
      <div className="flex shrink-0 items-end gap-1">
        <button
          type="button"
          onClick={onGoHome}
          title="Inicio"
          className={`flex h-[26px] shrink-0 items-center px-2.5 transition-colors duration-120 ${
            homeActive
              ? "steer-home-tab text-[var(--text-0)]"
              : "mb-px rounded-[5px] bg-[var(--bg-2)]/90 text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text-0)]"
          }`}
        >
          <Home size={12} strokeWidth={2} aria-hidden />
        </button>
        {projectName != null && projectName !== "" ? (
          <button
            type="button"
            onClick={onSelectProject}
            title="Volver al proyecto"
            className={`flex h-[26px] max-w-[168px] min-w-0 items-center gap-1.5 px-2.5 text-[length:var(--fs-1)] text-[var(--text-0)] transition-opacity duration-120 hover:opacity-90 ${
              projectActive
                ? "steer-project-tab"
                : homeActive
                  ? "mb-px rounded-[6px] bg-[var(--bg-0)]"
                  : "mb-px rounded-t-[6px] bg-[var(--bg-2)]/70"
            }`}
          >
            <FolderOpen
              size={11}
              strokeWidth={1.75}
              className="shrink-0 text-[var(--text-2)]"
              aria-hidden
            />
            <span className="truncate">{projectName}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onNewProject}
          title="Abrir otro proyecto"
          className="mb-px flex size-[22px] shrink-0 items-center justify-center rounded-[6px] bg-[var(--bg-0)] text-[var(--text-2)] transition-colors duration-120 hover:text-[var(--text-0)]"
        >
          <Plus size={12} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div
        data-tauri-drag-region=""
        className="min-h-[26px] min-w-8 flex-1 self-stretch"
        onMouseDown={(e) => {
          if (e.button !== 0 || !onStartDrag) return;
          onStartDrag();
        }}
      />
    </>
  );
}
