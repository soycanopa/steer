// host.rs — utilidades OS del shell (abrir URL en navegador, etc.).

#[tauri::command]
pub fn host_open_url(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Solo se permiten URLs http(s).".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        // -g: abre en el navegador sin robar foco — el preview en Steer sigue visible.
        std::process::Command::new("open")
            .arg("-g")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("No pude abrir el navegador: {e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("No pude abrir el navegador: {e}"))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = url;
        Err("Abrir en navegador no está disponible en esta plataforma.".to_string())
    }
}
