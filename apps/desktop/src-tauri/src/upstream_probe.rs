// upstream_probe.rs — health-check HTTP del dev server en loopback.
// Vite suele escuchar en `localhost` (IPv6); forzar solo `127.0.0.1` dejaba
// el preview en "caído" aunque el server respondiera.

use std::time::Duration;

pub fn candidates(url: &str) -> Vec<String> {
    let base = url.trim_end_matches('/');
    let mut out = vec![base.to_string()];
    if base.contains("127.0.0.1") {
        out.push(base.replace("127.0.0.1", "localhost"));
    } else if base.contains("localhost") {
        out.push(base.replace("localhost", "127.0.0.1"));
    }
    out
}

pub fn resolve_blocking(url: &str) -> Option<String> {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(2000))
        .build()
    {
        Ok(c) => c,
        Err(_) => return None,
    };
    for candidate in candidates(url) {
        let ok = client
            .get(&candidate)
            .send()
            .map(|res| res.status().is_success() || res.status().is_redirection())
            .unwrap_or(false);
        if ok {
            return Some(candidate);
        }
    }
    None
}

pub fn ready_blocking(url: &str) -> bool {
    resolve_blocking(url).is_some()
}

pub async fn resolve(url: &str) -> Option<String> {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(2000))
        .build()
    {
        Ok(c) => c,
        Err(_) => return None,
    };
    for candidate in candidates(url) {
        let ok = client
            .get(&candidate)
            .send()
            .await
            .map(|res| res.status().is_success() || res.status().is_redirection())
            .unwrap_or(false);
        if ok {
            return Some(candidate);
        }
    }
    None
}

pub async fn ready(url: &str) -> bool {
    resolve(url).await.is_some()
}
