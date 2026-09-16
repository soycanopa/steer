// antigravity_ensure — el renderer no spawnea `agy`; el host arranca el sidecar.

import { invoke } from "@tauri-apps/api/core";

export type AntigravityEnsureInfo = {
  baseUrl: string;
  version: string;
  spawned: boolean;
};

export async function ensureAntigravity(): Promise<AntigravityEnsureInfo> {
  return invoke<AntigravityEnsureInfo>("antigravity_ensure");
}
