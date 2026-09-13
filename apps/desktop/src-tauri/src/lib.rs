// Host Tauri — ARCHITECTURE §8. Registro de plugins y commands.
// El producto vive en packages/*; src-tauri no conoce Intent.

use tauri::Manager;

mod devserver;
mod process;
mod project;
mod proxy;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(devserver::new_map())
        .manage(proxy::new_handle())
        .invoke_handler(tauri::generate_handler![
            project::project_open,
            project::project_read_package,
            devserver::project_dev_start,
            devserver::project_dev_stop,
            proxy::proxy_start,
            proxy::proxy_stop
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Al salir: apagar el proxy. Los dev servers PERSISTEN a
                // propósito — reabrir el mismo proyecto es instantáneo
                // (TRD §4.1.4 reutiliza el puerto; el estado queda en tmp).
                let proxy_handle = app.state::<proxy::ProxyHandle>().inner();
                tauri::async_runtime::block_on(proxy::stop_all(proxy_handle));
            }
        });
}
