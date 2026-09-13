// project.rs — host delgado (ARCHITECTURE §8). Lee package.json, detecta
// package manager y heurística Start. Prohibido aquí: struct Intent,
// lógica de cola, CSS, prompts. Solo fs acotado.

use std::fs;
use std::path::Path;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMeta {
    root: String,
    name: String,
    package_manager: &'static str,
    has_devtools_vite: bool,
    framework_guess: &'static str,
}

#[tauri::command]
pub fn project_open(path: String) -> Result<ProjectMeta, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("La carpeta no existe: {path}"));
    }

    let pkg = read_package_json(root)?;
    let name = pkg
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| file_name(root));
    let package_manager = detect_package_manager(root);
    let framework_guess = guess_framework(root, &pkg);

    Ok(ProjectMeta {
        root: path,
        name,
        package_manager,
        has_devtools_vite: has_dep(&pkg, "@tanstack/devtools-vite"),
        framework_guess,
    })
}

#[tauri::command]
pub fn project_read_package(path: String) -> Result<serde_json::Value, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("La carpeta no existe: {path}"));
    }
    read_package_json(root)
}

pub(crate) fn read_package_json(root: &Path) -> Result<serde_json::Value, String> {
    let raw = fs::read_to_string(root.join("package.json"))
        .map_err(|_| format!("No hay package.json en {root:?} — eso no parece un proyecto Node."))?;
    serde_json::from_str(&raw).map_err(|e| format!("package.json inválido: {e}"))
}

fn file_name(root: &Path) -> String {
    root.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string()
}

/// TRD §4.1: pnpm-lock.yaml > package-lock.json > yarn.lock > bun.
pub(crate) fn detect_package_manager(root: &Path) -> &'static str {
    if root.join("pnpm-lock.yaml").is_file() {
        "pnpm"
    } else if root.join("package-lock.json").is_file() {
        "npm"
    } else if root.join("yarn.lock").is_file() {
        "yarn"
    } else if root.join("bun.lockb").is_file() || root.join("bun.lock").is_file() {
        "bun"
    } else {
        "npm"
    }
}

fn has_dep(pkg: &serde_json::Value, name: &str) -> bool {
    ["dependencies", "devDependencies"]
        .iter()
        .any(|section| pkg.get(section).and_then(|d| d.get(name)).is_some())
}

/// TRD §9: dep `@tanstack/react-start` o `@tanstack/start-client`,
/// o `vite.config.*` + `src/routes`.
fn guess_framework(root: &Path, pkg: &serde_json::Value) -> &'static str {
    let has_start_dep =
        has_dep(pkg, "@tanstack/react-start") || has_dep(pkg, "@tanstack/start-client");
    let has_routes = root.join("src/routes").is_dir();
    let has_vite_config = ["ts", "js", "mts", "mjs"]
        .iter()
        .any(|ext| root.join(format!("vite.config.{ext}")).is_file());

    if has_start_dep || (has_routes && has_vite_config) {
        "tanstack-start"
    } else {
        "unknown"
    }
}
