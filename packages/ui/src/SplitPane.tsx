// SplitPane — layout de zonas (UX.md §3): capas | preview | inspector |
// chat. El ancho del chat es arrastrable por el borde izquierdo.
import { useCallback, useRef, type ReactNode } from "react";

export function SplitPane({
  layers,
  left,
  middle,
  right,
  layersWidth = 240,
  middleWidth = 320,
  rightWidth = 320,
  onRightWidthChange,
  minRightWidth = 260,
  maxRightWidth = 520,
}: {
  layers: ReactNode | null;
  left: ReactNode;
  middle: ReactNode | null;
  right: ReactNode | null;
  layersWidth?: number;
  middleWidth?: number;
  rightWidth?: number;
  onRightWidthChange?(w: number): void;
  minRightWidth?: number;
  maxRightWidth?: number;
}) {
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!onRightWidthChange) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: rightWidth };
      const onMove = (ev: MouseEvent) => {
        const st = dragRef.current;
        if (!st) return;
        const next = st.startW + (st.startX - ev.clientX);
        const clamped = Math.min(
          maxRightWidth,
          Math.max(minRightWidth, next),
        );
        onRightWidthChange(clamped);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [onRightWidthChange, rightWidth, minRightWidth, maxRightWidth],
  );

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
          {onRightWidthChange ? (
            <div
              role="separator"
              aria-orientation="vertical"
              title="Arrapara para redimensionar el chat"
              onMouseDown={onDragStart}
              className="w-1 shrink-0 cursor-col-resize bg-[var(--line)] transition-colors duration-120 hover:bg-[var(--accent)]"
            />
          ) : (
            <div className="w-px shrink-0 bg-[var(--line)]" aria-hidden />
          )}
          <div
            className="min-w-0 shrink-0 overflow-hidden"
            style={{ width: rightWidth }}
          >
            {right}
          </div>
        </>
      ) : null}
    </div>
  );
}
