// LayersPanel — capas del DOM (bridge) + páginas del proyecto (src/routes).

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, Layers } from "lucide-react";
import { t } from "./i18n";

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
      <div className="flex h-10 shrink-0 items-center px-2 py-1">
        <div className="flex h-8 w-full items-center rounded-[8px] bg-[var(--bg-0)] p-0.5">
          <TabButton
            active={tab === "layers"}
            onClick={() => setTab("layers")}
            icon={Layers}
            label={t.layers.layers}
          />
          <TabButton
            active={tab === "pages"}
            onClick={() => setTab("pages")}
            icon={FileText}
            label={t.layers.pages}
          />
        </div>
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
      className={`flex h-full flex-1 items-center justify-center gap-1 rounded-[6px] px-2 font-mono text-[length:var(--fs-0)] tracking-wide uppercase transition-colors duration-120 ${
        active
          ? "bg-[var(--bg-3)] text-[var(--text-0)]"
          : "text-[var(--text-2)] hover:text-[var(--text-1)]"
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
        {t.layers.noRoutesBefore}
        <span className="font-mono text-[length:var(--fs-0)]">src/routes</span>
        {t.layers.noRoutesAfter}
      </p>
    );
  }

  return (
    <ul className="px-1 py-0.5">
      {pages.map((page) => (
        <li key={page.path}>
          <button
            type="button"
            onClick={() => onSelectPage(page.path)}
            className={`flex w-full items-start gap-2 rounded-[var(--radius-s)] px-2 py-1.5 text-left transition-colors duration-120 ${
              page.active
                ? "bg-[var(--bg-3)] text-[var(--text-0)]"
                : "text-[var(--text-1)] hover:bg-[var(--bg-2)]"
            }`}
          >
            <FileText
              size={12}
              strokeWidth={1.75}
              className={`mt-[2px] shrink-0 ${
                page.active ? "text-[var(--text-1)]" : "text-[var(--text-2)]"
              }`}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[length:var(--fs-1)]">
                {page.label}
              </span>
              <span
                className="block truncate font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
                title={page.file}
              >
                {page.path}
              </span>
            </span>
            {page.active ? (
              <Check
                size={12}
                strokeWidth={2.5}
                className="mt-[2px] shrink-0 text-[var(--text-0)]"
                aria-hidden
              />
            ) : null}
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
        {t.layers.idle}
      </p>
    );
  }

  if (treeState === "loading") {
    return (
      <p className="px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-2)]">
        {t.layers.loading}
      </p>
    );
  }

  if (nodes.length === 0) {
    return (
      <p className="px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-2)]">
        {treeState === "empty" ? t.layers.emptyNoSource : t.layers.empty}
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
            title={isCollapsed ? t.layers.expand : t.layers.collapse}
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
