// LoadingState — loader de grid de píxeles para trabajos largos (thinking del
// agente). Labels shimmer + timer mono. Variantes: Drive (cuadros, wavefront
// chevron), Dots (mismas celdas redondas), Orbit (cometa por el perímetro).

import { useEffect, useState } from "react";
import { t } from "./i18n";

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 160;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 180;
});

export type LoadingVariant = "Drive" | "Dots" | "Orbit";

const PATTERNS: Record<
  LoadingVariant,
  { delays: (number | null)[]; dur: number; round: boolean }
> = {
  Drive: { delays: chevron, dur: 1200, round: false },
  Dots: { delays: chevron, dur: 1200, round: true },
  Orbit: { delays: orbit, dur: 1600, round: false },
};

function LoaderGrid({
  delays,
  dur,
  round,
}: {
  delays: (number | null)[];
  dur: number;
  round: boolean;
}) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 grid-cols-[repeat(3,3px)] gap-[1px]"
    >
      {delays.map((delay, index) => (
        <span
          key={index}
          className={`size-[3px] bg-[var(--text-0)] ${
            round ? "rounded-full" : "rounded-[1px]"
          }`}
          style={{
            opacity: delay === null ? 0.07 : 0.15,
            animation:
              delay === null
                ? "none"
                : `pixel-on ${dur}ms ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

function useElapsed(): string {
  const [ds, setDs] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setDs((d) => d + 1), 100);
    return () => window.clearInterval(t);
  }, []);
  const total = ds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

export type LoadingStateProps = {
  label?: string;
  variant?: LoadingVariant;
  /** Oculta el timer de tiempo transcurrido. */
  hideElapsed?: boolean;
};

export function LoadingState({
  label = t.loading.thinking,
  variant = "Drive",
  hideElapsed = false,
}: LoadingStateProps) {
  const elapsed = useElapsed();
  const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.Drive;

  return (
    <div role="status" className="flex w-fit items-center gap-2.5">
      <LoaderGrid delays={delays} dur={dur} round={round} />
      <span className="shimmer-text text-[length:var(--fs-1)] font-medium">
        {label}
      </span>
      {hideElapsed ? null : (
        <span className="font-mono text-[length:var(--fs-0)] text-[var(--text-2)] tabular-nums">
          {elapsed}
        </span>
      )}
    </div>
  );
}
