// Statusbar — UI.md §3: 24px con modo, n intents en cola, modelo y
// atajo de apply.

import { t } from "./i18n";

export type StatusbarMode = "inspect" | "comment" | "interact";

export type StatusbarProps = {
  mode: StatusbarMode;
  queueCount: number;
  /** Label corto del modelo elegido (Fase F). null = sin modelo. */
  modelLabel: string | null;
  agentBusy?: boolean;
  className?: string;
};

export function Statusbar({
  mode,
  queueCount,
  modelLabel,
  agentBusy = false,
  className = "",
}: StatusbarProps) {
  const label =
    mode === "inspect"
      ? "INSPECT"
      : mode === "comment"
        ? "COMMENT"
        : "INTERACT";
  return (
    <footer
      className={`flex h-6 shrink-0 items-center justify-between overflow-hidden rounded-[var(--radius-m)] bg-[var(--bg-1)] px-3 font-mono text-[length:var(--fs-0)] text-[var(--text-2)] ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className={mode !== "interact" ? "text-[var(--accent)]" : ""}>
          {label}
        </span>
        {queueCount > 0 ? (
          <span>{t.statusbar.intentsInQueue(queueCount)}</span>
        ) : null}
        {agentBusy ? (
          <span className="text-[var(--accent)]">{t.statusbar.agentBusy}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="max-w-[220px] truncate">
          {modelLabel ?? t.statusbar.noModel}
        </span>
        <span>{t.statusbar.applyShortcut}</span>
      </div>
    </footer>
  );
}
