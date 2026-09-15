// proxy.rs — reverse proxy del preview (TRD §6, decisión P0).
// El iframe no carga el dev server directo: carga este proxy, que
// reenvía HTTP y WS hacia el upstream y **inyecta `<script
// src="/__steer/bridge.js">` antes de `</body>`** en documentos HTML.
// bridge.js vive en packages/preview-bridge; Rust solo lo sirve.

use std::net::TcpListener;
use std::sync::Arc;
use std::time::Duration;
use std::time::Instant;

use axum::body::Body;
use axum::extract::{DefaultBodyLimit, FromRequestParts, Request, State, WebSocketUpgrade};
use axum::http::header::CONTENT_TYPE;
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{Sink, SinkExt, Stream, StreamExt};
use tokio::sync::{oneshot, Mutex};

use crate::process;

/// bridge.js embebido en el binario: se sirve igual en dev que empaquetado.
const BRIDGE_JS: &str = include_str!("../../../../packages/preview-bridge/src/bridge.js");

#[derive(Clone)]
struct ProxyState {
    upstream: String,
}

pub struct ProxyRuntime {
    shutdown: oneshot::Sender<()>,
}

/// Un solo preview en P0 (TRD §16): `None` = apagado.
pub type ProxyHandle = Mutex<Option<ProxyRuntime>>;

pub fn new_handle() -> ProxyHandle {
    Mutex::new(None)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStartInfo {
    proxy_url: String,
}

#[tauri::command]
pub async fn proxy_start(
    upstream_url: String,
    state: tauri::State<'_, ProxyHandle>,
) -> Result<ProxyStartInfo, String> {
    // Un solo preview: apagar el anterior si lo hubiera.
    stop_current(&state).await;

    // No devolver proxy_url hasta que el upstream sirva HTTP (evita
    // "Upstream inalcanzable" en el iframe por race al reabrir).
    let deadline = Instant::now() + Duration::from_secs(30);
    let upstream = loop {
        if let Some(url) = process::resolve_upstream_url(&upstream_url) {
            break url;
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "El dev server en {upstream_url} no responde HTTP. ¿Está corriendo `pnpm dev`?"
            ));
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    };

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("No pude abrir puerto local para el proxy: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("No pude poner el listener en nonblocking: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Puerto local del proxy ilegible: {e}"))?
        .port();

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let app = router(Arc::new(ProxyState { upstream }));

    let server = axum::serve(
        tokio::net::TcpListener::from_std(listener)
            .map_err(|e| format!("No pude migrar el listener a tokio: {e}"))?,
        app,
    )
    .with_graceful_shutdown(async {
        let _ = shutdown_rx.await;
    });

    tauri::async_runtime::spawn(async move {
        let _ = server.await;
    });

    let proxy_url = format!("http://127.0.0.1:{port}");
    *state.lock().await = Some(ProxyRuntime {
        shutdown: shutdown_tx,
    });

    Ok(ProxyStartInfo { proxy_url })
}

#[tauri::command]
pub async fn proxy_stop(state: tauri::State<'_, ProxyHandle>) -> Result<(), String> {
    stop_current(&state).await;
    Ok(())
}

async fn stop_current(state: &ProxyHandle) {
    if let Some(runtime) = state.lock().await.take() {
        let _ = runtime.shutdown.send(());
    }
}

/// Llamar en RunEvent::Exit.
pub async fn stop_all(state: &ProxyHandle) {
    stop_current(state).await;
}

fn router(state: Arc<ProxyState>) -> Router {
    Router::new()
        .route(
            "/__steer/bridge.js",
            get(|| async {
                (
                    [(CONTENT_TYPE, "application/javascript")],
                    [("cache-control", "no-store")],
                    BRIDGE_JS,
                )
            }),
        )
        .fallback(proxy_fallback)
        .layer(DefaultBodyLimit::max(64 * 1024 * 1024))
        .with_state(state)
}

async fn proxy_fallback(
    State(state): State<Arc<ProxyState>>,
    request: Request,
) -> Result<Response, String> {
    let (mut parts, body) = request.into_parts();

    // WebSocket (HMR de Vite): upgrade → pump bidireccional al upstream.
    let wants_ws = parts
        .headers
        .get(axum::http::header::CONNECTION)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_ascii_lowercase().contains("upgrade"))
        .unwrap_or(false)
        && parts
            .headers
            .get(axum::http::header::UPGRADE)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.eq_ignore_ascii_case("websocket"))
            .unwrap_or(false);

    if wants_ws {
        let upgrade = <WebSocketUpgrade as FromRequestParts<()>>::from_request_parts(
            &mut parts,
            &(),
        )
        .await
        .map_err(|e| format!("Handshake WS inválido: {e}"))?;

        let target = format!("{}{}", state.upstream, parts.uri);
        return Ok(upgrade
            .on_upgrade(move |socket| pump_websocket(socket, target))
            .into_response());
    }

    forward_http(state, Request::from_parts(parts, body)).await
}

async fn upstream_http_ready(url: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    client
        .get(url)
        .send()
        .await
        .map(|res| res.status().is_success() || res.status().is_redirection())
        .unwrap_or(false)
}

async fn forward_http(state: Arc<ProxyState>, request: Request) -> Result<Response, String> {
    let (parts, body) = request.into_parts();

    let url = format!("{}{}", state.upstream, parts.uri);
    let method = reqwest::Method::from_bytes(parts.method.as_str().as_bytes())
        .map_err(|_| "Método HTTP inválido".to_string())?;

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("No pude crear cliente HTTP: {e}"))?;

    let mut upstream_req = client.request(method, &url);

    // Identity: sin compresión del upstream, así la inyección de HTML
    // opera sobre texto plano.
    upstream_req = upstream_req.header("accept-encoding", "identity");

    for (name, value) in &parts.headers {
        if is_hop_by_hop(name) || name == axum::http::header::HOST {
            continue;
        }
        if let Ok(v) = value.to_str() {
            upstream_req = upstream_req.header(name.as_str(), v);
        }
    }

    let body_bytes = axum::body::to_bytes(body, 64 * 1024 * 1024)
        .await
        .map_err(|e| format!("Cuerpo de request ilegible: {e}"))?;
    if !body_bytes.is_empty() {
        upstream_req = upstream_req.body(body_bytes.to_vec());
    }

    let upstream_res = upstream_req
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Upstream inalcanzable: {e}"))?;

    let status = StatusCode::from_u16(upstream_res.status().as_u16())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    let mut out_headers = HeaderMap::new();
    for (name, value) in upstream_res.headers() {
        if is_hop_by_hop(name)
            || name == axum::http::header::CONTENT_LENGTH
            || name == axum::http::header::CONTENT_TYPE
        {
            continue;
        }
        if let (Ok(n), Ok(v)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            out_headers.insert(n, v);
        }
    }

    let content_type = upstream_res
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body_bytes = upstream_res
        .bytes()
        .await
        .map_err(|e| format!("Cuerpo de respuesta ilegible: {e}"))?;

    let is_html = content_type.contains("text/html");

    let mut builder = Response::builder().status(status);
    if is_html {
        builder = builder.header(CONTENT_TYPE, "text/html; charset=utf-8");
    } else if let Ok(v) = HeaderValue::from_str(&content_type) {
        builder = builder.header(CONTENT_TYPE, v);
    }
    {
        let headers = builder.headers_mut().expect("response builder");
        headers.extend(out_headers);
    }

    if is_html {
        let html = String::from_utf8_lossy(&body_bytes);
        let injected = inject_bridge(&html);
        builder
            .body(Body::from(injected))
            .map_err(|e| e.to_string())
    } else {
        builder.body(Body::from(body_bytes)).map_err(|e| e.to_string())
    }
}

/// Inserta `<script src="/__steer/bridge.js">` antes de `</body>`
/// (case-insensitive). Sin `</body>`, se anexa al final.
/// Inserta `<script src="/__steer/bridge.js?v=<ts>">` antes de `</body>`
/// (case-insensitive). Sin `</body>`, se anexa al final. El `?v=` cambia
/// por respuesta para que ningún cache del webview sirva un bridge viejo.
fn inject_bridge(html: &str) -> String {
    const TAG_OPEN: &str = r#"<script src="/__steer/bridge.js?v="#;
    const TAG_END: &str = r#""></script>"#;
    let version = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let tag = format!("{TAG_OPEN}{version}{TAG_END}");
    match html.to_ascii_lowercase().rfind("</body") {
        Some(i) => format!("{}{}{}", &html[..i], tag, &html[i..]),
        None => format!("{html}{tag}"),
    }
}

fn is_hop_by_hop(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

/// WS bidireccional cliente↔upstream: HMR de Vite a través del proxy
/// (bloqueador típico de la Fase C; ver IMPLEMENTATION §3-C).
async fn pump_websocket<S>(client: S, target: String)
where
    S: Stream<Item = Result<axum::extract::ws::Message, axum::Error>>
        + Sink<axum::extract::ws::Message, Error = axum::Error>
        + Unpin,
{
    use tokio_tungstenite::tungstenite::Message as WsMessage;

    // tungstenite solo acepta ws:// / wss://; el target viene como http(s).
    let ws_target = target
        .replacen("http://", "ws://", 1)
        .replacen("https://", "wss://", 1);

    let (upstream, _resp) = match tokio_tungstenite::connect_async(&ws_target).await {
        Ok(pair) => pair,
        Err(e) => {
            eprintln!("steer:proxy ws upstream connect falló ({ws_target}): {e}");
            return;
        }
    };
    let (mut upstream_sink, mut upstream_stream) = upstream.split();
    let (mut client_sink, mut client_stream) = client.split();

    // Cliente (WKWebView) → upstream (Vite).
    let to_upstream = async move {
        while let Some(Ok(msg)) = client_stream.next().await {
            let msg = match msg {
                axum::extract::ws::Message::Text(t) => WsMessage::Text(t.as_str().into()),
                axum::extract::ws::Message::Binary(b) => WsMessage::Binary(b.to_vec().into()),
                axum::extract::ws::Message::Ping(p) => WsMessage::Ping(p.to_vec().into()),
                axum::extract::ws::Message::Pong(p) => WsMessage::Pong(p.to_vec().into()),
                axum::extract::ws::Message::Close(c) => WsMessage::Close(c.map(|f| {
                    tokio_tungstenite::tungstenite::protocol::CloseFrame {
                        code: tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::Iana(
                            f.code,
                        ),
                        reason: f.reason.as_str().into(),
                    }
                })),
            };
            if upstream_sink.send(msg).await.is_err() {
                break;
            }
        }
        let _ = upstream_sink.close().await;
    };

    // Upstream (Vite) → cliente.
    let to_client = async move {
        while let Some(Ok(msg)) = upstream_stream.next().await {
            let msg = match msg {
                WsMessage::Text(t) => axum::extract::ws::Message::Text(t.as_str().into()),
                WsMessage::Binary(b) => axum::extract::ws::Message::Binary(b.to_vec().into()),
                WsMessage::Ping(p) => axum::extract::ws::Message::Ping(p.to_vec().into()),
                WsMessage::Pong(p) => axum::extract::ws::Message::Pong(p.to_vec().into()),
                WsMessage::Close(c) => axum::extract::ws::Message::Close(c.map(|f| {
                    axum::extract::ws::CloseFrame {
                        code: f.code.into(),
                        reason: f.reason.as_str().into(),
                    }
                })),
                WsMessage::Frame(_) => continue,
            };
            if client_sink.send(msg).await.is_err() {
                break;
            }
        }
        let _ = client_sink.close().await;
    };

    tokio::join!(to_upstream, to_client);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inyecta_antes_de_body() {
        let html = "<html><body><h1>hola</h1></body></html>";
        let out = inject_bridge(html);
        assert!(out.contains(r#"<script src="/__steer/bridge.js?v="#));
        assert!(out.contains(r#""></script></body>"#));
    }

    #[test]
    fn inyeccion_case_insensitive() {
        let html = "<html><BODY><h1>hola</h1></BODY></html>";
        let out = inject_bridge(html);
        assert!(out.contains(r#"></script></BODY>"#));
    }

    #[test]
    fn sin_body_se_anexa() {
        let out = inject_bridge("<p>hola</p>");
        assert!(out.contains(r#"<script src="/__steer/bridge.js?v="#));
    }
}
