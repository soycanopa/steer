// Statusbar — UI.md §3: 24px con modo, n intents en cola, modelo y
// atajo de apply. El modelo real llega con listModels() en Fase F.

export type StatusbarProps = {
  mode: "inspect" | "interact";
  queueCount: number;
};

export function Statusbar({ mode, queueCount }: StatusbarProps) {
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--line)] bg-[var(--bg-1)] px-3 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
      <div className="flex items-center gap-3">
        <span className={mode === "inspect" ? "text-[var(--accent)]" : ""}>
          {mode === "inspect" ? "INSPECT" : "INTERACT"}
        </span>
        {queueCount > 0 ? (
          <span>
            {queueCount} intent{queueCount === 1 ? "" : "s"} en cola
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span>modelo —</span>
        <span>⌘Enter aplicar</span>
      </div>
    </footer>
  );
}
