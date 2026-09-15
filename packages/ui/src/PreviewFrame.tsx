// PreviewFrame — UI.md §4 / UX §4. Toolbar: menú de modos (icono +
// popover), cámara, url, reload.

import { useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  Crosshair,
  MessageSquarePlus,
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
}: PreviewFrameProps) {
  const live = status === "live" && url !== null;
  const [modeOpen, setModeOpen] = useState(false);
  const current = MODE_META[mode];
  const CurrentIcon = current.Icon;

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex h-8 shrink-0 items-center gap-1 px-3">
        {/* Menú de modos: un icono = modo activo; click = popover. */}
        <div className="relative">
          <button
            type="button"
            disabled={!live}
            onClick={() => setModeOpen((v) => !v)}
            title={`${current.label} — ${current.hint}`}
            className={`flex size-6 items-center justify-center rounded-[var(--radius-s)] transition-colors duration-120 ${
              live
                ? mode !== "interact"
                  ? "bg-[var(--accent)] text-white hover:bg-[#6c99ff]"
                  : "text-[var(--text-1)] hover:bg-[var(--bg-3)]"
                : "text-[var(--text-1)] opacity-40"
            }`}
          >
            <CurrentIcon size={14} strokeWidth={1.75} />
          </button>
          {modeOpen ? (
            <>
              <button
                type="button"
                aria-label="Cerrar menú de modos"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setModeOpen(false)}
              />
              <div className="absolute top-full left-0 z-20 mt-1 w-44 rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)] py-1 shadow-lg">
                {(Object.keys(MODE_META) as PreviewModeUi[]).map((key) => {
                  const meta = MODE_META[key];
                  const Icon = meta.Icon;
                  const active = mode === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setModeOpen(false);
                        if (live) onSetMode(key);
                      }}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-120 ${
                        active
                          ? "bg-[var(--accent-dim)] text-[var(--text-0)]"
                          : "text-[var(--text-1)] hover:bg-[var(--bg-2)]"
                      }`}
                    >
                      <Icon size={13} strokeWidth={1.75} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[length:var(--fs-1)]">
                          {meta.label}
                        </span>
                        <span className="block truncate font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
                          {meta.hint}
                        </span>
                      </span>
                      {active ? (
                        <Check size={12} strokeWidth={2} className="shrink-0 text-[var(--accent)]" />
                      ) : (
                        <span className="size-3" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        <ToolbarButton
          onClick={onCapture}
          disabled={!live}
          title="Cámara — capturar preview al chat"
        >
          <Camera size={14} strokeWidth={1.75} />
        </ToolbarButton>
        <span
          className="ml-1 min-w-0 flex-1 truncate rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 py-0.5 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
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
    "flex size-6 items-center justify-center rounded-[var(--radius-s)] transition-colors duration-120 ";
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
