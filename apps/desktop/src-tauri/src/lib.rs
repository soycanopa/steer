// Host Tauri — ARCHITECTURE §8. Registro de plugins y commands.
// El producto vive en packages/*; src-tauri no conoce Intent.

use tauri::Manager;

mod devserver;
mod process;
mod project;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(devserver::new_map())
        .invoke_handler(tauri::generate_handler![
            project::project_open,
            project::project_read_package,
            devserver::project_dev_start,
            devserver::project_dev_stop
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, event| {
            // Al salir, matar solo los dev servers que Steer arrancó.
            if let tauri::RunEvent::Exit = event {
                let map = _app.state::<devserver::DevServerMap>().inner().clone();
                devserver::kill_all(&map);
            }
        });
}
