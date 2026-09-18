// AppShell — UI.md §3. Titlebar 40px overlay + contenido + Statusbar.
// Recibe datos y callbacks por props; no conoce stores ni adapters
// (ARCHITECTURE §3).

import type { ReactNode } from "react";
import { Statusbar } from "./Statusbar";
import { t } from "./i18n";

export type AppShellProps = {
  /** Tabs de proyecto alineados con la columna de preview. */
  projectTabs?: ReactNode;
  /** Estado real del dev server del proyecto abierto. */
  devStatus: "live" | "down" | "idle";
  /** Estado del AgentPort (Fase F). */
  agentStatus: "live" | "down" | "idle";
  agentDetail?: string | null;
  agentBusy?: boolean;
  modelLabel?: string | null;
  mode: "inspect" | "comment" | "interact";
  queueCount: number;
  children: ReactNode;
};

export function AppShell({
  projectTabs,
  devStatus,
  agentStatus,
  agentDetail = null,
  agentBusy = false,
  modelLabel = null,
  mode,
  queueCount,
  children,
}: AppShellProps) {
  return (
    <div
      className="flex h-full flex-col bg-[var(--bg-0)] text-[var(--text-0)]"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Titlebar: tabs junto a traffic lights + arrastre + estado. */}
      <header
        className="flex h-8 shrink-0 cursor-default select-none items-end bg-[var(--bg-1)] pr-3"
      >
        <div className="flex min-h-0 min-w-0 flex-1 items-end gap-1 pl-[84px]">
          {projectTabs}
        </div>
        <div className="mb-1 flex shrink-0 items-center gap-2">
          <StatusPill
            label={previewStatusLabel(devStatus)}
            tone={devStatus}
          />
          <StatusPill label={t.statusbar.agent} tone={agentStatus} title={agentDetail} />
        </div>
      </header>
      <main className="min-h-0 flex-1 bg-[var(--bg-1)] px-1.5 pb-1.5">{children}</main>
      <Statusbar
        mode={mode}
        queueCount={queueCount}
        modelLabel={modelLabel}
        agentBusy={agentBusy}
      />
      </div>
    </div>
  );
}

function previewStatusLabel(status: "live" | "down" | "idle"): string {
  if (status === "live") return t.statusbar.live;
  if (status === "down") return t.statusbar.down;
  return t.statusbar.idle;
}

// UI.md §3: pill estado preview (live verde / down rojo) · pill agente.
function StatusPill({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value?: string;
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
      {label}
      {value != null && value !== "" ? ` · ${value}` : null}
    </span>
  );
}
