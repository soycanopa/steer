// DebugDrawer — TRD §15: panel oculto detrás de ⌘D con el tráfico del
// canal steer:*. Imprescindible para construir, no es feature de usuario.
import { useEffect, useState } from "react";
import { getDebugLines } from "./composition";

export function DebugDrawer({ open }: { open: boolean }) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setLines(getDebugLines()), 400);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed bottom-8 left-3 z-50 max-h-52 w-[420px] overflow-y-auto rounded-[var(--radius-m)] border border-[var(--line)] bg-[#0e0f11e6] p-2 font-mono text-[10px] leading-relaxed text-[var(--text-1)]">
      <p className="mb-1 text-[var(--text-2)]">steer:* debug (⌘D)</p>
      {lines.length === 0 ? (
        <p className="text-[var(--text-2)]">sin tráfico todavía…</p>
      ) : (
        lines.map((line, i) => (
          <p key={`${i}-${line}`} className="truncate">
            {line}
          </p>
        ))
      )}
    </div>
  );
}
