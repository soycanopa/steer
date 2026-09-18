// ProjectTabStrip — tabs compactos alineados con la columna de preview.

import { FolderOpen, Home, Plus, X } from "lucide-react";
import { t } from "./i18n";

export type ProjectTab = {
  path: string;
  name: string;
  active: boolean;
};

export type ProjectTabStripProps = {
  tabs: ProjectTab[];
  homeActive?: boolean;
  onGoHome(): void;
  onSelectTab(path: string): void;
  onCloseTab(path: string): void;
  onNewProject(): void;
  onStartDrag?(): void;
};

export function ProjectTabStrip({
  tabs,
  homeActive = false,
  onGoHome,
  onSelectTab,
  onCloseTab,
  onNewProject,
  onStartDrag,
}: ProjectTabStripProps) {
  return (
    <>
      <div className="flex shrink-0 items-end gap-1">
        <button
          type="button"
          onClick={onGoHome}
          title={t.tabs.home}
          className={`flex h-[26px] shrink-0 items-center px-2.5 transition-colors duration-120 ${
            homeActive
              ? "steer-home-tab text-[var(--text-0)]"
              : "mb-px rounded-[5px] bg-[var(--bg-2)]/90 text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text-0)]"
          }`}
        >
          <Home size={12} strokeWidth={2} aria-hidden />
        </button>
        {tabs.map((tab) => {
          const tabClass = tab.active
            ? "steer-project-tab"
            : homeActive
              ? "mb-px rounded-[6px] bg-[var(--bg-0)]"
              : "mb-px rounded-t-[6px] bg-[var(--bg-2)]/70";
          return (
            <div
              key={tab.path}
              className={`flex h-[26px] max-w-[200px] min-w-0 items-stretch text-[length:var(--fs-1)] text-[var(--text-0)] ${tabClass}`}
            >
              <button
                type="button"
                onClick={() => onSelectTab(tab.path)}
                title={t.tabs.backToProject}
                className="flex min-w-0 flex-1 items-center gap-1.5 pl-2.5 pr-1 transition-opacity duration-120 hover:opacity-90"
              >
                <FolderOpen
                  size={11}
                  strokeWidth={1.75}
                  className="shrink-0 text-[var(--text-2)]"
                  aria-hidden
                />
                <span className="truncate">{tab.name}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.path);
                }}
                title={t.tabs.closeProject}
                className="flex w-6 shrink-0 items-center justify-center pr-1.5 text-[var(--text-2)] transition-colors duration-120 hover:text-[var(--text-0)]"
              >
                <X size={11} strokeWidth={2} aria-hidden />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={onNewProject}
          title={t.tabs.openAnother}
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
