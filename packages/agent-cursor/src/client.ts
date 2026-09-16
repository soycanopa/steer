export class CursorHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly path?: string,
  ) {
    super(message);
    this.name = "CursorHttpError";
  }
}

async function parseJson<T>(res: Response, path: string): Promise<T> {
  const text = await res.text();
  if (text === "") return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CursorHttpError(`GET ${path}: JSON inválido`, res.status, path);
  }
}

export async function httpGet<T>(
  baseUrl: string,
  path: string,
  headers?: Record<string, string>,
): Promise<T> {
  const url = new URL(path, baseUrl);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CursorHttpError(
      `GET ${path} → ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      res.status,
      path,
    );
  }
  return parseJson<T>(res, path);
}

export async function httpPost<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(path, baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new CursorHttpError(
      `POST ${path} → ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      res.status,
      path,
    );
  }
  if (res.status === 204) return undefined as T;
  return parseJson<T>(res, path);
}

export async function* readSse(
  baseUrl: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<unknown> {
  const url = new URL(path, baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || res.body == null) {
    const text = await res.text().catch(() => "");
    throw new CursorHttpError(
      `POST ${path} → ${res.status} (SSE)${text ? `: ${text.slice(0, 200)}` : ""}`,
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
    if (line.startsWith(":")) continue;
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
