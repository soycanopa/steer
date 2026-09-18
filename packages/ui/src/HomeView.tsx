// HomeView — inicio: recientes (con thumbnail) arriba + composer central.

import { useState, type ReactNode } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import { t } from "./i18n";

export type RecentProjectView = {
  path: string;
  name: string;
  /** Proyecto activo en el store (preview disponible). */
  active: boolean;
  /** URL live del dev server (preview en vivo) o null. */
  previewUrl: string | null;
  /** Thumbnail persistido del preview (data URL) o null. */
  thumbnail: string | null;
};

export type HomeViewProps = {
  recents: RecentProjectView[];
  opening?: boolean;
  error?: string | null;
  onOpenProject(): void;
  onSelectProject(path: string): void;
  onDeleteProject(path: string): void;
  composer: ReactNode;
};

export function HomeView({
  recents,
  opening = false,
  error = null,
  onOpenProject,
  onSelectProject,
  onDeleteProject,
  composer,
}: HomeViewProps) {
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-m)] bg-[var(--bg-0)] p-6">
      <div
        className="steer-pixel-grid pointer-events-none absolute inset-0"
        aria-hidden
      />
      <div className="relative z-10 mx-auto flex w-full max-w-[720px] min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4">
          <span className="text-[length:var(--fs-2)] font-semibold text-[var(--text-0)]">
            Steer
          </span>
          <button
            type="button"
            disabled={opening}
            onClick={onOpenProject}
            className="flex items-center gap-1.5 rounded-[var(--radius-m)] bg-[var(--bg-2)] px-3 py-1.5 text-[length:var(--fs-1)] font-medium text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-3)] disabled:opacity-40"
          >
            <FolderOpen size={14} strokeWidth={1.75} aria-hidden />
            {opening ? t.home.opening : t.home.openProject}
          </button>
        </header>

        {error ? (
          <p
            role="alert"
            className="mt-3 shrink-0 text-[length:var(--fs-1)] text-[var(--danger)]"
          >
            {error}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col justify-center gap-8 py-8">
          {recents.length > 0 ? (
            <section className="flex min-h-0 flex-col">
              <p className="mb-2 shrink-0 font-mono text-[length:var(--fs-0)] tracking-wide text-[var(--text-2)] uppercase">
                {t.home.recents}
              </p>
              <ul className="grid min-h-0 auto-rows-max grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 overflow-y-auto pb-1">
                {recents.map((project) => (
                  <li key={project.path}>
                    <RecentCard
                      project={project}
                      onSelect={() => onSelectProject(project.path)}
                      onDelete={() => onDeleteProject(project.path)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="shrink-0">{composer}</div>
        </div>
      </div>
    </div>
  );
}

function RecentCard({
  project,
  onSelect,
  onDelete,
}: {
  project: RecentProjectView;
  onSelect(): void;
  onDelete(): void;
}) {
  // El preview live solo se monta al hover: en reposo se muestra el
  // thumbnail para no renderizar N apps a la vez (perf).
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const showLive = hovered && project.previewUrl != null && !confirming;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative flex w-full flex-col overflow-hidden rounded-[var(--radius-m)] border bg-[var(--bg-1)] text-left shadow-sm transition-colors duration-120 hover:bg-[var(--bg-2)] ${
        project.active ? "border-[var(--accent)]/45" : "border-[var(--line)]"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className="flex w-full flex-col text-left outline-none"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-[var(--bg-2)]">
          {showLive ? (
            // Preview live (solo hover): 5× escalado a la card.
            <iframe
              src={project.previewUrl!}
              title={t.home.previewOf(project.name)}
              tabIndex={-1}
              className="pointer-events-none absolute top-0 left-0 h-[500%] w-[500%] origin-top-left scale-[0.2] border-0"
            />
          ) : project.thumbnail != null ? (
            <img
              src={project.thumbnail}
              alt={t.home.previewOf(project.name)}
              className="size-full object-cover object-top"
              draggable={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[var(--text-2)] transition-colors duration-120 group-hover:text-[var(--text-1)]">
              <FolderOpen size={24} strokeWidth={1.5} aria-hidden />
            </div>
          )}
        </div>
        <div className="px-2.5 py-2">
          <span className="block truncate text-[length:var(--fs-1)] font-medium text-[var(--text-0)]">
            {project.name}
          </span>
        </div>
      </button>

      {confirming ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[var(--bg-0)] px-3 text-center">
          <p className="text-[length:var(--fs-1)] text-[var(--text-1)]">
            {t.home.deleteConfirmTitle(project.name)}
          </p>
          <p className="text-[length:var(--fs-0)] text-[var(--text-2)]">
            {t.home.deleteConfirmBody}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-[var(--radius-s)] px-2.5 py-1 text-[length:var(--fs-1)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-2)]"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-[var(--radius-s)] bg-[var(--danger)] px-2.5 py-1 text-[length:var(--fs-1)] font-medium text-white transition-colors duration-120 hover:bg-[#e85d5d]"
            >
              {t.common.delete}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          title={t.home.deleteProject}
          aria-label={t.home.deleteAria(project.name)}
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          className="absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-[var(--radius-s)] bg-[var(--bg-0)]/85 text-[var(--text-2)] opacity-0 transition-opacity duration-120 hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
