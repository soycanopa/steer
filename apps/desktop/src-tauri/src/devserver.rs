// devserver.rs — ciclo de vida del dev server del proyecto (TRD §4.1).
// Reutilizar si ya responde; si no, spawn de `pm run dev`, extraer la URL
// real del stdout y health-check hasta 30s. Steer solo mata los procesos
// que ella misma arrancó.

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::process;
use crate::process::SharedLines;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevStartInfo {
    url: String,
    spawned: bool,
}

pub struct ManagedDev {
    child: Child,
    url: String,
}

/// Ruta del proyecto → proceso gestionado. Estado Tauri compartido.
pub type DevServerMap = Mutex<HashMap<String, ManagedDev>>;

pub fn new_map() -> DevServerMap {
    Mutex::new(HashMap::new())
}

// ---- Estado persistente de los dev servers (sobrevive al cierre de la app
// para que reabrir un proyecto sea instantáneo; TRD §4.1.4 de reutilización).
//
// Guardamos la URL REAL por proyecto, no el puerto por convención: como todo
// scaffold arranca con `vite dev --port 3000`, varios proyectos hacen que Vite
// incremente el puerto (3001, 3002…) y atribuir :3000 al proyecto equivocado
// mostraba el preview del proyecto viejo al reiniciar.

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedDev {
    url: String,
    pgid: i32,
}

#[derive(Default, Serialize, Deserialize)]
struct PersistedState {
    #[serde(default)]
    servers: HashMap<String, PersistedDev>,
}

fn state_file() -> std::path::PathBuf {
    std::env::temp_dir().join("steer-devserver.json")
}

/// Estado persistido. Formato viejo `{ path, pgid }` (sin `servers`) se
/// deserializa a un mapa vacío: se vuelve a spawnear en vez de reutilizar un
/// :3000 ajeno.
fn read_state() -> PersistedState {
    fs::read_to_string(state_file())
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_state(state: &PersistedState) {
    if let Ok(json) = serde_json::to_string(state) {
        let _ = fs::write(state_file(), json);
    }
}

fn upsert_state(path: &str, url: &str, pgid: i32) {
    let mut state = read_state();
    state.servers.insert(
        path.to_string(),
        PersistedDev {
            url: url.to_string(),
            pgid,
        },
    );
    save_state(&state);
}

fn remove_state(path: &str) {
    let mut state = read_state();
    if state.servers.remove(path).is_some() {
        save_state(&state);
    }
}

#[tauri::command]
pub async fn project_dev_start(
    path: String,
    state: tauri::State<'_, DevServerMap>,
) -> Result<DevStartInfo, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("La carpeta no existe: {path}"));
    }

    // 1. Ya lo arrancamos y sigue vivo (HTTP, no solo TCP).
    let cached_url = state
        .lock()
        .expect("devserver map poisoned")
        .get(&path)
        .map(|dev| dev.url.clone());
    if let Some(cached) = cached_url {
        if let Some(url) = crate::upstream_probe::resolve(&cached).await {
            return Ok(DevStartInfo {
                url,
                spawned: false,
            });
        }
        // Proceso muerto pero entrada en mapa: limpiar y reintentar spawn.
        state.lock().expect("devserver map poisoned").remove(&path);
        remove_state(&path);
    }

    // 2. Tras un reinicio el mapa en memoria está vacío. No reutilizamos
    //    URLs persistidas: el puerto puede haberlo ocupado otro proyecto
    //    (el preview mostraba el fixture viejo hasta cambiar de tab).
    //    Matamos el árbol huérfano de ESTE path y spawneamos de nuevo.
    let mut persisted = read_state();
    {
        let managed: Vec<String> = state
            .lock()
            .expect("devserver map poisoned")
            .keys()
            .cloned()
            .collect();
        let orphans: Vec<String> = persisted
            .servers
            .keys()
            .filter(|p| *p != &path && !managed.contains(p))
            .cloned()
            .collect();
        if !orphans.is_empty() {
            for orphan in orphans {
                if let Some(entry) = persisted.servers.remove(&orphan) {
                    process::kill_pgid(entry.pgid);
                }
            }
            save_state(&persisted);
        }
    }
    if let Some(entry) = persisted.servers.remove(&path) {
        process::kill_pgid(entry.pgid);
        save_state(&persisted);
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
    // 3. Script `dev` presente.
    let pkg = crate::project::read_package_json(root)?;
    let has_dev = pkg
        .get("scripts")
        .and_then(|s| s.get("dev"))
        .is_some();
    if !has_dev {
        return Err(
            "El proyecto no tiene script `dev` en package.json — Steer no sabe arrancarlo."
                .to_string(),
        );
    }

    // 4. Spawn `pm run dev` con cwd = proyecto.
    let pm = crate::project::detect_package_manager(root);
    let mut child = process::spawn_in_dir(root, pm, &["run", "dev"])?;
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");
    let logs = process::shared_lines();
    process::drain(stdout, logs.clone());
    process::drain(stderr, logs.clone());

    // 5. Esperar la URL real del stdout, con health-check (30s).
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut url: Option<String> = None;

    while Instant::now() < deadline {
        // El proceso murió antes de servir: reportar cola de logs.
        if let Ok(Some(status)) = child.try_wait() {
            let tail = process::tail(&logs, 8).join("\n");
            return Err(format!(
                "El dev server murió al arrancar ({status}). Últimas líneas:\n{tail}"
            ));
        }
        if let Some(found) = url_from_logs(&logs) {
            if let Some(ready) = crate::upstream_probe::resolve(&found).await {
                url = Some(ready);
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }

    match url {
        Some(url) => {
            let pgid = child.id() as i32;
            state
                .lock()
                .expect("devserver map poisoned")
                .insert(path.clone(), ManagedDev { child, url: url.clone() });
            upsert_state(&path, &url, pgid);
            Ok(DevStartInfo { url, spawned: true })
        }
        None => {
            process::kill_tree(&mut child);
            let tail = process::tail(&logs, 8).join("\n");
            Err(format!(
                "El dev server no respondió en 30s. Últimas líneas:\n{tail}"
            ))
        }
    }
}

#[tauri::command]
pub fn project_dev_stop(path: String, state: tauri::State<'_, DevServerMap>) {
    // Solo mata lo que Steer arrancó. Un server ajeno queda intacto.
    let killed_tree = if let Ok(mut map) = state.lock() {
        if let Some(mut dev) = map.remove(&path) {
            process::kill_tree(&mut dev.child);
            true
        } else {
            false
        }
    } else {
        false
    };
    // Server reutilizado de una sesión anterior: no hay Child en mano, pero sí
    // el pgid persistido.
    if !killed_tree {
        let persisted = read_state();
        if let Some(entry) = persisted.servers.get(&path) {
            process::kill_pgid(entry.pgid);
        }
    }
    remove_state(&path);
}

fn url_from_logs(logs: &SharedLines) -> Option<String> {
    let guard = logs.lock().expect("lines poisoned");
    guard.iter().rev().find_map(|line| extract_local_url(line))
}

/// `Local: http://localhost:3000/` o `http://127.0.0.1:5173` → URL.
fn extract_local_url(line: &str) -> Option<String> {
    for prefix in ["http://localhost:", "http://127.0.0.1:"] {
        let Some(start) = line.find(prefix) else {
            continue;
        };
        let rest = &line[start..];
        let end = rest
            .char_indices()
            .find(|(i, c)| {
                *i >= prefix.len()
                    && !(c.is_ascii_alphanumeric() || matches!(c, '.' | ':' | '/' | '-' | '_'))
            })
            .map(|(i, _)| i)
            .unwrap_or(rest.len());
        let candidate = rest[..end].trim_end_matches('/');
        // Validar que haya puerto.
        if port_of(candidate) > 0 {
            return Some(candidate.to_string());
        }
    }
    None
}

fn port_of(url: &str) -> u16 {
    url.rsplit(':')
        .next()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persiste_url_real_por_proyecto() {
        let mut state = PersistedState::default();
        state.servers.insert(
            "/tmp/a".to_string(),
            PersistedDev {
                url: "http://127.0.0.1:3001".to_string(),
                pgid: 42,
            },
        );
        let raw = serde_json::to_string(&state).unwrap();
        let back: PersistedState = serde_json::from_str(&raw).unwrap();
        assert_eq!(
            back.servers.get("/tmp/a").map(|d| d.url.as_str()),
            Some("http://127.0.0.1:3001")
        );
        assert_eq!(back.servers.get("/tmp/a").map(|d| d.pgid), Some(42));
    }

    #[test]
    fn estado_legacy_sin_url_queda_vacio() {
        // Formato viejo `{ path, pgid }`: no reutilizamos :3000, respawneamos.
        let legacy = r#"{"path":"/tmp/a","pgid":42}"#;
        let state: PersistedState = serde_json::from_str(legacy).unwrap();
        assert!(state.servers.is_empty());
    }

    #[test]
    fn extrae_url_de_linea_vite() {
        assert_eq!(
            extract_local_url("  ➜  Local:   http://localhost:3000/"),
            Some("http://localhost:3000".to_string())
        );
        assert_eq!(
            extract_local_url("Local: http://127.0.0.1:5173/ (_ready)"),
            Some("http://127.0.0.1:5173".to_string())
        );
        // URL de red → ignorada (TRD: solo localhost).
        assert_eq!(extract_local_url("Network: http://192.168.1.4:3000/"), None);
    }

    #[test]
    fn port_of_url() {
        assert_eq!(port_of("http://localhost:3000"), 3000);
        assert_eq!(port_of("http://localhost"), 0);
    }
}
