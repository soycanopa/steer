// PreviewFrame — UI.md §4 / UX §4. Toolbar: tools | píldora de ruta + recargar | viewport.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  ExternalLink,
  Globe,
  Layers,
  MessageSquare,
  MessageSquarePlus,
  Monitor,
  MousePointer,
  RotateCw,
  Smartphone,
  SquareDashedMousePointer,
  Tablet,
} from "lucide-react";
import type { PageRouteView } from "./LayersPanel";
import { PagesMenu } from "./LayersPanel";

export type PreviewViewportUi = "desktop" | "tablet" | "mobile";

const VIEWPORT_META: Record<
  PreviewViewportUi,
  { label: string; hint: string; width: number | null; Icon: typeof Monitor }
> = {
  desktop: { label: "Desktop", hint: "Ancho completo", width: null, Icon: Monitor },
  tablet: { label: "Tablet", hint: "768 px", width: 768, Icon: Tablet },
  mobile: { label: "Móvil", hint: "390 px", width: 390, Icon: Smartphone },
};

export type PreviewStatusUi = "idle" | "starting" | "live" | "down";
export type PreviewModeUi = "interact" | "comment" | "inspect";

const MODE_META: Record<
  PreviewModeUi,
  { label: string; hint: string; Icon: typeof MousePointer }
> = {
  interact: {
    label: "Interactuar",
    hint: "Click = usar la app (V)",
    Icon: MousePointer,
  },
  comment: {
    label: "Comentarios",
    hint: "Click = pin para el agente (C)",
    Icon: MessageSquarePlus,
  },
  inspect: {
    label: "Inspección",
    hint: "Click = nodo + tweaks (I)",
    Icon: SquareDashedMousePointer,
  },
};

export type PreviewFrameProps = {
  url: string | null;
  /** Pathname actual del iframe (p. ej. "/" → "home"). */
  previewPath: string;
  status: PreviewStatusUi;
  error: string | null;
  iframeKey: string;
  mode: PreviewModeUi;
  onSetMode(mode: PreviewModeUi): void;
  onReload(): void;
  onRetry(): void;
  onCapture(): void;
  /** Abre la URL del preview en el navegador por defecto. */
  onOpenInBrowser?(): void;
  /** Rutas del proyecto (popover al click en la píldora de ruta). */
  pages?: PageRouteView[];
  onSelectPage?(path: string): void;
  onFrameEl(el: HTMLIFrameElement | null): void;
  layersOpen?: boolean;
  onToggleLayers?(): void;
  layersPanel?: ReactNode;
  layersWidth?: number;
  onLayersWidthChange?(w: number): void;
  minLayersWidth?: number;
  maxLayersWidth?: number;
  chatOpen?: boolean;
  onToggleChat?(): void;
  /** Panel lateral derecho (chat o inspector; uno a la vez). */
  sidePanel?: ReactNode;
  sidePanelWidth?: number;
  onSidePanelWidthChange?(w: number): void;
  minSidePanelWidth?: number;
  maxSidePanelWidth?: number;
};

const PANEL_TRANSITION_MS = 220;

/** Ancho local durante el drag; commit al soltar para no re-renderizar toda
 *  la app por pixel. Durante el gesto escribimos el ancho directo al DOM
 *  (imperativo) vía `shellRef`: cero renders de React hasta soltar. */
function useResizableWidth(
  externalWidth: number,
  onCommit: ((w: number) => void) | undefined,
  min: number,
  max: number,
  direction: 1 | -1,
) {
  const [width, setWidth] = useState(externalWidth);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(externalWidth);
  const draggingRef = useRef(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!draggingRef.current) {
      widthRef.current = externalWidth;
      setWidth(externalWidth);
    }
  }, [externalWidth]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!onCommit) return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;
      draggingRef.current = true;
      setDragging(true);
      document.body.classList.add("steer-resizing");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      let frame = 0;
      let latestX = startX;
      const apply = () => {
        frame = 0;
        const delta = (latestX - startX) * direction;
        const next = Math.min(max, Math.max(min, startW + delta));
        widthRef.current = next;
        if (shellRef.current) shellRef.current.style.width = `${next}px`;
        if (contentRef.current) contentRef.current.style.width = `${next}px`;
      };
      const onMove = (ev: MouseEvent) => {
        latestX = ev.clientX;
        if (frame !== 0) return;
        frame = requestAnimationFrame(apply);
      };
      const onUp = () => {
        if (frame !== 0) cancelAnimationFrame(frame);
        frame = 0;
        draggingRef.current = false;
        setDragging(false);
        // Commit: dejamos React en el ancho final (evita flash al volver la
        // transición).
        setWidth(widthRef.current);
        onCommit(widthRef.current);
        document.body.classList.remove("steer-resizing");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [onCommit, min, max, direction],
  );

  return { width, onDragStart, dragging, shellRef, contentRef };
}

function usePanelPresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const id = window.setTimeout(() => setMounted(false), PANEL_TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [open]);

  return { mounted, visible };
}

function ResizeHandle({
  title,
  onMouseDown,
}: {
  title: string;
  onMouseDown(e: React.MouseEvent): void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={title}
      onMouseDown={onMouseDown}
      className="group relative z-10 w-0 shrink-0 self-stretch"
    >
      {/* Área de agarre ancha e invisible; indicador visible fino de 2px. */}
      <div className="absolute inset-y-0 -left-[5px] w-[10px] cursor-col-resize">
        <div className="mx-auto h-full w-[2px] rounded-full bg-transparent transition-colors duration-120 group-hover:bg-[var(--accent)]/50 group-active:bg-[var(--accent)]" />
      </div>
    </div>
  );
}

function AnimatedPanelColumn({
  open,
  width,
  dragging,
  onResizeStart,
  resizeTitle,
  resizeAfter = false,
  shellRef,
  contentRef,
  children,
}: {
  open: boolean;
  width: number;
  dragging: boolean;
  onResizeStart?(e: React.MouseEvent): void;
  resizeTitle?: string;
  resizeAfter?: boolean;
  shellRef?: React.RefObject<HTMLDivElement | null>;
  contentRef?: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const { mounted, visible } = usePanelPresence(open);
  const retainedRef = useRef(children);
  if (children != null) retainedRef.current = children;
  if (!mounted) return null;

  const transition = dragging
    ? ""
    : "transition-[width,opacity] duration-[220ms] ease-out";

  const shell = (
    <div
      ref={shellRef}
      className={`min-h-0 shrink-0 overflow-hidden rounded-[var(--radius-s)] ${transition}`}
      style={{
        width: visible ? width : 0,
        opacity: visible ? 1 : 0,
      }}
    >
      <div ref={contentRef} className="h-full min-h-0" style={{ width }}>
        {retainedRef.current}
      </div>
    </div>
  );

  const handle =
    onResizeStart && visible ? (
      <ResizeHandle
        title={resizeTitle ?? "Redimensionar"}
        onMouseDown={onResizeStart}
      />
    ) : null;

  if (resizeAfter) {
    return (
      <>
        {shell}
        {handle}
      </>
    );
  }
  return (
    <>
      {handle}
      {shell}
    </>
  );
}

export function PreviewFrame({
  url,
  previewPath,
  status,
  error,
  iframeKey,
  mode,
  onSetMode,
  onReload,
  onRetry,
  onCapture,
  onOpenInBrowser,
  pages = [],
  onSelectPage,
  onFrameEl,
  layersOpen = false,
  onToggleLayers,
  layersPanel = null,
  layersWidth = 240,
  onLayersWidthChange,
  minLayersWidth = 200,
  maxLayersWidth = 480,
  chatOpen = false,
  onToggleChat,
  sidePanel = null,
  sidePanelWidth = 320,
  onSidePanelWidthChange,
  minSidePanelWidth = 260,
  maxSidePanelWidth = 520,
}: PreviewFrameProps) {
  const live = status === "live" && url !== null;
  const [viewportOpen, setViewportOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [viewport, setViewport] = useState<PreviewViewportUi>("desktop");
  const viewportWidth = VIEWPORT_META[viewport].width;
  const layersResize = useResizableWidth(
    layersWidth,
    onLayersWidthChange,
    minLayersWidth,
    maxLayersWidth,
    1,
  );
  const sideResize = useResizableWidth(
    sidePanelWidth,
    onSidePanelWidthChange,
    minSidePanelWidth,
    maxSidePanelWidth,
    -1,
  );
  const layersActive = layersOpen && layersPanel != null;
  const sideActive = sidePanel != null;
  const previewTransition =
    layersResize.dragging || sideResize.dragging
      ? ""
      : "transition-[flex-grow] duration-[220ms] ease-out";

  useEffect(() => {
    setPagesOpen(false);
  }, [previewPath]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-m)] bg-[var(--bg-0)] p-2">
      <div className="flex min-h-0 flex-1 gap-1.5">
        <AnimatedPanelColumn
          open={layersActive}
          width={layersResize.width}
          dragging={layersResize.dragging}
          onResizeStart={
            onLayersWidthChange ? layersResize.onDragStart : undefined
          }
          resizeTitle="Arrastra para redimensionar capas"
          resizeAfter
          shellRef={layersResize.shellRef}
          contentRef={layersResize.contentRef}
        >
          {layersPanel}
        </AnimatedPanelColumn>

        <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${previewTransition}`}>
          <div className="mb-2 flex h-8 shrink-0 items-center gap-2">
        <div className="flex h-full shrink-0 items-center gap-0.5">
          {(Object.keys(MODE_META) as PreviewModeUi[]).map((key) => {
            const meta = MODE_META[key];
            const Icon = meta.Icon;
            return (
              <ToolbarButton
                key={key}
                disabled={!live}
                active={mode === key}
                title={`${meta.label} — ${meta.hint}`}
                onClick={() => live && onSetMode(key)}
              >
                <Icon size={15} strokeWidth={1.75} />
              </ToolbarButton>
            );
          })}
          {onToggleLayers ? (
            <ToolbarButton
              active={layersOpen}
              title={layersOpen ? "Ocultar capas" : "Mostrar capas"}
              onClick={onToggleLayers}
            >
              <Layers size={15} strokeWidth={1.75} />
            </ToolbarButton>
          ) : null}
          <ToolbarButton
            onClick={onCapture}
            disabled={!live}
            title="Cámara — capturar preview al chat"
          >
            <Camera size={15} strokeWidth={1.75} />
          </ToolbarButton>
          {onToggleChat ? (
            <ToolbarButton
              active={chatOpen}
              title={chatOpen ? "Ocultar chat" : "Mostrar chat"}
              onClick={onToggleChat}
            >
              <MessageSquare size={15} strokeWidth={1.75} />
            </ToolbarButton>
          ) : null}
        </div>

        <div className="relative flex h-full min-w-0 flex-1 items-center justify-center">
          <div
            className={`flex h-7 max-w-[360px] shrink-0 items-center rounded-full bg-[var(--bg-2)] px-3 transition-colors duration-120 ${
              live ? "hover:bg-[var(--bg-3)]" : ""
            }`}
          >
            <div className="flex shrink-0 items-center gap-1.5">
              <Globe size={13} strokeWidth={1.75} className="shrink-0 text-[var(--text-2)]" />
              <button
                type="button"
                onClick={onReload}
                disabled={!live}
                title="Recargar preview"
                className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-2)] transition-colors duration-120 enabled:hover:text-[var(--text-0)] disabled:cursor-default disabled:opacity-40"
              >
                <RotateCw size={14} strokeWidth={1.75} />
              </button>
            </div>
            <button
              type="button"
              disabled={!live}
              onClick={() => live && setPagesOpen((v) => !v)}
              title={`Páginas — ${routeLabel(previewPath)}`}
              className="ml-2 flex min-w-0 items-center gap-1.5 enabled:cursor-pointer disabled:cursor-default"
            >
              <span className="min-w-0 truncate text-[12.5px] text-[var(--text-1)]">
                {routeLabel(previewPath)}
              </span>
              <span
                className={`size-1.5 shrink-0 rounded-full ${
                  status === "live"
                    ? "bg-[#ff8a4c]"
                    : status === "down"
                      ? "bg-[var(--danger)]"
                      : "bg-[var(--text-2)]"
                }`}
                aria-hidden
              />
            </button>
          </div>
          {pagesOpen && live ? (
            <>
              <button
                type="button"
                aria-label="Cerrar"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setPagesOpen(false)}
              />
              <div className="absolute top-full left-1/2 z-20 mt-1 w-56 -translate-x-1/2 rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)] py-1 shadow-lg">
                <p className="px-3 py-1 font-mono text-[length:var(--fs-0)] tracking-wide text-[var(--text-2)] uppercase">
                  Páginas
                </p>
                <div className="max-h-64 overflow-y-auto">
                  <PagesMenu
                    pages={pages}
                    onSelectPage={(path) => {
                      onSelectPage?.(path);
                      setPagesOpen(false);
                    }}
                  />
                </div>
                {onOpenInBrowser != null ? (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenInBrowser();
                      setPagesOpen(false);
                    }}
                    className="flex w-full items-center gap-2 border-t border-[var(--line)] px-3 py-2 text-left text-[length:var(--fs-1)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-2)]"
                  >
                    <ExternalLink size={13} strokeWidth={1.75} className="text-[var(--text-2)]" />
                    Abrir en navegador
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex h-full shrink-0 items-center gap-0.5">
          <div className="relative">
            <ToolbarButton
              disabled={!live}
              active={viewport !== "desktop" || viewportOpen}
              title="Vista del preview"
              onClick={() => live && setViewportOpen((v) => !v)}
            >
              <Monitor size={15} strokeWidth={1.75} />
            </ToolbarButton>
            {viewportOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Cerrar"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setViewportOpen(false)}
                />
                <div className="absolute top-full right-0 z-20 mt-1 w-44 rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)] py-1 shadow-lg">
                  {(Object.keys(VIEWPORT_META) as PreviewViewportUi[]).map((key) => {
                    const meta = VIEWPORT_META[key];
                    const Icon = meta.Icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setViewport(key);
                          setViewportOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-120 ${
                          viewport === key
                            ? "bg-[var(--accent-dim)]"
                            : "hover:bg-[var(--bg-2)]"
                        }`}
                      >
                        <Icon
                          size={14}
                          strokeWidth={1.75}
                          className="shrink-0 text-[var(--text-2)]"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[length:var(--fs-1)] text-[var(--text-0)]">
                            {meta.label}
                          </span>
                          <span className="font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
                            {meta.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
          </div>

          <div
            className={`flex min-h-0 flex-1 justify-center overflow-hidden rounded-[var(--radius-s)] ${
            viewportWidth == null ? "bg-white" : "bg-[var(--bg-2)]"
          }`}
          >
          <div
            className="h-full w-full shrink-0 overflow-hidden rounded-[var(--radius-s)] bg-white transition-[width] duration-200 ease-out"
            style={{
              width: viewportWidth == null ? "100%" : `${viewportWidth}px`,
              maxWidth: "100%",
            }}
          >
            {live ? (
              <iframe
                key={iframeKey}
                ref={onFrameEl}
                src={url ?? undefined}
                title="Preview del proyecto"
                className="h-full w-full"
              />
            ) : status === "starting" ? (
              <PreviewSkeleton />
            ) : status === "down" ? (
              <PreviewDown error={error} onRetry={onRetry} />
            ) : (
              <PreviewIdle />
            )}
          </div>
          </div>
        </div>

        <AnimatedPanelColumn
          open={sideActive}
          width={sideResize.width}
          dragging={sideResize.dragging}
          onResizeStart={
            onSidePanelWidthChange ? sideResize.onDragStart : undefined
          }
          resizeTitle="Arrastra para redimensionar el panel"
          shellRef={sideResize.shellRef}
          contentRef={sideResize.contentRef}
        >
          {sidePanel}
        </AnimatedPanelColumn>
      </div>
    </div>
  );
}

function routeLabel(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  const last = path.split("/").filter(Boolean).pop();
  return last ?? "home";
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick?(): void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  const base =
    "flex size-7 items-center justify-center rounded-[8px] transition-colors duration-120 ";
  const state = disabled
    ? "text-[var(--text-2)] opacity-40 cursor-default"
    : active
      ? "text-[var(--text-0)]"
      : "text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--bg-3)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={base + state}
    >
      {children}
    </button>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-1)]">
      <span className="size-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />
      <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
        Arrancando dev server…
      </p>
    </div>
  );
}

function PreviewDown({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry(): void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-1)] px-6 text-center">
      <p className="text-[length:var(--fs-2)] text-[var(--danger)]">
        Preview caído.
      </p>
      {error ? (
        <pre className="max-h-40 max-w-full overflow-auto whitespace-pre-wrap font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
          {error}
        </pre>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[var(--radius-s)] bg-[var(--bg-2)] px-3 py-1 text-[length:var(--fs-1)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-3)]"
      >
        Reintentar
      </button>
    </div>
  );
}

function PreviewIdle() {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--bg-1)]">
      <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
        Sin preview.
      </p>
    </div>
  );
}
