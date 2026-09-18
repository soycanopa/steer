// AgentTrace — traza expandible del turno del agente (UI.md §6).
// Siempre inicia CERRADA: el usuario decide si abrir (los headers hacen
// shimmer mientras su fase trabaja). Dirigida por datos reales del stream:
// sin timers, sin contenido demo. Cuatro variantes:
//
//   steps      lista de pasos: spinner → check apagado
//   reasoning  prosa del razonamiento, expande y luego se asienta
//   search     búsqueda web: query + fuentes leídas
//   coding     tools: archivos leídos, edits (+/−), comandos

import { memo, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Globe, LoaderCircle, Search } from "lucide-react";

export type AgentTraceVariant = "steps" | "reasoning" | "search" | "coding";

export type AgentTraceRow = {
  primary: string;
  secondary?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  /** start = spinner en curso; end = check apagado (steps / coding). */
  status?: "start" | "end";
  /** Punto de color delante del row (fuentes de búsqueda). */
  tone?: "accent" | "pin" | "ok";
};

const TONE_BG: Record<NonNullable<AgentTraceRow["tone"]>, string> = {
  accent: "bg-[var(--accent)]",
  pin: "bg-[var(--pin)]",
  ok: "bg-[var(--ok)]",
};

function RowIcon({ status }: { status: "start" | "end" | undefined }) {
  if (status === "start") {
    return (
      <LoaderCircle
        size={13}
        className="shrink-0 animate-spin text-[var(--warn)]"
        aria-hidden
      />
    );
  }
  return (
    <Check
      size={13}
      className="shrink-0 text-[var(--text-2)]"
      aria-hidden
    />
  );
}

export const AgentTrace = memo(function AgentTrace({
  variant,
  working,
  rows,
  active,
  done,
  query,
  activeNote,
  icon,
}: {
  variant: AgentTraceVariant;
  /** El trace está trabajando (label con shimmer). */
  working: boolean;
  rows: AgentTraceRow[];
  /** Etiqueta del header mientras trabaja. */
  active: string;
  /** Etiqueta del header al asentarse. */
  done: string;
  /** Query de la variante search (fila cabecera del trace). */
  query?: string;
  /** Nota en `--warn` junto al label activo (ej. "· 2 en curso"). */
  activeNote?: string;
  /** Glifo del header; default: sparkle. */
  icon?: ReactNode;
}) {
  // Siempre inicia cerrado; el usuario decide. (UX: el transcript ya
  // muestra el progreso con los headers; abrir todo satura.)
  const [manual, setManual] = useState(false);
  const expanded = manual;

  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);
  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [rows, expanded, variant, query]);

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManual((current) => !current)}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-[6px] px-1.5 py-1 transition-colors duration-100 hover:bg-[var(--bg-3)]"
      >
        {icon ?? (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill={working ? "var(--text-1)" : "var(--text-2)"}
            className="shrink-0 transition-colors duration-200"
            aria-hidden
          >
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>
        )}
        <span role="status" className="contents">
          {working ? (
            <span className="shimmer-text whitespace-nowrap text-[length:var(--fs-1)] font-medium">
              {active}
            </span>
          ) : (
            <span
              className="whitespace-nowrap text-[length:var(--fs-1)] font-medium text-[var(--text-2)]"
              style={{ animation: "fade-in 350ms ease-out both" }}
            >
              {done}
            </span>
          )}
        </span>
        {working && activeNote != null ? (
          <span className="whitespace-nowrap text-[length:var(--fs-0)] text-[var(--warn)]">
            {activeNote}
          </span>
        ) : null}
        <ChevronDown
          size={13}
          className="shrink-0 text-[var(--text-2)] transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        />
      </button>

      {/* Expandible: grid-rows 0fr→1fr anima la altura sin medir contenido. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-[400ms]"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            <span
              aria-hidden
              className="absolute left-[3px] w-px bg-[var(--line)]"
              style={{
                top: -8,
                height: lineHeight > 0 ? lineHeight - 2 : 0,
                transition: "height 500ms cubic-bezier(0.23,1,0.32,1)",
              }}
            />
            <div ref={traceRef} className="flex flex-col gap-1 py-1">
              {query != null ? (
                <div
                  className="flex h-6 items-center gap-2 px-1.5"
                  style={
                    expanded
                      ? { animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }
                      : undefined
                  }
                >
                  <Search
                    size={14}
                    className="shrink-0 text-[var(--text-2)]"
                    aria-hidden
                  />
                  <span className="truncate text-[length:var(--fs-1)] text-[var(--text-1)]">
                    {query}
                  </span>
                </div>
              ) : null}
              {rows.map((row, i) => {
                const animation = {
                  animation: `fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${Math.min(i, 5) * 90}ms both`,
                };
                const prose = variant === "reasoning";
                return (
                  <div
                    key={`${i}-${row.primary}`}
                    className="flex min-h-[28px] w-full items-center gap-2 rounded-[6px] px-1.5 py-0.5 text-left"
                    style={animation}
                  >
                    {row.tone != null ? (
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-white ${TONE_BG[row.tone]}`}
                      >
                        <Globe size={9} strokeWidth={2.5} aria-hidden />
                      </span>
                    ) : prose ? null : (
                      <RowIcon status={row.status} />
                    )}
                    <span
                      className={
                        prose
                          ? "min-w-0 whitespace-normal leading-relaxed text-[length:var(--fs-1)] text-[var(--text-1)]"
                          : "min-w-0 truncate text-[length:var(--fs-1)] font-medium text-[var(--text-0)]"
                      }
                    >
                      {row.primary}
                    </span>
                    {row.secondary != null ? (
                      <span
                        className={`max-w-[55%] shrink-0 truncate text-[length:var(--fs-0)] text-[var(--text-2)] ${
                          row.mono ? "font-mono" : ""
                        }`}
                      >
                        {row.secondary}
                      </span>
                    ) : null}
                    {row.add !== undefined ? (
                      <span className="shrink-0 font-mono text-[length:var(--fs-0)] tabular-nums">
                        <span className="text-[var(--ok)]">+{row.add}</span>{" "}
                        <span className="text-[var(--danger)]">
                          −{row.del ?? 0}
                        </span>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
