// AppShell — UI.md §3. Titlebar 40px overlay + contenido + Statusbar.
// Recibe datos y callbacks por props; no conoce stores ni adapters
// (ARCHITECTURE §3).

import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { Statusbar } from "./Statusbar";

export type AppShellProps = {
  projectName: string;
  projectPath: string;
  /** Estado real del dev server del proyecto abierto. */
  devStatus: "live" | "down" | "idle";
  /** Estado del AgentPort (Fase F). */
  agentStatus: "live" | "down" | "idle";
  agentLabel: string;
  agentDetail?: string | null;
  agentBusy?: boolean;
  modelLabel?: string | null;
  mode: "inspect" | "comment" | "interact";
  queueCount: number;
  chatOpen: boolean;
  onToggleChat(): void;
  /** Arrastra la ventana (inyectado desde apps/desktop; UI no importa Tauri). */
  onStartDrag?(): void;
  children: ReactNode;
};

export function AppShell({
  projectName,
  projectPath,
  devStatus,
  agentStatus,
  agentLabel,
  agentDetail = null,
  agentBusy = false,
  modelLabel = null,
  mode,
  queueCount,
  chatOpen,
  onToggleChat,
  onStartDrag,
  children,
}: AppShellProps) {
  return (
    <div
      className="flex h-full flex-col bg-[var(--bg-0)] text-[var(--text-0)]"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      {/* Titlebar Overlay: arrastre vía API Tauri (onStartDrag) + atributo. */}
      <header
        data-tauri-drag-region=""
        className="grid h-10 shrink-0 cursor-default grid-cols-[1fr_auto_1fr] select-none items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-1)] pr-3 pl-[84px]"
        onMouseDown={(e) => {
          if (e.button !== 0 || !onStartDrag) return;
          const t = e.target as HTMLElement | null;
          if (t?.closest("button, a, input, select, textarea, [role=button]")) {
            return;
          }
          // No preventDefault: en macOS Overlay eso rompe startDragging.
          onStartDrag();
        }}
      >
        <span
          data-tauri-drag-region=""
          className="truncate font-mono text-[length:var(--fs-1)] font-medium text-[var(--text-0)]"
        >
          {projectName}
        </span>
        <span
          data-tauri-drag-region=""
          className="max-w-[380px] truncate rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 py-0.5 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
          title={projectPath}
        >
          {projectPath}
        </span>
        {/* Los controles NO arrastran: los clicks deben seguir siendo clics. */}
        <div className="flex items-center justify-end gap-2">
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
          <StatusPill
            label="opencode"
            value={agentStatus === "live" ? agentLabel : agentStatus}
            tone={agentStatus}
            title={agentDetail}
          />
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
      <Statusbar
        mode={mode}
        queueCount={queueCount}
        modelLabel={modelLabel}
        agentBusy={agentBusy}
      />
    </div>
  );
}

// UI.md §3: pill estado dev (live verde / down rojo) · pill agente.
function StatusPill({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone: "live" | "down" | "idle";
  title?: string | null;
}) {
  const dot =
    tone === "live"
      ? "bg-[var(--ok)]"
      : tone === "down"
        ? "bg-[var(--danger)]"
        : "bg-[var(--text-2)]";
  return (
    <span
      title={title ?? undefined}
      className="flex items-center gap-1.5 rounded-full bg-[var(--bg-2)] px-2 py-0.5 font-mono text-[length:var(--fs-0)] text-[var(--text-1)]"
    >
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {label} · {value}
    </span>
  );
}
