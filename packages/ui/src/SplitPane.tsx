// SplitPane — layout de zonas (UX.md §3): preview (zona centro) | inspector.
// Capas y chat viven dentro de PreviewFrame.
import type { ReactNode } from "react";

export function SplitPane({
  left,
  middle,
  middleWidth = 320,
}: {
  left: ReactNode;
  middle: ReactNode | null;
  middleWidth?: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 gap-1">
      <div className="min-w-0 flex-1">{left}</div>
      {middle !== null ? (
        <div
          className="min-w-0 shrink-0 overflow-hidden rounded-[var(--radius-m)]"
          style={{ width: middleWidth }}
        >
          <div className="h-full overflow-y-auto">{middle}</div>
        </div>
      ) : null}
    </div>
  );
}
