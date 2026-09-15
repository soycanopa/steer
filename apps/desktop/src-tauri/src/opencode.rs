// opencode.rs — ciclo de vida de `opencode serve` (TRD §4.2).
// Reutiliza un server healthy en 4096/4097/4098/4095; si ninguno responde,
// spawn en el primer puerto libre. No mata servers ajenos.

use std::process::Child;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use std::time::Instant;

use serde::Serialize;

use crate::process;

const PORTS: [u16; 4] = [4096, 4097, 4098, 4095];
const HOST: &str = "127.0.0.1";

/// Orígenes del webview Tauri (dev + prod) para --cors de opencode serve.
const CORS_ORIGINS: &[&str] = &[
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
    "https://tauri.localhost",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeEnsureInfo {
    base_url: String,
    version: String,
    spawned: bool,
}

pub struct OpencodeState {
    child: Option<Child>,
    base_url: Option<String>,
}

pub type OpencodeHandle = Mutex<OpencodeState>;

pub fn new_handle() -> OpencodeHandle {
    Mutex::new(OpencodeState {
        child: None,
        base_url: None,
    })
}

#[tauri::command]
pub async fn opencode_ensure(
    _directory: String,
    state: tauri::State<'_, OpencodeHandle>,
) -> Result<OpencodeEnsureInfo, String> {
    // 1. URL que Steer ya conoce (propia o descubierta antes).
    {
        let known = state
            .lock()
            .expect("opencode state poisoned")
            .base_url
            .clone();
        if let Some(url) = known {
            if let Some(version) = fetch_health(&url).await {
                return Ok(OpencodeEnsureInfo {
                    base_url: url,
                    version,
                    spawned: false,
                });
            }
            let mut guard = state.lock().expect("opencode state poisoned");
            if let Some(mut child) = guard.child.take() {
                process::kill_tree(&mut child);
            }
            guard.base_url = None;
        }
    }

    // 2. Cualquier instancia healthy en los puertos habituales.
    for port in PORTS {
        let base_url = base_url_for(port);
        if let Some(version) = fetch_health(&base_url).await {
            let mut guard = state.lock().expect("opencode state poisoned");
            guard.base_url = Some(base_url.clone());
            return Ok(OpencodeEnsureInfo {
                base_url,
                version,
                spawned: false,
            });
        }
    }

    // 3. Spawn en el primer puerto libre.
    for port in PORTS {
        if process::port_open(port) {
            continue;
        }
        let base_url = base_url_for(port);
        let mut args: Vec<String> = vec![
            "serve".into(),
            "--port".into(),
            port.to_string(),
            "--hostname".into(),
            HOST.into(),
        ];
        for origin in CORS_ORIGINS {
            args.push("--cors".into());
            args.push((*origin).into());
        }

        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let mut child = process::spawn_in_dir(std::path::Path::new("."), "opencode", &arg_refs)?;

        let deadline = Instant::now() + Duration::from_secs(30);
        let mut version: Option<String> = None;
        while Instant::now() < deadline {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return Err(format!(
                    "opencode serve murió al arrancar en el puerto {port}. ¿Está instalado el CLI?"
                ));
            }
            if let Some(ver) = fetch_health(&base_url).await {
                version = Some(ver);
                break;
            }
            thread::sleep(Duration::from_millis(400));
        }

        match version {
            Some(ver) => {
                let mut guard = state.lock().expect("opencode state poisoned");
                guard.child = Some(child);
                guard.base_url = Some(base_url.clone());
                return Ok(OpencodeEnsureInfo {
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
        "No pude arrancar OpenCode: los puertos 4096–4098 están ocupados por otras apps. \
         Libera uno o arranca manualmente: opencode serve --port 4097"
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
    let url = format!("{}/global/health", base_url.trim_end_matches('/'));
    let res = client.get(&url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let body: serde_json::Value = res.json().await.ok()?;
    if body.get("healthy") != Some(&serde_json::Value::Bool(true)) {
        return None;
    }
    body.get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}
