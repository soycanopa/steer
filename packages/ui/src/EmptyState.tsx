// EmptyState — UI.md §7 / UX.md §5.1. Pantalla completa, no el layout de
// tres zonas. Sin video, sin carousel.

import { t } from "./i18n";

export type EmptyStateProps = {
  recents: string[];
  opening: boolean;
  creating?: boolean;
  error: string | null;
  onOpenProject(): void;
  onCreateProject(): void;
  onOpenRecent(path: string): void;
  /** Arrastra la ventana (callback del composition root). */
  onStartDrag?(): void;
};

export function EmptyState({
  recents,
  opening,
  creating = false,
  error,
  onOpenProject,
  onCreateProject,
  onOpenRecent,
  onStartDrag,
}: EmptyStateProps) {
  const busy = opening || creating;
  return (
    <div
        data-tauri-drag-region=""
        className="flex h-full select-none items-center justify-center overflow-y-auto bg-[var(--bg-0)] px-6 pt-10 pb-6"
        onMouseDown={(e) => {
          if (e.button !== 0 || !onStartDrag) return;
          const t = e.target as HTMLElement | null;
          if (t?.closest("button, a, input, select, textarea, [role=button]")) {
            return;
          }
          onStartDrag();
        }}
      >
      <div className="flex w-full max-w-[420px] flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 text-[length:var(--fs-3)] font-semibold text-[var(--text-0)]">
            <span
              className="size-3.5 rounded-[4px] bg-[var(--accent)]"
              aria-hidden
            />
            Steer
          </div>
          <p className="text-[length:var(--fs-2)] text-[var(--text-2)]">
            {t.home.tagline}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onOpenProject}
            className="rounded-[var(--radius-m)] bg-[var(--accent)] px-4 py-2 text-[length:var(--fs-2)] font-medium text-white transition-colors duration-120 hover:bg-[#6c99ff] disabled:opacity-40"
          >
            {opening ? t.home.detecting : t.home.openProject}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCreateProject}
            className="rounded-[var(--radius-m)] bg-[var(--bg-2)] px-4 py-2 text-[length:var(--fs-2)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-3)] disabled:opacity-40"
          >
            {creating ? t.home.creating : t.home.createProject}
          </button>
        </div>

        {error ? (
          <p
            role="alert"
            className="text-[length:var(--fs-1)] text-[var(--danger)]"
          >
            {error}
          </p>
        ) : null}

        {recents.length > 0 ? (
          <div className="w-full">
            <p className="mb-1 text-left font-mono text-[length:var(--fs-0)] tracking-wide text-[var(--text-2)] uppercase">
              {t.home.recents}
            </p>
            <ul>
              {recents.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => onOpenRecent(path)}
                    className="w-full truncate rounded-[var(--radius-s)] px-2 py-1 text-left font-mono text-[length:var(--fs-1)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-2)]"
                    title={path}
                  >
                    {path}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
          {t.home.codeStaysLocal}
        </p>
      </div>
    </div>
  );
}
