// opencode.rs — ciclo de vida del server OpenCode v2 (TRD §4.2).
// v2: rutas /api/*, GET /api/info como health, y Basic auth con password
// impreso a stdout ("server password …") o registrado en service.json
// (modo --service). Reutiliza: 1) URL conocida, 2) service.json del
// service compartido, 3) servers en 4096/4097/4098/4095; si ninguno
// responde, spawn propio. No mata servers ajenos.

use std::fs;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use std::time::Instant;

use serde::Deserialize;
use serde::Serialize;

use crate::process::{self, SharedLines};

const PORTS: [u16; 4] = [4096, 4097, 4098, 4095];
const HOST: &str = "127.0.0.1";
const AUTH_USER: &str = "opencode";

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
    /// Password del server v2 para Basic auth (None si no pide auth).
    password: Option<String>,
}

pub struct OpencodeState {
    child: Option<Child>,
    base_url: Option<String>,
    password: Option<String>,
    /// stdout/stderr del server propio: ahí v2 imprime el password.
    lines: SharedLines,
}

pub type OpencodeHandle = Mutex<OpencodeState>;

pub fn new_handle() -> OpencodeHandle {
    Mutex::new(OpencodeState {
        child: None,
        base_url: None,
        password: None,
        lines: process::shared_lines(),
    })
}

#[derive(Deserialize)]
struct ServiceRegistration {
    url: String,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    version: Option<String>,
}

/// service.json del modo --service (mismo lugar que lee @opencode/client).
fn registration_path() -> Option<PathBuf> {
    let state = std::env::var("XDG_STATE_HOME")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("HOME").ok().map(|h| format!("{h}/.local/state")))?;
    if state.is_empty() {
        return None;
    }
    Some(PathBuf::from(state).join("opencode").join("service.json"))
}

fn read_registration() -> Option<ServiceRegistration> {
    let path = registration_path()?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// GET /api/info con Basic auth opcional. Ok = server vivo y autenticado.
async fn probe(base_url: &str, password: Option<&str>) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .ok()?;
    let mut req = client.get(format!(
        "{}/api/info",
        base_url.trim_end_matches('/')
    ));
    if let Some(pw) = password {
        if !pw.is_empty() {
            req = req.header("authorization", format!("Basic {}", basic_auth(AUTH_USER, pw)));
        }
    }
    let res = req.send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let body: serde_json::Value = res.json().await.ok()?;
    // /api/info responde PLANO: {"version", "pid", "urls", "paths"} — sin la
    // envoltura { data } que usan /api/model y /api/session.
    body.get("version")
        .or_else(|| body.get("data").and_then(|d| d.get("version")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn password_from_lines(lines: &SharedLines) -> Option<String> {
    let guard = lines.lock().expect("lines poisoned");
    for line in guard.iter() {
        if let Some(rest) = line.strip_prefix("server password ") {
            let pw = rest.trim();
            if !pw.is_empty() {
                return Some(pw.to_string());
            }
        }
    }
    None
}

/// Base64 estándar (alphabet + padding) para el header Authorization.
/// Sin crate: solo se usa para este token corto.
fn basic_auth(user: &str, password: &str) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let input = format!("{user}:{password}");
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.as_bytes().chunks(3) {
        let b = [
            chunk[0],
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
        ];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Referencia RFC 4648 independiente del encoder bajo test.
    fn std_base64(input: &[u8]) -> String {
        const T: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::new();
        for chunk in input.chunks(3) {
            let b = [
                chunk[0],
                *chunk.get(1).unwrap_or(&0),
                *chunk.get(2).unwrap_or(&0),
            ];
            let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | (b[2] as u32);
            out.push(T[(n >> 18) as usize & 63] as char);
            out.push(T[(n >> 12) as usize & 63] as char);
            out.push(if chunk.len() > 1 {
                T[(n >> 6) as usize & 63] as char
            } else {
                '='
            });
            out.push(if chunk.len() > 2 {
                T[n as usize & 63] as char
            } else {
                '='
            });
        }
        out
    }

    #[test]
    fn basic_auth_matches_standard_base64() {
        for (user, pw) in [
            ("opencode", "test"),
            ("opencode", "7JZMXVnmvCSI-7TUd7bW9mUuBBi-8tVQMLe7vom3vRw"),
            ("a", "b"),
            ("", ""),
        ] {
            let input = format!("{user}:{pw}");
            assert_eq!(
                basic_auth(user, pw),
                std_base64(input.as_bytes()),
                "input: {input}"
            );
        }
    }
}

#[tauri::command]
pub async fn opencode_ensure(
    _directory: String,
    state: tauri::State<'_, OpencodeHandle>,
) -> Result<OpencodeEnsureInfo, String> {
    // 1. Service compartido v2 del CLI (`opencode serve --service`): es el
    // que tiene los providers conectados por el usuario (/connect) y sus
    // sesiones. Se re-lee en cada ensure: si aparece después del arranque
    // de Steer, el próximo ensure lo adopta.
    match read_registration() {
        Some(reg) => {
            let ok = probe(&reg.url, reg.password.as_deref()).await;
            println!("[opencode-ensure] step1 service.json url={} pw={} -> {:?}", reg.url, reg.password.is_some(), ok.is_some());
            if let Some(version) = ok {
            let mut guard = state.lock().expect("opencode state poisoned");
            guard.base_url = Some(reg.url.clone());
            guard.password = reg.password.clone();
            return Ok(OpencodeEnsureInfo {
                base_url: reg.url,
                version,
                spawned: false,
                password: reg.password,
            });
            }
            return Err("[opencode-ensure] step1 fallo: service.json presente pero probe 401".into());
        }
        None => {
            println!("[opencode-ensure] step1: sin service.json");
        }
    }

    // 2. Server que Steer ya conoce (propio o descubierto antes).
    {
        let known = {
            let guard = state.lock().expect("opencode state poisoned");
            guard
                .base_url
                .clone()
                .map(|url| (url, guard.password.clone()))
        };
        if let Some((url, password)) = known {
            if let Some(version) = probe(&url, password.as_deref()).await {
                return Ok(OpencodeEnsureInfo {
                    base_url: url,
                    version,
                    spawned: false,
                    password,
                });
            }
            let mut guard = state.lock().expect("opencode state poisoned");
            if let Some(mut child) = guard.child.take() {
                process::kill_tree(&mut child);
            }
            guard.base_url = None;
            guard.password = None;
        }
    }

    // 3. Cualquier instancia v2 viva en los puertos habituales (sin password
    // conocido solo entra si el server acepta requests sin auth).
    for port in PORTS {
        let base_url = base_url_for(port);
        if let Some(version) = probe(&base_url, None).await {
            let mut guard = state.lock().expect("opencode state poisoned");
            guard.base_url = Some(base_url.clone());
            guard.password = None;
            return Ok(OpencodeEnsureInfo {
                base_url,
                version,
                spawned: false,
                password: None,
            });
        }
    }

    // 4. Spawn en el primer puerto libre, con CORS para el webview.
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

        let lines = {
            let guard = state.lock().expect("opencode state poisoned");
            guard.lines.clone()
        };
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let mut child = spawn_opencode(&arg_refs)?;

        process::drain(child.stdout.take().expect("stdout piped"), lines.clone());
        process::drain(child.stderr.take().expect("stderr piped"), lines.clone());

        let deadline = Instant::now() + Duration::from_secs(30);
        let mut ready: Option<(String, Option<String>)> = None;
        while Instant::now() < deadline {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return Err(format!(
                    "opencode serve died while starting on port {port}. Is the CLI installed?"
                ));
            }
            let pw = password_from_lines(&lines);
            if let Some(version) = probe(&base_url, None).await {
                ready = Some((version, None));
                break;
            }
            if let Some(pw) = pw.as_deref() {
                if let Some(version) = probe(&base_url, Some(pw)).await {
                    ready = Some((version, Some(pw.to_string())));
                    break;
                }
            }
            thread::sleep(Duration::from_millis(400));
        }

        match ready {
            Some((version, password)) => {
                let mut guard = state.lock().expect("opencode state poisoned");
                guard.child = Some(child);
                guard.base_url = Some(base_url.clone());
                guard.password = password.clone();
                return Ok(OpencodeEnsureInfo {
                    base_url,
                    version,
                    spawned: true,
                    password,
                });
            }
            None => {
                process::kill_tree(&mut child);
            }
        }
    }

    Err(
        "Could not start OpenCode: ports 4096–4098 are taken by other apps. \
         Free one or start it manually: opencode serve --port 4097"
            .to_string(),
    )
}

/// Spawn del CLI: primero `opencode` en PATH; fallback al install path
/// estándar del instalador curl (~/.opencode/bin/opencode).
fn spawn_opencode(args: &[&str]) -> Result<Child, String> {
    match process::spawn_in_dir(std::path::Path::new("."), "opencode", args) {
        Ok(child) => Ok(child),
        Err(first) => {
            let home = std::env::var("HOME").unwrap_or_default();
            if home.is_empty() {
                return Err(first);
            }
            let fallback = format!("{home}/.opencode/bin/opencode");
            if !std::path::Path::new(&fallback).exists() {
                return Err(first);
            }
            process::spawn_in_dir(std::path::Path::new("."), &fallback, args)
        }
    }
}

fn base_url_for(port: u16) -> String {
    format!("http://{HOST}:{port}")
}

#[cfg(test)]
mod probe_tests {
    use super::*;

    #[tokio::test]
    async fn registration_file_probes_ok() {
        let reg = read_registration().expect("service.json debe existir y parsear");
        let version = probe(&reg.url, reg.password.as_deref())
            .await
            .expect("probe con password del registration debe ser 200");
        assert!(!version.is_empty());
    }

    #[tokio::test]
    async fn probe_rejects_bad_password() {
        let reg = read_registration().expect("service.json");
        assert!(probe(&reg.url, Some("wrong-password")).await.is_none());
    }
}
