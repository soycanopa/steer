// snapshot.rs — captura nativa del preview para el thumbnail del home.
// Usa `WKWebView.takeSnapshot` para obtener píxeles reales (WebGL, gradientes,
// filtros), en vez del painter de canvas que no reproduce la web. Solo macOS;
// en otros targets el comando falla y el renderer cae al bridge.

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    pub data_url: String,
}

#[tauri::command]
pub async fn window_snapshot(
    webview: tauri::Webview,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<SnapshotInfo, String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<SnapshotInfo, String>>();
        if let Err(e) = webview.with_webview(move |platform| {
            // No bloqueante: arranca el snapshot y el completion handler
            // (que corre en el main thread) manda el resultado por `tx`.
            macos::start_capture(platform.inner(), x, y, width, height, tx);
        }) {
            eprintln!("steer:window_snapshot with_webview falló: {e}");
            return Err(e.to_string());
        }
        return match rx.await {
            Ok(result) => result,
            Err(e) => {
                eprintln!("steer:window_snapshot sin respuesta: {e}");
                Err(e.to_string())
            }
        };
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (webview, x, y, width, height);
        Err("Snapshot nativo no soportado en este sistema".to_string())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::c_void;
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSBitmapImageRepPropertyKey, NSImage,
    };
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_foundation::{NSDictionary, NSError, NSString};
    use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};

    use super::SnapshotInfo;

    /// Arranca el snapshot (no bloquea). El resultado llega por `tx` desde el
    /// completion handler. DEBE llamarse desde el main thread.
    pub fn start_capture(
        wk_ptr: *mut c_void,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        tx: tokio::sync::oneshot::Sender<Result<SnapshotInfo, String>>,
    ) {
        let Some(mtm) = MainThreadMarker::new() else {
            eprintln!("steer:snapshot no es main thread");
            let _ = tx.send(Err("no es el main thread".to_string()));
            return;
        };
        unsafe {
            let wk: &WKWebView = &*wk_ptr.cast();
            let config = WKSnapshotConfiguration::new(mtm);
            config.setRect(CGRect {
                origin: CGPoint { x, y },
                size: CGSize { width, height },
            });
            let tx = std::sync::Mutex::new(Some(tx));
            let block = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                let out = if !error.is_null() {
                    let desc: Retained<NSString> = (*error).localizedDescription();
                    Err(desc.to_string())
                } else if image.is_null() {
                    Err("sin imagen".to_string())
                } else {
                    png_bytes(&*image).map(|bytes| SnapshotInfo {
                        data_url: format!(
                            "data:image/png;base64,{}",
                            base64_encode(&bytes)
                        ),
                    })
                };
                if let Err(ref e) = out {
                    eprintln!("steer:snapshot: {e}");
                }
                if let Ok(mut guard) = tx.lock() {
                    if let Some(sender) = guard.take() {
                        let _ = sender.send(out);
                    }
                }
            });
            wk.takeSnapshotWithConfiguration_completionHandler(Some(&config), &block);
        }
    }

    unsafe fn png_bytes(image: &NSImage) -> Result<Vec<u8>, String> {
        let tiff = image.TIFFRepresentation().ok_or("sin TIFF")?;
        let rep = NSBitmapImageRep::imageRepWithData(&tiff).ok_or("sin bitmap")?;
        let props: Retained<NSDictionary<NSBitmapImageRepPropertyKey, AnyObject>> =
            NSDictionary::new();
        let png = rep
            .representationUsingType_properties(NSBitmapImageFileType::PNG, &props)
            .ok_or("sin PNG")?;
        let len = png.length();
        let mut buf = vec![0u8; len];
        if len > 0 {
            png.getBytes_length(
                NonNull::new(buf.as_mut_ptr() as *mut c_void).expect("buffer no nulo"),
                len,
            );
        }
        Ok(buf)
    }

    fn base64_encode(input: &[u8]) -> String {
        const TABLE: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
        for chunk in input.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = *chunk.get(1).unwrap_or(&0) as u32;
            let b2 = *chunk.get(2).unwrap_or(&0) as u32;
            let n = (b0 << 16) | (b1 << 8) | b2;
            out.push(TABLE[((n >> 18) & 63) as usize] as char);
            out.push(TABLE[((n >> 12) & 63) as usize] as char);
            out.push(if chunk.len() > 1 {
                TABLE[((n >> 6) & 63) as usize] as char
            } else {
                '='
            });
            out.push(if chunk.len() > 2 {
                TABLE[(n & 63) as usize] as char
            } else {
                '='
            });
        }
        out
    }
}
