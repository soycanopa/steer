// Prefs vía host (TRD §2): last path del proyecto. Commands Rust
// evitan race con plugin-store en el webview al arrancar.

import { invoke } from "@tauri-apps/api/core";
import type { PrefsApi } from "@steer/app-state";

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
  };
}
