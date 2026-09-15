// Wrappers finos de Tauri — ARCHITECTURE §3. Los componentes React nunca
// invocan `invoke` de negocio; esto implementa ProjectPort para el
// composition root.
//
// startDev compone dos commands del host (TRD §5.2: dev server → proxy):
// devuelve la URL del PROXY, no la del upstream, para que el preview
// cargue con el bridge inyectado. El upstream queda como detalle del host.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  CreateProgress,
  ProjectMeta,
  ProjectPort,
  ProjectRoute,
} from "@steer/ports";

type DevStartInfo = { url: string; spawned: boolean };
type ProxyStartInfo = { proxyUrl: string };

export function createTauriProjectPort(): ProjectPort {
  return {
    open: (path) => invoke<ProjectMeta>("project_open", { path }),

    ensureDevtools: (path) =>
      invoke<ProjectMeta>("project_ensure_devtools", { path }),

    listRoutes: (path) => invoke<ProjectRoute[]>("project_list_routes", { path }),

    startDev: async (path) => {
      const dev = await invoke<DevStartInfo>("project_dev_start", { path });
      const proxy = await invoke<ProxyStartInfo>("proxy_start", {
        upstreamUrl: dev.url,
      });
      return { url: proxy.proxyUrl, spawned: dev.spawned };
    },

    detachPreview: () => invoke("proxy_stop"),

    stopDev: async (path) => {
      await invoke("proxy_stop");
      await invoke("project_dev_stop", { path });
    },

    createStart: async (parentDir, name, onProgress) => {
      const unlisten =
        onProgress != null
          ? await listen<CreateProgress>("project-create-progress", (event) => {
              onProgress(event.payload);
            })
          : null;
      try {
        return await invoke<ProjectMeta>("project_create_start", {
          parentDir,
          name,
        });
      } finally {
        if (unlisten != null) {
          await unlisten();
        }
      }
    },
  };
}
