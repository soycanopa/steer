// Wrapper fino Tauri — solo el composition/App lo importa. Arrastra la
// ventana cuando el titlebar es Overlay y el chrome custom cubre el
// titlebar nativo (data-tauri-drag-region no siempre basta en WebView).

import { getCurrentWindow } from "@tauri-apps/api/window";

export function startWindowDrag(): void {
  void getCurrentWindow().startDragging();
}
