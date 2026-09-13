// SplitPane — layout de tres zonas (UX.md §3): preview elástico al
// fondo-inspector de ancho fijo y chat de ancho fijo. El inspector
// (middle) solo existe con un nodo seleccionado; el chat es columna
// propia y permanente. El lado izquierdo nunca cambia de posición en
// el árbol: el iframe no se remonta.
import type { ReactNode } from "react";

export function SplitPane({
  left,
  middle,
  right,
  middleWidth = 320,
  rightWidth = 320,
}: {
  left: ReactNode;
  middle: ReactNode | null;
  right: ReactNode | null;
  middleWidth?: number;
  rightWidth?: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="min-w-0 flex-1">{left}</div>
      {middle !== null ? (
        <>
          <div className="w-px shrink-0 bg-[var(--line)]" aria-hidden />
          <div
            className="min-w-0 shrink-0 overflow-y-auto"
            style={{ width: middleWidth }}
          >
            {middle}
          </div>
        </>
      ) : null}
      {right !== null ? (
        <>
          <div className="w-px shrink-0 bg-[var(--line)]" aria-hidden />
          <div
            className="min-w-0 shrink-0"
            style={{ width: rightWidth }}
          >
            {right}
          </div>
        </>
      ) : null}
    </div>
  );
}
