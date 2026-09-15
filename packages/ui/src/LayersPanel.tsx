// LayersPanel — capas del DOM (bridge) + páginas del proyecto (src/routes).

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Layers } from "lucide-react";

export type LayerNodeView = {
  id: string;
  tag: string;
  cls: string | null;
  text: string | null;
  source: string | null;
  active: boolean;
  children: LayerNodeView[];
};

export type PageRouteView = {
  path: string;
  label: string;
  file: string;
  active: boolean;
};

export type LayersTreeState = "idle" | "loading" | "empty" | "ready";

export type LayersPanelProps = {
  nodes: LayerNodeView[];
  pages: PageRouteView[];
  treeState: LayersTreeState;
  onSelect(id: string): void;
  onSelectPage(path: string): void;
};

type PanelTab = "layers" | "pages";

export function LayersPanel({
  nodes,
  pages,
  treeState,
  onSelect,
  onSelectPage,
}: LayersPanelProps) {
  const [tab, setTab] = useState<PanelTab>("layers");
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
      <div className="flex h-8 shrink-0 items-center gap-1 px-2">
        <TabButton
          active={tab === "layers"}
          onClick={() => setTab("layers")}
          icon={Layers}
          label="Capas"
        />
        <TabButton
          active={tab === "pages"}
          onClick={() => setTab("pages")}
          icon={FileText}
          label="Páginas"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {tab === "pages" ? (
          <PagesMenu pages={pages} onSelectPage={onSelectPage} />
        ) : (
          <LayersTree
            nodes={nodes}
            treeState={treeState}
            collapsed={collapsed}
            onToggle={toggle}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick(): void;
  icon: typeof Layers;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 rounded-[6px] px-2 py-1 font-mono text-[length:var(--fs-0)] tracking-wide uppercase transition-colors duration-120 ${
        active
          ? "bg-[var(--bg-2)] text-[var(--text-0)]"
          : "text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)]"
      }`}
    >
      <Icon size={11} strokeWidth={1.75} />
      {label}
    </button>
  );
}

/** Lista de páginas reutilizable (panel de capas y popover del preview). */
export function PagesMenu({
  pages,
  onSelectPage,
}: {
  pages: PageRouteView[];
  onSelectPage(path: string): void;
}) {
  if (pages.length === 0) {
    return (
      <p className="px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-2)]">
        No hay rutas en{" "}
        <span className="font-mono text-[length:var(--fs-0)]">src/routes</span>
        .
      </p>
    );
  }

  return (
    <ul>
      {pages.map((page) => (
        <li key={page.path}>
          <button
            type="button"
            onClick={() => onSelectPage(page.path)}
            className={`flex w-full flex-col gap-0.5 px-3 py-1.5 text-left transition-colors duration-120 ${
              page.active
                ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                : "text-[var(--text-1)] hover:bg-[var(--bg-2)]"
            }`}
          >
            <span className="text-[length:var(--fs-1)]">{page.label}</span>
            <span
              className="truncate font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
              title={page.file}
            >
              {page.path}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LayersTree({
  nodes,
  treeState,
  collapsed,
  onToggle,
  onSelect,
}: {
  nodes: LayerNodeView[];
  treeState: LayersTreeState;
  collapsed: Set<string>;
  onToggle(id: string): void;
  onSelect(id: string): void;
}) {
  if (treeState === "idle") {
    return (
      <p className="px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-2)]">
        Arranca el preview para ver las capas.
      </p>
    );
  }

  if (treeState === "loading") {
    return (
      <p className="px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-2)]">
        Cargando capas del preview…
      </p>
    );
  }

  if (nodes.length === 0) {
    return (
      <p className="px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-2)]">
        {treeState === "empty"
          ? "Esta página no tiene nodos con source. Activa TanStack Devtools en el proyecto."
          : "Sin capas en esta página."}
      </p>
    );
  }

  return (
    <>
      {nodes.map((node) => (
        <LayerRow
          key={node.id}
          node={node}
          depth={0}
          collapsed={collapsed}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
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
