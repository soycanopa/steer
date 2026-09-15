// HomeView — pantalla de inicio con proyectos abiertos en cards.

import { FolderOpen, Plus } from "lucide-react";

export type ProjectCardView = {
  path: string;
  name: string;
  /** Proyecto activo en el store (preview disponible). */
  active: boolean;
  previewUrl?: string | null;
  previewLive?: boolean;
};

export type HomeViewProps = {
  projects: ProjectCardView[];
  opening?: boolean;
  creating?: boolean;
  error?: string | null;
  onOpenProject(): void;
  onCreateProject(): void;
  onSelectProject(path: string): void;
};

export function HomeView({
  projects,
  opening = false,
  creating = false,
  error = null,
  onOpenProject,
  onCreateProject,
  onSelectProject,
}: HomeViewProps) {
  const busy = opening || creating;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-m)] bg-[var(--bg-0)] p-6">
      <div className="mx-auto flex w-full max-w-[960px] min-h-0 flex-1 flex-col gap-6">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[length:var(--fs-3)] font-semibold text-[var(--text-0)]">
              Proyectos
            </h1>
            <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
              Abre un proyecto TanStack Start o vuelve a uno que ya tengas abierto.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCreateProject}
              className="rounded-[var(--radius-m)] bg-[var(--bg-2)] px-3 py-1.5 text-[length:var(--fs-1)] font-medium text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-3)] disabled:opacity-40"
            >
              {creating ? "Creando…" : "Crear proyecto"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onOpenProject}
              className="flex items-center gap-1.5 rounded-[var(--radius-m)] bg-[var(--accent)] px-3 py-1.5 text-[length:var(--fs-1)] font-medium text-white transition-colors duration-120 hover:bg-[#6c99ff] disabled:opacity-40"
            >
              <Plus size={14} strokeWidth={2} aria-hidden />
              {opening ? "Abriendo…" : "Abrir proyecto"}
            </button>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="shrink-0 text-[length:var(--fs-1)] text-[var(--danger)]"
          >
            {error}
          </p>
        ) : null}

        {projects.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[var(--radius-m)] border border-dashed border-[var(--line)] bg-[var(--bg-1)]/40 px-6 py-16 text-center">
            <FolderOpen
              size={28}
              strokeWidth={1.5}
              className="text-[var(--text-2)]"
              aria-hidden
            />
            <p className="max-w-[320px] text-[length:var(--fs-2)] text-[var(--text-1)]">
              Aún no hay proyectos abiertos
            </p>
            <p className="max-w-[360px] text-[length:var(--fs-1)] text-[var(--text-2)]">
              El código se queda en tu disco. Steer no es el editor.
            </p>
          </div>
        ) : (
          <ul className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 overflow-y-auto pb-2">
            {projects.map((project) => (
              <li key={project.path}>
                <ProjectCard
                  project={project}
                  onSelect={() => onSelectProject(project.path)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onSelect,
}: {
  project: ProjectCardView;
  onSelect(): void;
}) {
  const showPreview =
    project.previewLive === true && project.previewUrl != null && project.previewUrl !== "";

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full flex-col overflow-hidden rounded-[var(--radius-m)] bg-[var(--bg-1)] text-left transition-colors duration-120 hover:bg-[var(--bg-2)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--bg-2)]">
        {showPreview ? (
          <iframe
            src={project.previewUrl!}
            title={`Preview de ${project.name}`}
            tabIndex={-1}
            className="pointer-events-none absolute top-0 left-0 h-[400%] w-[400%] origin-top-left scale-[0.25] border-0 bg-white"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--text-2)] transition-colors duration-120 group-hover:text-[var(--text-1)]">
            <FolderOpen size={28} strokeWidth={1.5} aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <span className="truncate text-[length:var(--fs-2)] font-medium text-[var(--text-0)]">
          {project.name}
        </span>
        <span
          className="truncate font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
          title={project.path}
        >
          {project.path}
        </span>
      </div>
    </button>
  );
}
