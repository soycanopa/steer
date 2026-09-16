// cursor_ensure — el renderer no carga @cursor/sdk; el host spawnea el sidecar.

import { invoke } from "@tauri-apps/api/core";

export type CursorEnsureInfo = {
  baseUrl: string;
  version: string;
  spawned: boolean;
};

export async function ensureCursor(): Promise<CursorEnsureInfo> {
  return invoke<CursorEnsureInfo>("cursor_ensure");
}
