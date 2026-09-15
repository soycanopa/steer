// devserver.rs — ciclo de vida del dev server del proyecto (TRD §4.1).
// Reutilizar si ya responde; si no, spawn de `pm run dev`, extraer la URL
// del stdout (o convención :3000) y health-check hasta 30s. Steer solo
// mata los procesos que ella misma arrancó.

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Child;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use std::time::Instant;

use serde::Serialize;

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

// ---- Estado persistente del server (sobrevive al cierre de la app para
// que reabrir un proyecto sea instantáneo; TRD §4.1.4 de reutilización).

fn state_file() -> std::path::PathBuf {
    std::env::temp_dir().join("steer-devserver.json")
}

fn read_state() -> Option<(String, i32)> {
    let raw = fs::read_to_string(state_file()).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let path = v.get("path")?.as_str()?.to_string();
    let pgid = v.get("pgid")?.as_i64()? as i32;
    Some((path, pgid))
}

fn write_state(path: &str, pgid: i32) {
    let json = serde_json::json!({ "path": path, "pgid": pgid });
    let _ = fs::write(state_file(), json.to_string());
}

fn clear_state() {
    let _ = fs::remove_file(state_file());
}

#[tauri::command]
pub fn project_dev_start(
    path: String,
    state: tauri::State<'_, DevServerMap>,
) -> Result<DevStartInfo, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("La carpeta no existe: {path}"));
    }

    let mut map = state.lock().expect("devserver map poisoned");

    // 1. Ya lo arrancamos y sigue vivo (HTTP, no solo TCP).
    if let Some(dev) = map.get(&path) {
        if let Some(url) = process::resolve_upstream_url(&dev.url) {
            return Ok(DevStartInfo {
                url,
                spawned: false,
            });
        }
        // Proceso muerto pero entrada en mapa: limpiar y reintentar spawn.
        map.remove(&path);
        clear_state();
    }

    // 2. Dueño persistente (sesiones anteriores): si el server vivo en la
    //    convención :3000 es del MISMO proyecto, reutilizar → reopen
    //    instantáneo. Si es de OTRO proyecto, matarlo antes de arrancar.
    match read_state() {
        Some((state_path, pgid)) => {
            if state_path == path {
                if let Some(url) = probe_convention_port() {
                    return Ok(DevStartInfo { url, spawned: false });
                }
                clear_state(); // server ya muerto
            } else if probe_convention_port().is_some() {
                process::kill_pgid(pgid);
                clear_state();
            }
        }
        None => {
            // Sin estado propio: dev server ajeno en :3000 → TRD §4.1.4 reutilizar.
            if let Some(url) = probe_convention_port() {
                return Ok(DevStartInfo { url, spawned: false });
            }
        }
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

    // 5. Esperar URL del stdout o convención :3000, con health-check (30s).
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut url: Option<String> = None;
    drop(map); // no sostener el lock durante el wait

    while Instant::now() < deadline {
        // El proceso murió antes de servir: reportar cola de logs.
        if let Ok(Some(status)) = child.try_wait() {
            let tail = process::tail(&logs, 8).join("\n");
            return Err(format!(
                "El dev server murió al arrancar ({status}). Últimas líneas:\n{tail}"
            ));
        }
        if let Some(found) = url_from_logs(&logs).or_else(probe_convention_port) {
            if let Some(ready) = process::resolve_upstream_url(&found) {
                url = Some(ready);
                break;
            }
        }
        thread::sleep(Duration::from_millis(400));
    }

    match url {
        Some(url) => {
            let pgid = child.id() as i32;
            state
                .lock()
                .expect("devserver map poisoned")
                .insert(path.clone(), ManagedDev { child, url: url.clone() });
            write_state(&path, pgid);
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
    if let Ok(mut map) = state.lock() {
        if let Some(mut dev) = map.remove(&path) {
            process::kill_tree(&mut dev.child);
            clear_state();
        }
    }
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

fn probe_convention_port() -> Option<String> {
    // Convención del prototipo: TanStack Start dev en :3000.
    process::resolve_upstream_url("http://localhost:3000")
}

#[cfg(test)]
mod tests {
    use super::*;

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
