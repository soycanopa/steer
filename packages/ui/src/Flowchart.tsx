// Flowchart — flujo de trabajo del agente sobre canvas punteado (patrón
// demo portado a los tokens de Steer). El agente lo emite como bloque
// ```flowchart con JSON (parse en parseFlowchartSpec); el MarkdownBody lo
// intercepta. Cards arrastrables + conectores bezier; las filas de
// condición son chips estáticos: renderizan lo que el agente dijo, sin
// edición (no hay destino donde persistirlas).

import { memo, useRef, useState, useLayoutEffect } from "react";

export type FlowConditionRow = {
  op: string;
  source?: string;
  prop?: string;
  value?: string;
};

export type FlowNode = {
  id: string;
  row: number;
  /** 0–1: centro horizontal del nodo dentro del canvas. */
  x: number;
  w?: number;
  kind?: string;
  hue?: string;
  title?: string;
  caption?: string;
  condition?: boolean;
  rows?: FlowConditionRow[];
};

export type FlowchartSpec = {
  nodes: FlowNode[];
  edges: Array<{ from: string; to: string }>;
};

const PAD_Y = 24;
const ROW_GAP = 56;
const PILL_OFFSET = 30;
const MAX_NODES = 24;
const NEUTRAL_HUE = "#8b919c";

/** Parse tolerante del bloque ```flowchart. null = render como código. */
export function parseFlowchartSpec(raw: string): FlowchartSpec | null {
  try {
    const data = JSON.parse(raw) as Partial<FlowchartSpec>;
    if (!Array.isArray(data.nodes) || data.nodes.length === 0) return null;
    if (data.nodes.length > MAX_NODES) return null;
    const nodes: FlowNode[] = [];
    for (const node of data.nodes) {
      if (
        node == null ||
        typeof node.id !== "string" ||
        node.id === "" ||
        typeof node.row !== "number" ||
        typeof node.x !== "number" ||
        node.x < 0 ||
        node.x > 1
      ) {
        return null;
      }
      nodes.push({
        ...node,
        w: typeof node.w === "number" ? node.w : 300,
        rows: Array.isArray(node.rows) ? node.rows.slice(0, 6) : undefined,
      });
    }
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (Array.isArray(data.edges) ? data.edges : []).flatMap((e) =>
      e != null &&
      typeof e.from === "string" &&
      typeof e.to === "string" &&
      ids.has(e.from) &&
      ids.has(e.to)
        ? [{ from: e.from, to: e.to }]
        : [],
    );
    return { nodes, edges };
  } catch {
    return null;
  }
}

const mix = (hue: string, pct: number, base = "var(--bg-1)") =>
  `color-mix(in srgb, ${hue} ${pct}%, ${base})`;

function ConditionRowLine({ row }: { row: FlowConditionRow }) {
  const chip = (text: string) => (
    <span className="inline-flex h-6 shrink-0 items-center rounded-[6px] bg-[var(--bg-2)] px-1.5 text-[12px] text-[var(--text-1)]">
      {text}
    </span>
  );
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="w-7 shrink-0 text-[12.5px] text-[var(--text-2)]">
        {row.op}
      </span>
      {row.source != null ? chip(row.source) : null}
      {row.prop != null ? chip(row.prop) : null}
      {row.value != null ? (
        <>
          <span className="text-[12.5px] text-[var(--text-2)]">is</span>
          {chip(row.value)}
        </>
      ) : null}
    </div>
  );
}

function ConditionBody({ node }: { node: FlowNode }) {
  const rows = node.rows ?? [];
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      {rows.map((row, i) => (
        <ConditionRowLine key={`${row.op}-${i}`} row={row} />
      ))}
    </div>
  );
}

function StepBody({ node }: { node: FlowNode }) {
  const hue = node.hue ?? NEUTRAL_HUE;
  return (
    <div className="flex items-center gap-2.5 p-2.5">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-[8px]"
        style={{
          background: mix(hue, 12, "var(--bg-0)"),
          color: mix(hue, 75, "var(--text-0)"),
          boxShadow: `0 0 0 1px ${mix(hue, 20, "var(--bg-0)")}`,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16" />
        </svg>
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-[13px] font-semibold leading-tight text-[var(--text-0)]">
          {node.title ?? node.id}
        </span>
        {node.caption != null ? (
          <span className="mt-0.5 block text-[12px] leading-snug text-[var(--text-2)]">
            {node.caption}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export const Flowchart = memo(function Flowchart({
  spec,
}: {
  spec: FlowchartSpec;
}) {
  const steps = spec.nodes;
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    baseDx: number;
    baseDy: number;
    moved: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      setWidth(canvas.clientWidth);
      setHeights((prev) => {
        const next = { ...prev };
        let changed = false;
        nodeRefs.current.forEach((el, id) => {
          const h = el.offsetHeight;
          if (h && Math.abs(h - (next[id] ?? 0)) > 0.5) {
            next[id] = h;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    nodeRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const rows = [...new Set(steps.map((n) => n.row))].sort((a, b) => a - b);
  const rowH = rows.map((r) =>
    Math.max(...steps.filter((n) => n.row === r).map((n) => heights[n.id] ?? 90)),
  );
  const rowY: number[] = [];
  rows.forEach((_, i) => {
    rowY[i] =
      i === 0 ? PAD_Y : (rowY[i - 1] ?? 0) + (rowH[i - 1] ?? 90) + ROW_GAP;
  });
  const canvasH =
    (rowY[rows.length - 1] ?? PAD_Y) + (rowH[rows.length - 1] ?? 90) + PAD_Y;

  const cw = width || 480;
  const place = (n: FlowNode) => {
    const w = Math.min(n.w ?? 300, cw * 0.92);
    const off = offsets[n.id];
    return {
      w,
      cx: n.x * cw + (off?.dx ?? 0),
      top: (rowY[rows.indexOf(n.row)] ?? 0) + (off?.dy ?? 0),
    };
  };

  const anchors = (n: FlowNode) => {
    const { cx, top } = place(n);
    return {
      top: { x: cx, y: top + (n.kind != null ? PILL_OFFSET : 0) },
      bottom: { x: cx, y: top + (heights[n.id] ?? 90) },
    };
  };

  const bezier = (edge: { from: string; to: string }) => {
    const fromNode = steps.find((n) => n.id === edge.from);
    const toNode = steps.find((n) => n.id === edge.to);
    if (fromNode == null || toNode == null) return "";
    const from = anchors(fromNode).bottom;
    const to = anchors(toNode).top;
    const k = Math.min(Math.max(Math.abs(to.y - from.y) * 0.55, 24), 84);
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + k}, ${to.x} ${to.y - k}, ${to.x} ${to.y}`;
  };

  const onPointerDown = (node: FlowNode) => (event: React.PointerEvent<HTMLDivElement>) => {
    const off = offsets[node.id];
    drag.current = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      baseDx: off?.dx ?? 0,
      baseDy: off?.dy ?? 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (node: FlowNode) => (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d == null || d.id !== node.id) return;
    const dx = d.baseDx + event.clientX - d.startX;
    const dy = d.baseDy + event.clientY - d.startY;
    if (!d.moved && Math.hypot(dx - d.baseDx, dy - d.baseDy) < 3) return;
    d.moved = true;

    const { w } = place(node);
    const h = heights[node.id] ?? 90;
    const baseCx = node.x * cw;
    const baseTop = rowY[rows.indexOf(node.row)] ?? 0;
    const cx = Math.min(Math.max(baseCx + dx, w / 2 + 8), cw - w / 2 - 8);
    const top = Math.min(Math.max(baseTop + dy, 8), canvasH - h - 8);
    setOffsets((current) => ({ ...current, [node.id]: { dx: cx - baseCx, dy: top - baseTop } }));
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const isLit = (edge: { from: string; to: string }) =>
    selected === edge.from || selected === edge.to;

  return (
    <div
      ref={canvasRef}
      className="relative w-full select-none overflow-hidden rounded-[var(--radius-m)] bg-[var(--bg-1)]"
      style={{
        height: canvasH,
        backgroundImage: "radial-gradient(var(--line) 1px, transparent 1.25px)",
        backgroundSize: "22px 22px",
        backgroundPosition: "center",
      }}
    >
      <svg width={cw} height={canvasH} className="pointer-events-none absolute inset-0">
        {spec.edges.map((edge) => (
          <path
            key={`${edge.from}-${edge.to}`}
            d={bezier(edge)}
            fill="none"
            stroke={isLit(edge) ? "var(--accent)" : "var(--line)"}
            strokeWidth="1.25"
            className="transition-[stroke] duration-150"
          />
        ))}
      </svg>

      {steps.map((node) => {
        const { w, cx, top } = place(node);
        const active = selected === node.id;
        const hue = node.hue ?? NEUTRAL_HUE;
        return (
          <div
            key={node.id}
            ref={(el) => {
              if (el) nodeRefs.current.set(node.id, el);
              else nodeRefs.current.delete(node.id);
            }}
            onPointerDown={onPointerDown(node)}
            onPointerMove={onPointerMove(node)}
            onPointerUp={onPointerUp}
            className="absolute flex -translate-x-1/2 touch-none flex-col items-start gap-1.5"
            style={{ left: cx, top, width: w, zIndex: drag.current?.id === node.id ? 2 : 1 }}
          >
            {node.kind != null ? (
              <span
                className="inline-flex h-6 items-center rounded-[6px] px-2 text-[11.5px] font-medium"
                style={{
                  background: mix(hue, 14),
                  color: mix(hue, 75, "var(--text-0)"),
                }}
              >
                {node.kind}
              </span>
            ) : null}
            {node.condition === true ? (
              <div
                onClick={() => setSelected(active ? null : node.id)}
                className={`w-full cursor-pointer rounded-[14px] bg-[var(--bg-0)] transition-shadow duration-150 ${
                  active
                    ? "shadow-[0_0_0_1.5px_var(--accent)]"
                    : "shadow-[0_1px_4px_rgba(0,0,0,0.3)] hover:shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
                }`}
              >
                <ConditionBody node={node} />
              </div>
            ) : (
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(active ? null : node.id)}
                className={`w-full cursor-pointer rounded-[14px] bg-[var(--bg-0)] text-left outline-none transition-shadow duration-150 ${
                  active
                    ? "shadow-[0_0_0_1.5px_var(--accent)]"
                    : "shadow-[0_1px_4px_rgba(0,0,0,0.3)] hover:shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
                }`}
              >
                <StepBody node={node} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
});
