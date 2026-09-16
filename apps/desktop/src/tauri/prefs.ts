// Prefs vía host (TRD §2): proyecto, modelo y sesión OpenCode.

import { invoke } from "@tauri-apps/api/core";
import type { AgentPrefs, PrefsApi, WorkspaceSnapshot } from "@steer/app-state";

export function createPrefs(): PrefsApi {
  return {
    async getLastProject() {
      try {
        return await invoke<string | null>("prefs_get_last_project");
      } catch {
        return null;
      }
    },
    async setLastProject(path) {
      await invoke("prefs_set_last_project", { path });
    },
    async getOpenProjectTabs() {
      try {
        return await invoke<string[]>("prefs_get_open_project_tabs");
      } catch {
        return [];
      }
    },
    async setOpenProjectTabs(tabs) {
      await invoke("prefs_set_open_project_tabs", { tabs });
    },
    async getProjectWorkspace(projectRoot) {
      try {
        return await invoke<WorkspaceSnapshot | null>(
          "prefs_get_project_workspace",
          { projectRoot },
        );
      } catch {
        return null;
      }
    },
    async setProjectWorkspace(projectRoot, workspace) {
      await invoke("prefs_set_project_workspace", { projectRoot, workspace });
    },
    async deleteProjectWorkspace(projectRoot) {
      await invoke("prefs_delete_project_workspace", { projectRoot });
    },
    async getAgentPrefs() {
      try {
        return await invoke<AgentPrefs>("prefs_get_agent_prefs");
      } catch {
        return {
          providerId: null,
          modelId: null,
          reasoningEffort: null,
          paramValues: null,
        };
      }
    },
    async setAgentPrefs(prefs) {
      await invoke("prefs_set_agent_prefs", {
        prefs: {
          providerId: prefs.providerId,
          modelId: prefs.modelId,
          reasoningEffort: prefs.reasoningEffort,
          paramValues: prefs.paramValues,
        },
      });
    },
    async getLastAgentSession(projectRoot) {
      try {
        return await invoke<string | null>("prefs_get_last_agent_session", {
          projectRoot,
        });
      } catch {
        return null;
      }
    },
    async setLastAgentSession(projectRoot, sessionId) {
      await invoke("prefs_set_last_agent_session", {
        projectRoot,
        sessionId,
      });
    },
    async getRecentProjects() {
      try {
        return await invoke<string[]>("prefs_get_recent_projects");
      } catch {
        return [];
      }
    },
    async setRecentProjects(paths) {
      await invoke("prefs_set_recent_projects", { projects: paths });
    },
    async getProjectThumbnails() {
      try {
        return await invoke<Record<string, string>>(
          "prefs_get_project_thumbnails",
        );
      } catch {
        return {};
      }
    },
    async setProjectThumbnail(projectRoot, dataUrl) {
      await invoke("prefs_set_project_thumbnail", { projectRoot, dataUrl });
    },
    async clearProjectThumbnail(projectRoot) {
      await invoke("prefs_clear_project_thumbnail", { projectRoot });
    },
  };
}
