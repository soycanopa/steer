// Host Tauri — ARCHITECTURE §8. Registro de plugins y commands.
// El producto vive en packages/*; src-tauri no conoce Intent.

mod project;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            project::project_open,
            project::project_read_package
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
