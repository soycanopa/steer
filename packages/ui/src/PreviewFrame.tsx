// PreviewFrame — UI.md §4 / UX §4. Toolbar: tools a la izquierda,
// dirección centrada (píldora), recargar a la derecha.

import {
  Camera,
  Crosshair,
  Globe,
  Layers,
  MessageSquarePlus,
  Monitor,
  MousePointer,
  RotateCw,
} from "lucide-react";

export type PreviewStatusUi = "idle" | "starting" | "live" | "down";
export type PreviewModeUi = "interact" | "comment" | "inspect";

const MODE_META: Record<
  PreviewModeUi,
  { label: string; hint: string; Icon: typeof MousePointer }
> = {
  interact: {
    label: "Interactuar",
    hint: "Click = usar la app (V)",
    Icon: MousePointer,
  },
  comment: {
    label: "Comentarios",
    hint: "Click = pin para el agente (C)",
    Icon: MessageSquarePlus,
  },
  inspect: {
    label: "Inspección",
    hint: "Click = nodo + tweaks (I)",
    Icon: Crosshair,
  },
};

export type PreviewFrameProps = {
  url: string | null;
  status: PreviewStatusUi;
  error: string | null;
  iframeKey: string;
  mode: PreviewModeUi;
  onSetMode(mode: PreviewModeUi): void;
  onReload(): void;
  onRetry(): void;
  onCapture(): void;
  onFrameEl(el: HTMLIFrameElement | null): void;
  layersOpen?: boolean;
  onToggleLayers?(): void;
};

export function PreviewFrame({
  url,
  status,
  error,
  iframeKey,
  mode,
  onSetMode,
  onReload,
  onRetry,
  onCapture,
  onFrameEl,
  layersOpen = false,
  onToggleLayers,
}: PreviewFrameProps) {
  const live = status === "live" && url !== null;

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex h-10 shrink-0 items-center px-3">
        <div className="z-10 flex items-center gap-0.5">
          {(Object.keys(MODE_META) as PreviewModeUi[]).map((key) => {
            const meta = MODE_META[key];
            const Icon = meta.Icon;
            return (
              <ToolbarButton
                key={key}
                disabled={!live}
                active={mode === key}
                title={`${meta.label} — ${meta.hint}`}
                onClick={() => live && onSetMode(key)}
              >
                <Icon size={15} strokeWidth={1.75} />
              </ToolbarButton>
            );
          })}
          {onToggleLayers ? (
            <ToolbarButton
              active={layersOpen}
              title={layersOpen ? "Ocultar capas" : "Mostrar capas"}
              onClick={onToggleLayers}
            >
              <Layers size={15} strokeWidth={1.75} />
            </ToolbarButton>
          ) : null}
          <ToolbarButton
            onClick={onCapture}
            disabled={!live}
            title="Cámara — capturar preview al chat"
          >
            <Camera size={15} strokeWidth={1.75} />
          </ToolbarButton>
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="pointer-events-auto flex h-7 max-w-[280px] items-center gap-2 rounded-full bg-[var(--bg-2)] px-3"
            title={url ?? undefined}
          >
            <Globe size={13} strokeWidth={1.75} className="shrink-0 text-[var(--text-2)]" />
            <span className="min-w-0 truncate text-[12.5px] text-[var(--text-1)]">
              {routeLabel(url)}
            </span>
            <span
              className={`size-1.5 shrink-0 rounded-full ${
                status === "live"
                  ? "bg-[#ff8a4c]"
                  : status === "down"
                    ? "bg-[var(--danger)]"
                    : "bg-[var(--text-2)]"
              }`}
              aria-hidden
            />
          </div>
        </div>

        <div className="z-10 ml-auto flex items-center gap-0.5">
          <ToolbarButton
            onClick={onReload}
            disabled={!live}
            title="Recargar preview"
          >
            <RotateCw size={15} strokeWidth={1.75} />
          </ToolbarButton>
          <span
            title="Preview"
            className="flex size-7 items-center justify-center text-[var(--text-2)]"
          >
            <Monitor size={15} strokeWidth={1.75} />
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-3 pb-3">
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
    </div>
  );
}

function routeLabel(url: string | null): string {
  if (url == null || url === "") return "—";
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop();
    return last ?? "home";
  } catch {
    return url;
  }
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
    "flex size-7 items-center justify-center rounded-[8px] transition-colors duration-120 ";
  const state = disabled
    ? "text-[var(--text-2)] opacity-40 cursor-default"
    : active
      ? "text-[var(--text-0)]"
      : "text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--bg-3)]";
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
        className="rounded-[var(--radius-s)] bg-[var(--bg-2)] px-3 py-1 text-[length:var(--fs-1)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-3)]"
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
