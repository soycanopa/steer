import { invoke } from "@tauri-apps/api/core";

export async function openUrlInBrowser(url: string): Promise<void> {
  await invoke("host_open_url", { url });
}
