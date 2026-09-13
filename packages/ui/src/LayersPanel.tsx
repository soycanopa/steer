// LayersPanel — navegador de capas estilo Webflow/Figma: árbol del DOM
// del preview empujado por el bridge. Click = seleccionar el nodo.
import type { ReactNode } from "react";

export type LayerNodeView = {
  id: string;
  tag: string;
  cls: string | null;
  text: string | null;
  source: string | null;
  active: boolean;
  children: LayerNodeView[];
};

export type LayersPanelProps = {
  nodes: LayerNodeView[];
  onSelect(id: string): void;
};

export function LayersPanel({ nodes, onSelect }: LayersPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-1)]">
      <div className="flex h-8 shrink-0 items-center border-b border-[var(--line)] px-3">
        <span className="font-mono text-[length:var(--fs-0)] tracking-wider text-[var(--text-2)] uppercase">
          Capas
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {nodes.length === 0 ? (
          <p className="px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-2)]">
            Esperando el árbol del preview…
          </p>
        ) : (
          nodes.map((node) => (
            <LayerRow
              key={node.id}
              node={node}
              depth={0}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function LayerRow({
  node,
  depth,
  onSelect,
}: {
  node: LayerNodeView;
  depth: number;
  onSelect(id: string): void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`flex w-full items-center gap-1.5 py-0.5 pr-2 text-left transition-colors duration-120 ${
          node.active
            ? "bg-[var(--accent-dim)] text-[var(--accent)]"
            : "text-[var(--text-1)] hover:bg-[var(--bg-2)]"
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span
          className={`size-1.5 shrink-0 rounded-[2px] border ${
            hasChildren ? "border-[var(--text-2)]" : "border-[var(--line)] bg-[var(--bg-2)]"
          }`}
          aria-hidden
        />
        <span className="shrink-0 font-mono text-[length:var(--fs-0)]">{node.tag}</span>
        {node.cls ? (
          <span className="shrink-0 truncate font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
            .{node.cls}
          </span>
        ) : null}
        {node.text ? (
          <span className="min-w-0 flex-1 truncate text-[length:var(--fs-0)] text-[var(--text-2)]">
            {node.text}
          </span>
        ) : (
          <span className="flex-1" />
        )}
      </button>
      {node.children.map((child) => (
        <LayerRow key={child.id} node={child} depth={depth + 1} onSelect={onSelect} />
      ))}
    </>
  );
}

export function LayersSection({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
