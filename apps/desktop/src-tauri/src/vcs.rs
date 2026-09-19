// vcs.rs — git del proyecto abierto (TRD §4): solo lectura de branches y
// switch. Spawn del CLI git, sin crate externo. Rust nunca conoce Intent.

use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VcsBranches {
    /// Branch actual; None si el directorio no es un repo git.
    pub current: Option<String>,
    pub branches: Vec<String>,
}

fn git(dir: &str, args: &[&str]) -> Result<String, String> {
    if dir.trim().is_empty() {
        return Err("empty directory".into());
    }
    if !Path::new(dir).exists() {
        return Err(format!("directory does not exist: {dir}"));
    }
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .map_err(|e| format!("git spawn failed: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.lines().next().unwrap_or("git failed").to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn vcs_branches(directory: String) -> Result<VcsBranches, String> {
    let current = match git(&directory, &["rev-parse", "--abbrev-ref", "HEAD"]) {
        Ok(head) => {
            let branch = head.trim().to_string();
            if branch.is_empty() {
                None
            } else {
                Some(branch)
            }
        }
        // No es un repo git (o git no está): el selector muestra "No branch".
        Err(_) => return Ok(VcsBranches { current: None, branches: vec![] }),
    };
    let branches = git(&directory, &["for-each-ref", "--format=%(refname:short)", "refs/heads"])
        .map(|out| {
            out.lines()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(VcsBranches { current, branches })
}

#[tauri::command]
pub async fn vcs_switch_branch(directory: String, branch: String) -> Result<(), String> {
    let branch_trim = branch.trim().to_string();
    if branch_trim.is_empty()
        || branch_trim.starts_with('-')
        || branch_trim.contains(|c: char| c.is_whitespace() || c == '\0')
    {
        return Err("invalid branch name".into());
    }
    git(
        &directory,
        &["switch", &branch_trim],
    )
    .map(|_| ())
}
