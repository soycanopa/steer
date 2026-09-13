// SplitPane — UX.md §3: preview / panel con handle de 1px. La
// proporción fija 62/38 es el default P0; el drag del handle llega en
// el pulido (Fase H). Con right=null el preview ocupa todo el ancho
// PERO el lado izquierdo no cambia de lugar: el iframe no se remonta.
import type { ReactNode } from "react";

export function SplitPane({
  left,
  right,
  leftPct = 62,
}: {
  left: ReactNode;
  right: ReactNode | null;
  leftPct?: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="min-w-0" style={{ width: `${leftPct}%` }}>
        {left}
      </div>
      {right !== null ? (
        <>
          <div className="w-px shrink-0 bg-[var(--line)]" aria-hidden />
          <div className="min-w-0 flex-1">{right}</div>
        </>
      ) : null}
    </div>
  );
}
