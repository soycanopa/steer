// grok_ensure — el renderer no habla ACP; el host spawnea el sidecar.

import { invoke } from "@tauri-apps/api/core";

export type GrokEnsureInfo = {
  baseUrl: string;
  version: string;
  spawned: boolean;
};

export async function ensureGrok(): Promise<GrokEnsureInfo> {
  return invoke<GrokEnsureInfo>("grok_ensure");
}
