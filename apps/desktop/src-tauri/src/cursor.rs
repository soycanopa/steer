// cursor.rs — sidecar Node de @cursor/sdk (TRD §8.1). Spawn `node serve.mjs`.
// No conoce Intent; solo proceso + health HTTP.

use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use std::time::Instant;

use serde::Serialize;

use crate::process;

const PORTS: [u16; 4] = [4106, 4107, 4108, 4105];
const HOST: &str = "127.0.0.1";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorEnsureInfo {
    base_url: String,
    version: String,
    spawned: bool,
}

pub struct CursorState {
    child: Option<Child>,
    base_url: Option<String>,
}

pub type CursorHandle = Mutex<CursorState>;

pub fn new_handle() -> CursorHandle {
    Mutex::new(CursorState {
        child: None,
        base_url: None,
    })
}

fn serve_script() -> Result<PathBuf, String> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/agent-cursor/src/serve.mjs");
    if path.is_file() {
        return Ok(path);
    }
    Err(format!(
        "No encuentro el sidecar Cursor ({})",
        path.display()
    ))
}

#[tauri::command]
pub async fn cursor_ensure(
    state: tauri::State<'_, CursorHandle>,
) -> Result<CursorEnsureInfo, String> {
    {
        let known = state
            .lock()
            .expect("cursor state poisoned")
            .base_url
            .clone();
        if let Some(url) = known {
            if let Some(version) = fetch_health(&url).await {
                return Ok(CursorEnsureInfo {
                    base_url: url,
                    version,
                    spawned: false,
                });
            }
            let mut guard = state.lock().expect("cursor state poisoned");
            if let Some(mut child) = guard.child.take() {
                process::kill_tree(&mut child);
            }
            guard.base_url = None;
        }
    }

    for port in PORTS {
        let base_url = base_url_for(port);
        if let Some(version) = fetch_health(&base_url).await {
            let mut guard = state.lock().expect("cursor state poisoned");
            guard.base_url = Some(base_url.clone());
            return Ok(CursorEnsureInfo {
                base_url,
                version,
                spawned: false,
            });
        }
    }

    let script = serve_script()?;
    let cwd = script
        .parent()
        .and_then(|p| p.parent())
        .ok_or("ruta sidecar Cursor inválida")?;

    for port in PORTS {
        if process::port_open(port) {
            continue;
        }
        let base_url = base_url_for(port);
        let port_s = port.to_string();
        let args = [
            script.to_str().ok_or("ruta sidecar no UTF-8")?,
            "--port",
            &port_s,
        ];
        let mut child = process::spawn_in_dir(cwd, "node", &args)?;

        let deadline = Instant::now() + Duration::from_secs(20);
        let mut version: Option<String> = None;
        while Instant::now() < deadline {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return Err(
                    "El sidecar Cursor murió al arrancar. ¿Está Node 22+ en PATH y @cursor/sdk instalado?"
                        .to_string(),
                );
            }
            if let Some(ver) = fetch_health(&base_url).await {
                version = Some(ver);
                break;
            }
            thread::sleep(Duration::from_millis(200));
        }

        match version {
            Some(ver) => {
                let mut guard = state.lock().expect("cursor state poisoned");
                guard.child = Some(child);
                guard.base_url = Some(base_url.clone());
                return Ok(CursorEnsureInfo {
                    base_url,
                    version: ver,
                    spawned: true,
                });
            }
            None => {
                process::kill_tree(&mut child);
            }
        }
    }

    Err(
        "No pude arrancar el sidecar Cursor: puertos 4106–4108 ocupados."
            .to_string(),
    )
}

fn base_url_for(port: u16) -> String {
    format!("http://{HOST}:{port}")
}

async fn fetch_health(base_url: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .ok()?;
    let url = format!("{}/v1/health", base_url.trim_end_matches('/'));
    let res = client.get(&url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let body: serde_json::Value = res.json().await.ok()?;
    if body.get("ok") != Some(&serde_json::Value::Bool(true)) {
        return None;
    }
    body.get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| Some("cursor-sdk".to_string()))
}
