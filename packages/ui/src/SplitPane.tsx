// SplitPane — layout de zonas (UX.md §3): capas | preview | inspector |
// chat. El preview nunca cambia de posición en el árbol: el iframe no se
// remonta al abrir/cerrar columnas. El drag de splits no es P0.
import type { ReactNode } from "react";

export function SplitPane({
  layers,
  left,
  middle,
  right,
  layersWidth = 240,
  middleWidth = 320,
  rightWidth = 320,
}: {
  layers: ReactNode | null;
  left: ReactNode;
  middle: ReactNode | null;
  right: ReactNode | null;
  layersWidth?: number;
  middleWidth?: number;
  rightWidth?: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1">
      {layers !== null ? (
        <>
          <div
            className="min-w-0 shrink-0"
            style={{ width: layersWidth }}
          >
            {layers}
          </div>
          <div className="w-px shrink-0 bg-[var(--line)]" aria-hidden />
        </>
      ) : null}
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
