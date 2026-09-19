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
  mode: "inspect" | "comment" | "interact";
  queueCount: number;
  /** Branch actual; null si el proyecto no es repo git. */
  branch?: string | null;
  branches?: string[];
  vcsError?: string | null;
  /** Ámbito del proyecto: "local" hoy; "remote" reservado. */
  projectScope?: "local" | "remote" | null;
  onSelectBranch?(branch: string): void;
  children: ReactNode;
};

export function AppShell({
  projectTabs,
  devStatus,
  agentStatus,
  agentDetail = null,
  agentBusy = false,
  mode,
  queueCount,
  branch = null,
  branches = [],
  vcsError = null,
  projectScope = null,
  onSelectBranch,
  children,
}: AppShellProps) {
  return (
    <div
      className="flex h-full flex-col bg-[var(--bg-0)] pb-1.5 text-[var(--text-0)]"
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
        <div className="flex shrink-0 items-center gap-2 self-center">
          <StatusBadge
            label={previewStatusLabel(devStatus)}
            tone={devStatus}
          />
          <StatusBadge label={t.statusbar.agent} tone={agentStatus} title={agentDetail} />
        </div>
      </header>
      <main className="min-h-0 flex-1 bg-[var(--bg-1)] px-1.5 pb-1.5">{children}</main>
      <Statusbar
        mode={mode}
        queueCount={queueCount}
        agentBusy={agentBusy}
        branch={branch}
        branches={branches}
        vcsError={vcsError}
        projectScope={projectScope}
        onSelectBranch={(name) => onSelectBranch?.(name)}
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

// UI.md §3: badge de estado — live verde, down rojo, idle gris. El color
// del estado tiñe toda la badge (tinte + texto), no solo un punto.
function StatusBadge({
  label,
  tone,
  title,
}: {
  label: string;
  tone: "live" | "down" | "idle";
  title?: string | null;
}) {
  const tint =
    tone === "live"
      ? "border-[var(--ok)]/30 bg-[var(--ok)]/15 text-[var(--ok)]"
      : tone === "down"
        ? "border-[var(--danger)]/30 bg-[var(--danger)]/15 text-[var(--danger)]"
        : "border-transparent bg-[var(--bg-2)] text-[var(--text-2)]";
  return (
    <span
      title={title ?? undefined}
      className={`flex items-center gap-1 rounded-full border px-1.5 font-mono text-[10px] uppercase leading-[14px] tracking-wide ${tint}`}
    >
      {label}
    </span>
  );
}
