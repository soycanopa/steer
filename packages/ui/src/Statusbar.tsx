// Statusbar — UI.md §3: 24px con modo, n intents en cola, modelo y
// atajo de apply.

export type StatusbarMode = "inspect" | "comment" | "interact";

export type StatusbarProps = {
  mode: StatusbarMode;
  queueCount: number;
  /** Label corto del modelo elegido (Fase F). null = sin modelo. */
  modelLabel: string | null;
  agentBusy?: boolean;
};

export function Statusbar({
  mode,
  queueCount,
  modelLabel,
  agentBusy = false,
}: StatusbarProps) {
  const label =
    mode === "inspect"
      ? "INSPECT"
      : mode === "comment"
        ? "COMMENT"
        : "INTERACT";
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--line)] bg-[var(--bg-1)] px-3 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
      <div className="flex items-center gap-3">
        <span className={mode !== "interact" ? "text-[var(--accent)]" : ""}>
          {label}
        </span>
        {queueCount > 0 ? (
          <span>
            {queueCount} intent{queueCount === 1 ? "" : "s"} en cola
          </span>
        ) : null}
        {agentBusy ? (
          <span className="text-[var(--accent)]">agente…</span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="max-w-[220px] truncate">
          {modelLabel ?? "modelo —"}
        </span>
        <span>⌘Enter aplicar</span>
      </div>
    </footer>
  );
}
