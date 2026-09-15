import { invoke } from "@tauri-apps/api/core";

export async function revealProjectInFinder(path: string): Promise<void> {
  await invoke("project_reveal_in_finder", { path });
}
