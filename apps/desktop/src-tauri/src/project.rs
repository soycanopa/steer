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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRoute {
    path: String,
    label: String,
    file: String,
}

#[tauri::command]
pub fn project_list_routes(path: String) -> Result<Vec<ProjectRoute>, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("La carpeta no existe: {path}"));
    }
    Ok(collect_routes(root))
}

fn collect_routes(root: &Path) -> Vec<ProjectRoute> {
    let routes_dir = root.join("src/routes");
    if !routes_dir.is_dir() {
        return Vec::new();
    }
    let mut routes = Vec::new();
    walk_routes_dir(&routes_dir, root, &routes_dir, &[], &mut routes);
    routes.sort_by(|a, b| a.path.cmp(&b.path));
    routes.dedup_by(|a, b| a.path == b.path);
    routes
}

fn walk_routes_dir(
    dir: &Path,
    project_root: &Path,
    routes_root: &Path,
    url_segments: &[String],
    out: &mut Vec<ProjectRoute>,
) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with('.') {
            continue;
        }

        let path = entry.path();
        if path.is_dir() {
            if is_route_group(&name_str) {
                walk_routes_dir(&path, project_root, routes_root, url_segments, out);
            } else if name_str.starts_with('_') {
                // Layout sin segmento de URL (TanStack pathless).
                walk_routes_dir(&path, project_root, routes_root, url_segments, out);
            } else {
                let mut next = url_segments.to_vec();
                next.push(name_str.to_string());
                walk_routes_dir(&path, project_root, routes_root, &next, out);
            }
            continue;
        }

        if !is_route_file(&name_str) {
            continue;
        }

        let stem = route_stem(&name_str);
        let mut parts = url_segments.to_vec();
        if stem != "index" {
            parts.push(stem);
        }
        let route_path = if parts.is_empty() {
            "/".to_string()
        } else {
            format!("/{}", parts.join("/"))
        };
        let file = path
            .strip_prefix(project_root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| path.to_string_lossy().to_string());
        let label = route_label(&route_path);
        out.push(ProjectRoute {
            path: route_path,
            label,
            file,
        });
    }
}

fn is_route_group(name: &str) -> bool {
    name.starts_with('(') && name.ends_with(')')
}

fn is_route_file(name: &str) -> bool {
    if name.starts_with("__") || name.starts_with('-') {
        return false;
    }
    ["tsx", "ts", "jsx", "js"].iter().any(|ext| {
        name.ends_with(&format!(".{ext}"))
            && !name.contains(".test.")
            && !name.contains(".spec.")
    })
}

fn route_stem(name: &str) -> String {
    name.rsplit_once('.')
        .map(|(stem, _)| stem.to_string())
        .unwrap_or_else(|| name.to_string())
}

fn route_label(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() || trimmed == "/" {
        return "home".to_string();
    }
    trimmed
        .split('/')
        .filter(|s| !s.is_empty())
        .next_back()
        .unwrap_or("home")
        .to_string()
}

#[tauri::command]
pub fn project_reveal_in_finder(path: String) -> Result<(), String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("La carpeta no existe: {path}"));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("No pude abrir Finder: {e}"))?;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Abrir en Finder solo está disponible en macOS.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn route_label_home_y_segmento() {
        assert_eq!(route_label("/"), "home");
        assert_eq!(route_label("/about"), "about");
        assert_eq!(route_label("/posts/$postId"), "$postId");
    }

    #[test]
    fn collect_routes_desde_fixture_temporal() {
        let tmp = std::env::temp_dir().join(format!("steer-routes-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("src/routes/posts")).unwrap();
        fs::write(tmp.join("src/routes/index.tsx"), "// index").unwrap();
        fs::write(tmp.join("src/routes/about.tsx"), "// about").unwrap();
        fs::write(tmp.join("src/routes/posts/index.tsx"), "// posts").unwrap();
        fs::write(tmp.join("src/routes/posts/$postId.tsx"), "// post").unwrap();

        let routes = collect_routes(&tmp);
        let paths: Vec<&str> = routes.iter().map(|r| r.path.as_str()).collect();
        assert!(paths.contains(&"/"));
        assert!(paths.contains(&"/about"));
        assert!(paths.contains(&"/posts"));
        assert!(paths.contains(&"/posts/$postId"));

        let _ = fs::remove_dir_all(&tmp);
    }
}
