// LayersPanel — navegador de capas estilo Webflow/Figma: árbol del DOM
// del preview empujado por el bridge. Las ramas con hijos son
// colapsables (control de densidad) y click = seleccionar el nodo.
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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
  // Densidad: ids colapsados. Estado local de UI, se reinicia al cambiar
  // de página (el bridge re-empuja el árbol con ids nuevos).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

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
              collapsed={collapsed}
              onToggle={toggle}
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
  collapsed,
  onToggle,
  onSelect,
}: {
  node: LayerNodeView;
  depth: number;
  collapsed: Set<string>;
  onToggle(id: string): void;
  onSelect(id: string): void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);

  return (
    <>
      <div
        className={`flex w-full items-center gap-1 pr-2 transition-colors duration-120 ${
          node.active
            ? "bg-[var(--accent-dim)]"
            : "hover:bg-[var(--bg-2)]"
        }`}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            title={isCollapsed ? "Expandir" : "Colapsar"}
            className="flex size-4 shrink-0 items-center justify-center text-[var(--text-2)] transition-colors duration-120 hover:text-[var(--text-0)]"
          >
            {isCollapsed ? (
              <ChevronRight size={11} strokeWidth={1.75} />
            ) : (
              <ChevronDown size={11} strokeWidth={1.75} />
            )}
          </button>
        ) : (
          <span className="size-4 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className={`flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left ${
            node.active ? "text-[var(--accent)]" : "text-[var(--text-1)]"
          }`}
        >
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
          ) : null}
        </button>
      </div>
      {hasChildren && !isCollapsed
        ? node.children.map((child) => (
            <LayerRow
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
    </>
  );
}
