// opencode_ensure — TRD §4.2. El renderer no spawnea opencode por CLI;
// solo invoca este command del host.

import { invoke } from "@tauri-apps/api/core";

export type OpencodeEnsureInfo = {
  baseUrl: string;
  version: string;
  spawned: boolean;
  /** Password del server v2 para Basic auth (null si no pide auth). */
  password: string | null;
};

export async function ensureOpencode(directory: string): Promise<OpencodeEnsureInfo> {
  return invoke<OpencodeEnsureInfo>("opencode_ensure", { directory });
}
