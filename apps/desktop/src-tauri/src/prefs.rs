// prefs.rs — lastProject vía plugin-store en el host (TRD §9).

use tauri_plugin_store::StoreExt;

#[tauri::command]
pub fn prefs_get_last_project(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    Ok(store
        .get("lastProject")
        .and_then(|v| v.as_str().map(String::from)))
}

#[tauri::command]
pub fn prefs_set_last_project(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    store.set("lastProject", path);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
