// Diálogo nativo de carpeta (ARCHITECTURE §8: dialog open directory).

import { open } from "@tauri-apps/plugin-dialog";

export async function pickDirectory(): Promise<string | null> {
  const selection = await open({
    directory: true,
    multiple: false,
    title: "Abrir proyecto",
  });
  return typeof selection === "string" ? selection : null;
}
