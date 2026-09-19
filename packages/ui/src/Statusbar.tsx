// Statusbar — UI.md §3: 28px con modo (icono + minúscula), n intents en
// cola, chip de ámbito del proyecto (local/remote, reservado) y branch.

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Folder,
  GitBranch,
  MessageSquarePlus,
  MousePointer,
  SquareDashedMousePointer,
} from "lucide-react";
import { t } from "./i18n";
import { useAnchoredPopover } from "./use-anchored-popover";
import { MenuContent, MenuItem } from "./menu";

export type StatusbarMode = "inspect" | "comment" | "interact";

export type StatusbarProps = {
  mode: StatusbarMode;
  queueCount: number;
  agentBusy?: boolean;
  className?: string;
  /** Branch actual; null si el proyecto no es repo git. */
  branch: string | null;
  branches: string[];
  /** Error del último switch de branch. */
  vcsError?: string | null;
  /** Ámbito del proyecto: "local" hoy; "remote" reservado. */
  projectScope: "local" | "remote" | null;
  onSelectBranch(branch: string): void;
};

const MODE_ICONS = {
  inspect: SquareDashedMousePointer,
  comment: MessageSquarePlus,
  interact: MousePointer,
} as const;

export function Statusbar({
  mode,
  queueCount,
  agentBusy = false,
  className = "",
  branch,
  branches,
  vcsError = null,
  projectScope,
  onSelectBranch,
}: StatusbarProps) {
  const [branchOpen, setBranchOpen] = useState(false);
  const branchMenu = useAnchoredPopover(branchOpen, 200);
  const ModeIcon = MODE_ICONS[mode];

  return (
    <footer
      className={`flex h-7 shrink-0 items-center justify-between overflow-hidden rounded-[var(--radius-m)] bg-[var(--bg-1)] px-3 font-mono text-[12px] text-[var(--text-2)] ${className}`}
    >
      <div className="flex h-full -translate-y-px items-center gap-3">
        <span
          className={`inline-flex h-5 items-center gap-1.5 lowercase leading-none ${
            mode !== "interact"
              ? "text-[var(--accent)]"
              : "text-[var(--text-1)]"
          }`}
        >
          <ModeIcon size={12} strokeWidth={1.75} aria-hidden />
          {mode}
        </span>
        {queueCount > 0 ? (
          <span className="leading-none">{t.statusbar.intentsInQueue(queueCount)}</span>
        ) : null}
        {agentBusy ? (
          <span className="leading-none text-[var(--accent)]">{t.statusbar.agentBusy}</span>
        ) : null}
      </div>
      <div className="flex h-full -translate-y-px items-center gap-2">
        {projectScope != null ? (
          <span
            title={projectScope === "remote" ? "Remote project" : "Local project"}
            className="inline-flex h-5 items-center gap-1 rounded-full bg-[var(--bg-2)] px-1.5 lowercase leading-none text-[var(--text-1)]"
          >
            <Folder size={11} strokeWidth={1.75} aria-hidden />
            {projectScope}
          </span>
        ) : null}
        {projectScope != null && branch != null ? (
          <div className="relative">
            <button
              ref={branchMenu.anchorRef}
              type="button"
              aria-expanded={branchOpen}
              title={branch}
              onClick={() => setBranchOpen((v) => !v)}
              className="inline-flex h-5 items-center gap-1 rounded-full bg-[var(--bg-2)] px-1.5 leading-none text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-3)] hover:text-[var(--text-0)]"
            >
              <GitBranch size={11} strokeWidth={1.75} aria-hidden />
              <span className="max-w-[140px] truncate">{branch}</span>
              <ChevronDown size={10} strokeWidth={2} />
            </button>
            {branchOpen && branchMenu.style != null
              ? createPortal(
                  <div
                    className="fixed inset-0 z-[200]"
                    onMouseDown={() => setBranchOpen(false)}
                  >
                    <MenuContent
                      className="fixed w-52"
                      style={branchMenu.style ?? undefined}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <p className="px-2 py-1 font-mono text-[length:var(--fs-0)] uppercase tracking-wide text-[var(--text-2)]">
                        {t.chat.branches}
                      </p>
                      {branches.map((name) => (
                        <MenuItem
                          key={name}
                          selected={name === branch}
                          label={name}
                          onClick={() => {
                            onSelectBranch(name);
                            setBranchOpen(false);
                          }}
                        />
                      ))}
                    </MenuContent>
                  </div>,
                  document.body,
                )
              : null}
          </div>
        ) : projectScope != null ? (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[var(--bg-2)] px-1.5 leading-none text-[var(--text-1)]">
            <GitBranch size={11} strokeWidth={1.75} aria-hidden />
            {t.chat.noBranch}
          </span>
        ) : null}
        {vcsError != null && vcsError !== "" ? (
          <span
            className="max-w-[180px] truncate leading-none text-[var(--danger)]"
            title={vcsError}
          >
            {vcsError}
          </span>
        ) : null}
      </div>
    </footer>
  );
}
