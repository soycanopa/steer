// AppShell — UI.md §3. Titlebar 40px overlay + contenido + Statusbar.
// Recibe datos y callbacks por props; no conoce stores ni adapters
// (ARCHITECTURE §3).

import type { ReactNode } from "react";
import { Layers, MessageSquare } from "lucide-react";
import { Statusbar } from "./Statusbar";

export type AppShellProps = {
  projectName: string;
  projectPath: string;
  /** Estado real del dev server del proyecto abierto. */
  devStatus: "live" | "down" | "idle";
  mode: "inspect" | "interact";
  queueCount: number;
  layersOpen: boolean;
  onToggleLayers(): void;
  chatOpen: boolean;
  onToggleChat(): void;
  children: ReactNode;
};

export function AppShell({
  projectName,
  projectPath,
  devStatus,
  mode,
  queueCount,
  layersOpen,
  onToggleLayers,
  chatOpen,
  onToggleChat,
  children,
}: AppShellProps) {
  return (
    <div
      className="flex h-full flex-col bg-[var(--bg-0)] text-[var(--text-0)]"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <header className="grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-1)] pr-3 pl-[84px]">
        <span className="truncate font-mono text-[length:var(--fs-1)] font-medium text-[var(--text-0)]">
          {projectName}
        </span>
        <span
          className="max-w-[380px] truncate rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 py-0.5 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
          title={projectPath}
        >
          {projectPath}
        </span>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onToggleLayers}
            title={layersOpen ? "Ocultar capas" : "Mostrar capas"}
            className={`flex size-6 items-center justify-center rounded-[var(--radius-s)] transition-colors duration-120 ${
              layersOpen
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-1)] hover:bg-[var(--bg-3)]"
            }`}
          >
            <Layers size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onToggleChat}
            title={chatOpen ? "Ocultar chat" : "Mostrar chat"}
            className={`flex size-6 items-center justify-center rounded-[var(--radius-s)] transition-colors duration-120 ${
              chatOpen
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-1)] hover:bg-[var(--bg-3)]"
            }`}
          >
            <MessageSquare size={14} strokeWidth={1.75} />
          </button>
          <StatusPill label="dev" value={devStatus} tone={devStatus} />
          {/* Estado real de OpenCode llega en Fase F. */}
          <StatusPill label="opencode" value="off" tone="idle" />
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
      <Statusbar mode={mode} queueCount={queueCount} />
    </div>
  );
}

// UI.md §3: pill estado dev (live verde / down rojo) · pill agente.
function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "live" | "down" | "idle";
}) {
  const dot =
    tone === "live"
      ? "bg-[var(--ok)]"
      : tone === "down"
        ? "bg-[var(--danger)]"
        : "bg-[var(--text-2)]";
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-[var(--bg-2)] px-2 py-0.5 font-mono text-[length:var(--fs-0)] text-[var(--text-1)]">
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {label} · {value}
    </span>
  );
}
