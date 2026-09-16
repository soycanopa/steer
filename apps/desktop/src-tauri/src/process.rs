// process.rs — spawn/kill genérico (ARCHITECTURE §8). Sin negocio:
// nada aquí sabe qué es un dev server ni un provider. Sepa matar un
// árbol de procesos y capturar líneas; el resto vive en devserver.rs.

use std::fs;
use std::io::BufRead;
use std::io::BufReader;
use std::net::SocketAddr;
use std::net::TcpStream;
use std::net::ToSocketAddrs;
use std::path::Path;
use std::process::Child;
use std::process::Command;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

/// Líneas capturadas de stdout/stderr de un proceso gestionado.
pub type SharedLines = Arc<Mutex<Vec<String>>>;

pub fn shared_lines() -> SharedLines {
    Arc::new(Mutex::new(Vec::new()))
}

/// Últimas `n` líneas, en orden original.
pub fn tail(lines: &SharedLines, n: usize) -> Vec<String> {
    let guard = lines.lock().expect("lines poisoned");
    let start = guard.len().saturating_sub(n);
    guard[start..].to_vec()
}

/// `localhost` → `127.0.0.1` para evitar fallos IPv6 en reqwest/hyper.
pub fn normalize_upstream_url(url: &str) -> String {
    url.trim_end_matches('/')
        .replace("http://localhost:", "http://127.0.0.1:")
        .replace("https://localhost:", "https://127.0.0.1:")
}

/// El preview proxy necesita HTTP real, no solo un puerto TCP abierto.
pub fn upstream_http_ready(url: &str) -> bool {
    crate::upstream_probe::ready_blocking(url)
}

/// Puerto TCP escuchando en loopback (reutilizado por devserver y opencode).
pub fn port_open(port: u16) -> bool {
    if port == 0 {
        return false;
    }
    ("127.0.0.1", port)
        .to_socket_addrs()
        .ok()
        .and_then(|mut addrs| addrs.next())
        .map(|addr: SocketAddr| {
            TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok()
        })
        .unwrap_or(false)
}

/// ¿El pid (líder del process group que Steer spawnó) sigue vivo?
pub fn pid_alive(pid: i32) -> bool {
    if pid <= 0 {
        return false;
    }
    #[cfg(unix)]
    {
        // SAFETY: señal 0 solo comprueba existencia; no mata.
        unsafe { libc::kill(pid, 0) == 0 }
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

/// cwd del proceso. En macOS via `lsof`; en Linux `/proc`.
pub fn pid_cwd(pid: i32) -> Option<std::path::PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("lsof")
            .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .find_map(|line| line.strip_prefix('n').map(std::path::PathBuf::from))
    }
    #[cfg(target_os = "linux")]
    {
        std::fs::read_link(format!("/proc/{pid}/cwd")).ok()
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = pid;
        None
    }
}

/// El proceso trabaja en `dir` (el proyecto), no en otro scaffold.
pub fn process_owns_dir(pid: i32, dir: &Path) -> bool {
    let Ok(want) = fs::canonicalize(dir) else {
        return false;
    };
    let Some(cwd) = pid_cwd(pid) else {
        return false;
    };
    let cwd = fs::canonicalize(&cwd).unwrap_or(cwd);
    cwd == want || cwd.starts_with(&want)
}

/// Ejecuta un comando capturando stdout/stderr en vivo.
pub fn run_and_wait_with_progress(
    dir: &std::path::Path,
    program: &str,
    args: &[&str],
    on_line: impl FnMut(&str) + Send + 'static,
) -> Result<(), String> {
    let on_line = Arc::new(Mutex::new(on_line));
    let mut child = Command::new(program)
        .args(args)
        .current_dir(dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| format!("No pude ejecutar {program}: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("Sin stdout de {program}"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("Sin stderr de {program}"))?;

    thread::spawn({
        let on_line = on_line.clone();
        move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                if line.trim().is_empty() {
                    continue;
                }
                on_line
                    .lock()
                    .expect("progress callback poisoned")(&line);
            }
        }
    });

    thread::spawn({
        let on_line = on_line.clone();
        move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if line.trim().is_empty() {
                    continue;
                }
                on_line
                    .lock()
                    .expect("progress callback poisoned")(&line);
            }
        }
    });

    let status = child
        .wait()
        .map_err(|e| format!("No pude esperar {program}: {e}"))?;

    if status.success() {
        return Ok(());
    }

    Err(format!(
        "El comando {program} falló (código {}).",
        status.code().unwrap_or(-1)
    ))
}

/// Ejecuta un comando y devuelve error con las últimas líneas de salida.
pub fn run_and_wait(dir: &std::path::Path, program: &str, args: &[&str]) -> Result<(), String> {
    let output = Command::new(program)
        .args(args)
        .current_dir(dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("No pude ejecutar {program}: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );
    let tail = combined
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");

    if tail.is_empty() {
        Err(format!(
            "El comando {program} falló (código {}).",
            output.status.code().unwrap_or(-1)
        ))
    } else {
        Err(format!("El comando {program} falló:\n{tail}"))
    }
}

/// Spawn en `dir` en su propio grupo de procesos (Unix) para poder
/// matar el árbol completo (pnpm → vite) y no dejar huérfanos.
pub fn spawn_in_dir(dir: &std::path::Path, program: &str, args: &[&str]) -> Result<Child, String> {
    #[cfg(unix)]
    use std::os::unix::process::CommandExt;

    let mut cmd = Command::new(program);
    cmd.args(args)
        .current_dir(dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    #[cfg(unix)]
    cmd.process_group(0);

    cmd.spawn().map_err(|e| format!("No pude ejecutar {program}: {e}"))
}

/// Captura las líneas de un stream hacia `sink` hasta que el proceso muera.
pub fn drain<R: std::io::Read + Send + 'static>(stream: R, sink: SharedLines) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let mut guard = sink.lock().expect("lines poisoned");
                    // Cap blando: guardamos lo último, no toda la historia.
                    if guard.len() > 500 {
                        guard.drain(0..250);
                    }
                    guard.push(text);
                }
                Err(_) => break,
            }
        }
    });
}

/// Mata un grupo de procesos por pgid (para dueños leídos del archivo de
/// estado, sin Child en mano).
pub fn kill_pgid(pgid: i32) {
    #[cfg(unix)]
    {
        // SAFETY: kill estándar sobre un pgid que nosotros creamos antes.
        unsafe {
            libc::kill(-pgid, libc::SIGTERM);
        }
        thread::sleep(Duration::from_millis(300));
        unsafe {
            libc::kill(-pgid, libc::SIGKILL);
        }
    }
}

/// Mata el grupo de procesos del child (SIGTERM, luego SIGKILL) y lo recoje.
/// Unix-only vía pgid; en otros targets cae a child.kill().
pub fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    {
        let negpid = -(child.id() as i32);
        // SIGTERM al grupo completo: pnpm y sus hijos (vite, node).
        // SAFETY: kill con señales estándar a un pgid que nosotros creamos.
        unsafe {
            libc::kill(negpid, libc::SIGTERM);
        }
        for _ in 0..20 {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        unsafe {
            libc::kill(negpid, libc::SIGKILL);
        }
    }
    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }
    let _ = child.wait();
}
