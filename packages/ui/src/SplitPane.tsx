// SplitPane — UX.md §3: preview / panel con handle de 1px. La
// proporción fija 62/38 es el default P0; el drag del handle llega en
// el pulido (Fase H).
import type { ReactNode } from "react";

export function SplitPane({
  left,
  right,
  leftPct = 62,
}: {
  left: ReactNode;
  right: ReactNode;
  leftPct?: number;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0" style={{ width: `${leftPct}%` }}>
        {left}
      </div>
      <div className="w-px shrink-0 bg-[var(--line)]" aria-hidden />
      <div className="min-w-0 flex-1">{right}</div>
    </div>
  );
}
