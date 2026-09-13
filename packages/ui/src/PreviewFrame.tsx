// PreviewFrame — UI.md §4. Barra mini (28px) + iframe flotante con
// margen 12 y radius-m. Inspect vive aquí desde Fase C: el iframe
// entrega selecciones steer:*; el pre de debug es el criterio de hecho
// de la fase (archivo:línea visible). El Inspector real llega en D.

import { Crosshair, MousePointerClick, RotateCw } from "lucide-react";
import type { Selection } from "@steer/domain";

export type PreviewStatusUi = "idle" | "starting" | "live" | "down";

export type PreviewFrameProps = {
  url: string | null;
  status: PreviewStatusUi;
  error: string | null;
  /** Cambia para remontar el iframe (reload). */
  iframeKey: string;
  inspectOn: boolean;
  selection: Selection | null;
  onToggleInspect(): void;
  onReload(): void;
  onRetry(): void;
  /** Registro del iframe para el PreviewPort (sin React en el adapter). */
  onFrameEl(el: HTMLIFrameElement | null): void;
};

export function PreviewFrame({
  url,
  status,
  error,
  iframeKey,
  inspectOn,
  selection,
  onToggleInspect,
  onReload,
  onRetry,
  onFrameEl,
}: PreviewFrameProps) {
  const live = status === "live" && url !== null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 px-3">
        <ToolbarButton
          onClick={onToggleInspect}
          disabled={!live}
          active={inspectOn}
          title="Inspect (I)"
        >
          <Crosshair size={14} strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton disabled title="Interact es el modo default — control fino en Fase D">
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
          disabled={!live}
          title="Recargar preview"
        >
          <RotateCw size={14} strokeWidth={1.75} />
        </ToolbarButton>
      </div>

      <div className="min-h-0 flex-1 px-3">
        <div className="h-full overflow-hidden rounded-[var(--radius-m)] border border-[var(--line)] bg-white">
          {live ? (
            <iframe
              key={iframeKey}
              ref={onFrameEl}
              src={url ?? undefined}
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

      {/* Debug — Fase C. El Inspector de Fase D lo reemplaza. */}
      {live ? (
        <pre className="mx-3 mb-3 max-h-8 shrink-0 overflow-hidden truncate rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--bg-1)] px-2 py-1 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
          {selection
            ? selection.source.file
              ? `${selection.source.file}:${selection.source.line}:${selection.source.col}  ·  <${selection.tag}>`
              : `sin ${"data-tsd-source"} en <${selection.tag}> — activa TanStack Devtools source injection`
            : "Inspect ON — haz click en un nodo"}
        </pre>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick?(): void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  const base =
    "flex size-5 items-center justify-center rounded-[var(--radius-s)] transition-colors duration-120 ";
  const state = disabled
    ? "text-[var(--text-1)] opacity-40 cursor-default"
    : active
      ? "bg-[var(--accent)] text-white hover:bg-[#6c99ff]"
      : "text-[var(--text-1)] hover:bg-[var(--bg-3)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={base + state}
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
