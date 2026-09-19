// Cliente HTTP mínimo contra el server v2 (`opencode serve`, rutas /api/*).
// Solo lo usa este adapter; ningún componente React importa estas funciones.

export type HttpJson = unknown;

/** Basic auth del server v2 (genera password al arrancar; el host lo provee). */
export type OpenCodeAuth = { username: string; password: string };

export class OpenCodeHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly path?: string,
  ) {
    super(message);
    this.name = "OpenCodeHttpError";
  }
}

export function withDirectory(url: URL, directory?: string): void {
  if (directory != null && directory !== "") {
    url.searchParams.set("directory", directory);
  }
}

function authHeaders(auth: OpenCodeAuth | null): Record<string, string> {
  if (auth == null) return {};
  const token = btoa(`${auth.username}:${auth.password}`);
  return { authorization: `Basic ${token}` };
}

export async function httpGet<T>(
  baseUrl: string,
  path: string,
  directory?: string,
  auth?: OpenCodeAuth | null,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(path, baseUrl);
  withDirectory(url, directory);
  const res = await fetch(url, { headers: authHeaders(auth ?? null), signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenCodeHttpError(
      `GET ${path} → ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      res.status,
      path,
    );
  }
  return (await res.json()) as T;
}

export async function httpDelete(
  baseUrl: string,
  path: string,
  directory?: string,
  auth?: OpenCodeAuth | null,
): Promise<void> {
  const url = new URL(path, baseUrl);
  withDirectory(url, directory);
  const res = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(auth ?? null),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new OpenCodeHttpError(
      `DELETE ${path} → ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      res.status,
      path,
    );
  }
}

export async function httpPost<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  directory?: string,
  signal?: AbortSignal,
  auth?: OpenCodeAuth | null,
): Promise<T> {
  const url = new URL(path, baseUrl);
  withDirectory(url, directory);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(auth ?? null),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new OpenCodeHttpError(
      `POST ${path} → ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      res.status,
      path,
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (text === "") {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/** Lee un stream SSE (`/api/event`) y entrega cada payload JSON de `data:`. */
export async function* readSse(
  baseUrl: string,
  path: string,
  directory?: string,
  signal?: AbortSignal,
  auth?: OpenCodeAuth | null,
): AsyncGenerator<unknown> {
  const url = new URL(path, baseUrl);
  withDirectory(url, directory);
  const res = await fetch(url, {
    headers: { accept: "text/event-stream", ...authHeaders(auth ?? null) },
    signal,
  });
  if (!res.ok || res.body == null) {
    throw new OpenCodeHttpError(
      `GET ${path} → ${res.status} (SSE)`,
      res.status,
      path,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = parseSseChunk(chunk);
        if (data !== null) yield data;
        sep = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseChunk(chunk: string): unknown | null {
  const lines = chunk.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith(":")) continue; // comment / keepalive
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  if (raw === "") return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
