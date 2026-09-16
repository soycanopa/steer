// prefs.rs — lastProject, modelo y sesión OpenCode vía plugin-store (TRD §9).

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentPrefs {
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub reasoning_effort: Option<String>,
}

fn read_workspace_map(
    store: &Arc<tauri_plugin_store::Store<tauri::Wry>>,
) -> HashMap<String, serde_json::Value> {
    store
        .get("projectWorkspaces")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

fn read_session_map(store: &Arc<tauri_plugin_store::Store<tauri::Wry>>) -> HashMap<String, String> {
    store
        .get("lastAgentSessionByProject")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

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

#[tauri::command]
pub fn prefs_get_open_project_tabs(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    Ok(store
        .get("openProjectTabs")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

#[tauri::command]
pub fn prefs_set_open_project_tabs(
    app: tauri::AppHandle,
    tabs: Vec<String>,
) -> Result<(), String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    store.set(
        "openProjectTabs",
        serde_json::to_value(tabs).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn prefs_get_agent_prefs(app: tauri::AppHandle) -> Result<AgentPrefs, String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    Ok(store
        .get("agentPrefs")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

#[tauri::command]
pub fn prefs_set_agent_prefs(
    app: tauri::AppHandle,
    prefs: AgentPrefs,
) -> Result<(), String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    store.set(
        "agentPrefs",
        serde_json::to_value(prefs).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn prefs_get_project_workspace(
    app: tauri::AppHandle,
    project_root: String,
) -> Result<Option<serde_json::Value>, String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    Ok(read_workspace_map(&store).get(&project_root).cloned())
}

#[tauri::command]
pub fn prefs_set_project_workspace(
    app: tauri::AppHandle,
    project_root: String,
    workspace: serde_json::Value,
) -> Result<(), String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    let mut map = read_workspace_map(&store);
    map.insert(project_root, workspace);
    store.set(
        "projectWorkspaces",
        serde_json::to_value(map).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn prefs_delete_project_workspace(
    app: tauri::AppHandle,
    project_root: String,
) -> Result<(), String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    let mut map = read_workspace_map(&store);
    map.remove(&project_root);
    store.set(
        "projectWorkspaces",
        serde_json::to_value(map).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn prefs_get_last_agent_session(
    app: tauri::AppHandle,
    project_root: String,
) -> Result<Option<String>, String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    Ok(read_session_map(&store).get(&project_root).cloned())
}

#[tauri::command]
pub fn prefs_set_last_agent_session(
    app: tauri::AppHandle,
    project_root: String,
    session_id: String,
) -> Result<(), String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    let mut map = read_session_map(&store);
    map.insert(project_root, session_id);
    store.set(
        "lastAgentSessionByProject",
        serde_json::to_value(map).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Home: proyectos recientes + thumbnails de preview (TRD §9).

#[tauri::command]
pub fn prefs_get_recent_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    Ok(store
        .get("recentProjects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

#[tauri::command]
pub fn prefs_set_recent_projects(
    app: tauri::AppHandle,
    projects: Vec<String>,
) -> Result<(), String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    store.set(
        "recentProjects",
        serde_json::to_value(projects).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

fn read_thumbnail_map(
    store: &Arc<tauri_plugin_store::Store<tauri::Wry>>,
) -> HashMap<String, String> {
    store
        .get("projectThumbnails")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn prefs_get_project_thumbnails(
    app: tauri::AppHandle,
) -> Result<HashMap<String, String>, String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    Ok(read_thumbnail_map(&store))
}

#[tauri::command]
pub fn prefs_set_project_thumbnail(
    app: tauri::AppHandle,
    project_root: String,
    data_url: String,
) -> Result<(), String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    let mut map = read_thumbnail_map(&store);
    map.insert(project_root, data_url);
    store.set(
        "projectThumbnails",
        serde_json::to_value(map).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn prefs_clear_project_thumbnail(
    app: tauri::AppHandle,
    project_root: String,
) -> Result<(), String> {
    let store = app.store("prefs.json").map_err(|e| e.to_string())?;
    let mut map = read_thumbnail_map(&store);
    if map.remove(&project_root).is_some() {
        store.set(
            "projectThumbnails",
            serde_json::to_value(map).map_err(|e| e.to_string())?,
        );
        store.save().map_err(|e| e.to_string())?;
    }
    Ok(())
}
