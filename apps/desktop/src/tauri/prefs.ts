// Prefs vía host (TRD §2): last path del proyecto. Usa el plugin-store
// de Tauri. app-state consume esto detrás de PrefsApi, sin saber de Tauri.

import { load, type Store } from "@tauri-apps/plugin-store";
import type { PrefsApi } from "@steer/app-state";

export function createPrefs(): PrefsApi {
  let storePromise: Promise<Store> | null = null;
  const getStore = () => (storePromise ??= load("prefs.json", { autoSave: true }));

  return {
    async getLastProject() {
      const value = await (await getStore()).get<string>("lastProject");
      return value ?? null;
    },
    async setLastProject(path) {
      await (await getStore()).set("lastProject", path);
    },
  };
}
