// PreviewFrame — UI.md §4. Barra mini (28px) + iframe flotante con
// margen 12 y radius-m. En Fase B el iframe carga el dev server directo;
// los toggles Inspect/Interact llegan con el bridge (Fase C).

import { Crosshair, MousePointerClick, RotateCw } from "lucide-react";

export type PreviewStatusUi = "idle" | "starting" | "live" | "down";

export type PreviewFrameProps = {
  url: string | null;
  status: PreviewStatusUi;
  error: string | null;
  /** Cambia para remontar el iframe (reload). */
  iframeKey: string;
  onReload(): void;
  onRetry(): void;
};

export function PreviewFrame({
  url,
  status,
  error,
  iframeKey,
  onReload,
  onRetry,
}: PreviewFrameProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 px-3">
        <ToolbarButton disabled title="Inspect — llega con el bridge (Fase C)">
          <Crosshair size={14} strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton disabled title="Interact — llega con el bridge (Fase C)">
          <MousePointerClick size={14} strokeWidth={1.75} />
        </ToolbarButton>
        <span
          className="min-w-0 flex-1 truncate rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 py-0.5 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
          title={url ?? undefined}
        >
          {url ?? "—"}
        </span>
        <ToolbarButton
          onClick={onReload}
          disabled={status !== "live"}
          title="Recargar preview"
        >
          <RotateCw size={14} strokeWidth={1.75} />
        </ToolbarButton>
      </div>

      <div className="min-h-0 flex-1 px-3 pb-3">
        <div className="h-full overflow-hidden rounded-[var(--radius-m)] border border-[var(--line)] bg-white">
          {status === "live" && url !== null ? (
            <iframe
              key={iframeKey}
              src={url}
              title="Preview del proyecto"
              className="h-full w-full"
            />
          ) : status === "starting" ? (
            <PreviewSkeleton />
          ) : status === "down" ? (
            <PreviewDown error={error} onRetry={onRetry} />
          ) : (
            <PreviewIdle />
          )}
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?(): void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex size-5 items-center justify-center rounded-[var(--radius-s)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-3)] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-1)]">
      <span className="size-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />
      <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
        Arrancando dev server…
      </p>
    </div>
  );
}

function PreviewDown({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry(): void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-1)] px-6 text-center">
      <p className="text-[length:var(--fs-2)] text-[var(--danger)]">
        Preview caído.
      </p>
      {error ? (
        <pre className="max-h-40 max-w-full overflow-auto whitespace-pre-wrap font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
          {error}
        </pre>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[var(--radius-s)] bg-[var(--bg-2)] px-3 py-1.5 text-[length:var(--fs-1)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-3)]"
      >
        Reintentar
      </button>
    </div>
  );
}

function PreviewIdle() {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--bg-1)]">
      <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
        Sin preview.
      </p>
    </div>
  );
}
