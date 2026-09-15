import type { AgentSessionSummary, ProjectMeta, ProjectRoute } from "@steer/ports";
import type { PreviewSlice } from "./preview";
import type { SelectionSlice } from "./selection";
import type { IntentsSlice } from "./intents";

export type WorkspaceSnapshot = {
  meta: ProjectMeta;
  projectRoutes: ProjectRoute[];
  preview: Pick<
    PreviewSlice,
    | "previewStatus"
    | "previewUrl"
    | "previewPath"
    | "previewError"
    | "reloadNonce"
  >;
  selection: SelectionSlice;
  intents: Pick<
    IntentsSlice,
    | "sessions"
    | "activeSessionId"
    | "queue"
    | "draftNote"
    | "draftAttachments"
    | "nextPin"
    | "tree"
  >;
  agentSessions: AgentSessionSummary[];
};

const workspaces = new Map<string, WorkspaceSnapshot>();

export function snapshotWorkspace(
  root: string,
  state: {
    projectMeta: ProjectMeta | null;
    projectRoutes: ProjectRoute[];
    previewStatus: PreviewSlice["previewStatus"];
    previewUrl: PreviewSlice["previewUrl"];
    previewPath: PreviewSlice["previewPath"];
    previewError: PreviewSlice["previewError"];
    reloadNonce: PreviewSlice["reloadNonce"];
    mode: SelectionSlice["mode"];
    inspectOn: SelectionSlice["inspectOn"];
    selection: SelectionSlice["selection"];
    selectedId: SelectionSlice["selectedId"];
    hoverSelection: SelectionSlice["hoverSelection"];
    scope: SelectionSlice["scope"];
    tweaks: SelectionSlice["tweaks"];
    tweakLog: SelectionSlice["tweakLog"];
    sessions: IntentsSlice["sessions"];
    activeSessionId: IntentsSlice["activeSessionId"];
    queue: IntentsSlice["queue"];
    draftNote: IntentsSlice["draftNote"];
    draftAttachments: IntentsSlice["draftAttachments"];
    nextPin: IntentsSlice["nextPin"];
    tree: IntentsSlice["tree"];
    agentSessions: AgentSessionSummary[];
  },
): void {
  if (state.projectMeta == null || state.projectMeta.root !== root) {
    return;
  }
  workspaces.set(root, {
    meta: state.projectMeta,
    projectRoutes: state.projectRoutes,
    preview: {
      previewStatus: state.previewStatus,
      previewUrl: state.previewUrl,
      previewPath: state.previewPath,
      previewError: state.previewError,
      reloadNonce: state.reloadNonce,
    },
    selection: {
      mode: state.mode,
      inspectOn: state.inspectOn,
      selection: state.selection,
      selectedId: state.selectedId,
      hoverSelection: state.hoverSelection,
      scope: state.scope,
      tweaks: state.tweaks,
      tweakLog: state.tweakLog,
    },
    intents: {
      sessions: state.sessions,
      activeSessionId: state.activeSessionId,
      queue: state.queue,
      draftNote: state.draftNote,
      draftAttachments: state.draftAttachments,
      nextPin: state.nextPin,
      tree: state.tree,
    },
    agentSessions: state.agentSessions,
  });
}

export function restoreWorkspace(root: string): WorkspaceSnapshot | null {
  return workspaces.get(root) ?? null;
}

export function cacheWorkspace(snapshot: WorkspaceSnapshot): void {
  workspaces.set(snapshot.meta.root, snapshot);
}

export function deleteWorkspace(root: string): void {
  workspaces.delete(root);
}
