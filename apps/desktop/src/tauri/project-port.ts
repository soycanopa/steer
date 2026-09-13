// Wrappers finos de Tauri — ARCHITECTURE §3. Los componentes React nunca
// invocan `invoke` de negocio; esto implementa ProjectPort para el
// composition root. createStart llega en Fase G.
//
// startDev compone dos commands del host (TRD §5.2: dev server → proxy):
// devuelve la URL del PROXY, no la del upstream, para que el preview
// cargue con el bridge inyectado. El upstream queda como detalle del host.

import { invoke } from "@tauri-apps/api/core";
import type { ProjectMeta, ProjectPort } from "@steer/ports";

function unimplemented(what: string): never {
  throw new Error(`No implementado todavía: ${what}`);
}

type DevStartInfo = { url: string; spawned: boolean };
type ProxyStartInfo = { proxyUrl: string };

export function createTauriProjectPort(): ProjectPort {
  return {
    open: (path) => invoke<ProjectMeta>("project_open", { path }),

    startDev: async (path) => {
      const dev = await invoke<DevStartInfo>("project_dev_start", { path });
      const proxy = await invoke<ProxyStartInfo>("proxy_start", {
        upstreamUrl: dev.url,
      });
      return { url: proxy.proxyUrl, spawned: dev.spawned };
    },

    stopDev: async (path) => {
      await invoke("proxy_stop");
      await invoke("project_dev_stop", { path });
    },

    createStart: async () => unimplemented("project_create_start (Fase G)"),
  };
}
