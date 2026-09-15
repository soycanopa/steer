// Adapter OpenCode — TRD §8. Implementa AgentPort contra `opencode serve`
// (HTTP+SSE). La UI no importa este package; solo composition.ts.

import { serializeTurn, type ApplyPayload } from "@steer/domain";
import type {
  AgentEvent,
  AgentPort,
  ModelRef,
  SessionId,
  TurnPart,
  TurnRequest,
} from "@steer/ports";
import { httpGet, httpPost, readSse } from "./client";
import { mapProvidersToModels, type ProvidersResponse } from "./map-models";

export const AGENT_OPENCODE_DEFAULT_URL = "http://127.0.0.1:4096";
/**
 * Puertos habituales cuando el 4096 está ocupado por otra app.
 * `health()` de composition puede probarlos en orden.
 */
export const AGENT_OPENCODE_FALLBACK_URLS = [
  "http://127.0.0.1:4097",
  "http://127.0.0.1:4098",
  "http://127.0.0.1:4095",
] as const;
export const OPENCODE_ID = "opencode";
export { mapProvidersToModels, OPENCODE_PROVIDER_ID } from "./map-models";
export type { ProvidersResponse } from "./map-models";

export type OpenCodeAgentOptions = {
  /** Base URL del server. Default: AGENT_OPENCODE_DEFAULT_URL. */
  baseUrl?: string;
};

type SessionInfo = { id: string };
type HealthBody = { healthy?: boolean; version?: string };
type ProvidersBody = ProvidersResponse & {
  default?: Record<string, string>;
};

/** Construye el texto del prompt a partir de TurnPart[] (TRD §7). */
export function buildPromptText(parts: TurnPart[]): string {
  const texts: string[] = [];
  for (const part of parts) {
    if (part.type === "intents") {
      texts.push(serializeTurn(part.payload));
    } else if (part.type === "text") {
      texts.push(part.text);
    } else if (part.type === "image") {
      texts.push("[imagen adjunta]");
    }
  }
  return texts.filter((t) => t.trim() !== "").join("\n\n");
}

type OpenCodePromptPart =
  | { type: "text"; text: string }
  | { type: "file"; mime: string; filename: string; url: string };

/** Parts HTTP de prompt_async: texto + file data-URL para cada imagen. */
export function buildOpenCodeParts(
  parts: TurnPart[],
  extraText: string,
): OpenCodePromptPart[] {
  const out: OpenCodePromptPart[] = [];
  const text = (buildPromptText(parts) + extraText).trim();
  if (text !== "") {
    out.push({ type: "text", text });
  }
  let img = 0;
  for (const part of parts) {
    if (part.type !== "image") continue;
    img += 1;
    const ext = part.mime === "image/jpeg" ? "jpg" : "png";
    out.push({
      type: "file",
      mime: part.mime,
      filename: `preview-${img}.${ext}`,
      url: `data:${part.mime};base64,${part.dataBase64}`,
    });
  }
  return out;
}

function effortSuffix(req: TurnRequest): string {
  const extras = req.extras as {
    reasoning?: { effort?: unknown };
    effort?: unknown;
  };
  const raw = extras?.reasoning?.effort ?? extras?.effort;
  if (typeof raw === "string" && raw !== "") {
    // El server no tiene knob effort en el body; lo dejamos en el texto.
    return `\n\n[reasoning.effort=${raw}]`;
  }
  return "";
}

/** Id del stream SSE del payload OpenCode, si viene envuelto en properties. */
function eventSessionId(ev: unknown): string | null {
  if (typeof ev !== "object" || ev === null) return null;
  const e = ev as {
    properties?: {
      sessionID?: unknown;
      info?: { sessionID?: unknown };
      part?: { sessionID?: unknown };
    };
  };
  const p = e.properties;
  if (p == null) return null;
  if (typeof p.sessionID === "string") return p.sessionID;
  if (p.info != null && typeof p.info.sessionID === "string") return p.info.sessionID;
  if (p.part != null && typeof p.part.sessionID === "string") return p.part.sessionID;
  return null;
}

function mapSseToAgentEvents(
  ev: unknown,
  sessionId: SessionId,
): AgentEvent | null {
  if (typeof ev !== "object" || ev === null) return null;
  const e = ev as { type?: unknown; properties?: unknown };
  if (typeof e.type !== "string") return null;

  // Solo eventos de nuestra sesión (o globales de error sin session).
  const sid = eventSessionId(ev);
  if (e.type === "session.error") {
    if (sid !== null && sid !== sessionId) return null;
    const props = e.properties as
      | { error?: { message?: unknown; data?: { message?: unknown } } }
      | undefined;
    const message =
      props?.error?.message ??
      props?.error?.data?.message ??
      "OpenCode session error";
    return {
      type: "error",
      message: typeof message === "string" ? message : "OpenCode session error",
    };
  }
  if (e.type === "session.idle") {
    if (sid !== sessionId) return null;
    return { type: "done" };
  }
  if (sid !== null && sid !== sessionId) return null;

  if (e.type === "message.part.updated") {
    const props = e.properties as
      | {
          delta?: unknown;
          part?: {
            type?: unknown;
            text?: unknown;
            tool?: unknown;
            state?: { status?: unknown; title?: unknown; error?: unknown };
          };
        }
      | undefined;
    const part = props?.part;
    if (part == null) return null;

    if (part.type === "text") {
      if (typeof props?.delta === "string" && props.delta !== "") {
        return { type: "text-delta", text: props.delta };
      }
      // Part completa sin delta: no la re-emitimos (evita duplicados).
      return null;
    }

    if (part.type === "tool") {
      const name = typeof part.tool === "string" ? part.tool : "tool";
      const status = part.state?.status;
      if (status === "running" || status === "pending") {
        const title = part.state?.title;
        return {
          type: "tool",
          name,
          status: "start",
          detail: typeof title === "string" ? title : undefined,
        };
      }
      if (status === "completed" || status === "error") {
        const detail =
          status === "error"
            ? typeof part.state?.error === "string"
              ? part.state.error
              : undefined
            : typeof part.state?.title === "string"
              ? part.state.title
              : undefined;
        return { type: "tool", name, status: "end", detail };
      }
      return null;
    }

    return null;
  }

  if (e.type === "permission.updated") {
    const props = e.properties as
      | { id?: unknown; title?: unknown; type?: unknown }
      | undefined;
    const id = props?.id;
    if (typeof id !== "string") return null;
    const title = typeof props?.title === "string" ? props.title : "permiso";
    return { type: "permission", permissionId: id, summary: title };
  }

  return null;
}

export function createOpencodeAgent(
  options: OpenCodeAgentOptions = {},
): AgentPort {
  let baseUrl = (options.baseUrl ?? AGENT_OPENCODE_DEFAULT_URL).replace(
    /\/+$/,
    "",
  );
  let abortController: AbortController | null = null;

  async function probeUrl(url: string): Promise<{ ok: boolean; version?: string }> {
    try {
      const body = await httpGet<HealthBody>(url, "/global/health");
      if (body.healthy !== true) return { ok: false };
      return { ok: true, version: body.version };
    } catch {
      return { ok: false };
    }
  }

  async function resolveBase(): Promise<boolean> {
    const candidates = [baseUrl, ...AGENT_OPENCODE_FALLBACK_URLS.filter(
      (u) => u !== baseUrl,
    )];
    for (const url of candidates) {
      const h = await probeUrl(url);
      if (h.ok) {
        baseUrl = url.replace(/\/+$/, "");
        return true;
      }
    }
    return false;
  }

  return {
    id: OPENCODE_ID,
    label: "OpenCode",

    async health() {
      const found = await resolveBase();
      if (!found) {
        return {
          ok: false,
          detail:
            "OpenCode no está en marcha. El puerto 4096 lo usa otra app; arranca `opencode serve --port 4097`.",
        };
      }
      try {
        const body = await httpGet<HealthBody>(baseUrl, "/global/health");
        if (body.healthy !== true) {
          return {
            ok: false,
            detail: `healthy != true en ${baseUrl}`,
          };
        }
        return { ok: true, version: body.version };
      } catch (err) {
        return {
          ok: false,
          detail: `${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },

    async listModels(): Promise<ModelRef[]> {
      await resolveBase();
      const body = await httpGet<ProvidersBody>(baseUrl, "/config/providers");
      const defaultKey =
        body.default != null
          ? (Object.values(body.default)[0] ?? null)
          : null;
      return mapProvidersToModels(body, defaultKey);
    },

    startTurn(req: TurnRequest): AsyncIterable<AgentEvent> {
      const ac = new AbortController();
      abortController = ac;
      const { signal } = ac;
      return (async function* (): AsyncGenerator<AgentEvent> {
        await resolveBase();
        const directory = req.directory;

        try {
          let sessionId = req.sessionId;
          if (sessionId == null) {
            const created = await httpPost<SessionInfo>(
              baseUrl,
              "/session",
              { title: "Steer" },
              directory,
              signal,
            );
            sessionId = created.id;
          }
          yield { type: "session", sessionId };

          const agentName = mapAgentMode(req.extras);
          const parts = buildOpenCodeParts(req.parts, effortSuffix(req));
          if (parts.length === 0) {
            parts.push({ type: "text", text: "[turno vacío]" });
          }

          await httpPost(
            baseUrl,
            `/session/${encodeURIComponent(sessionId)}/prompt_async`,
            {
              model: {
                providerID: req.model.providerId,
                modelID: req.model.modelId,
              },
              ...(agentName != null ? { agent: agentName } : {}),
              parts,
            },
            directory,
            signal,
          );

          // Escucha SSE hasta session.idle de ESTA sesión.
          for await (const raw of readSse(
            baseUrl,
            "/event",
            directory,
            signal,
          )) {
            const mapped = mapSseToAgentEvents(raw, sessionId);
            if (mapped != null) {
              yield mapped;
              if (mapped.type === "done" || mapped.type === "error") {
                break;
              }
            }
          }
        } catch (err) {
          if (signal.aborted) {
            yield { type: "error", message: "Turno detenido." };
            return;
          }
          yield {
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          };
        } finally {
          if (abortController === ac) abortController = null;
        }
      })();
    },

    async abort(sessionId: SessionId | null): Promise<void> {
      abortController?.abort();
      if (sessionId == null || sessionId === "") return;
      try {
        await httpPost(
          baseUrl,
          `/session/${encodeURIComponent(sessionId)}/abort`,
          {},
        );
      } catch {
        // El abort HTTP es best-effort; el local ya cortó el SSE.
      }
    },

    async respondPermission(
      sessionId: SessionId,
      permissionId: string,
      accept: boolean,
    ): Promise<void> {
      await httpPost(
        baseUrl,
        `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`,
        { response: accept ? "once" : "reject" },
      );
    },

    async listSessions(directory: string) {
      await resolveBase();
      type SessionRow = {
        id: string;
        title?: string;
        directory?: string;
        time?: { created?: number };
      };
      const rows = await httpGet<SessionRow[]>(baseUrl, "/session");
      const want = directory.replace(/\/+$/, "");
      return rows
        .filter((s) => {
          if (!s.directory) return true;
          return s.directory.replace(/\/+$/, "") === want;
        })
        .slice(0, 40)
        .map((s) => ({
          id: s.id,
          title: s.title && s.title !== "" ? s.title : s.id,
          createdAt: s.time?.created ?? 0,
          directory: s.directory ?? null,
        }));
    },
  };
}

/** extras.agent → nombre de agente OpenCode (ask/plan/build). */
function mapAgentMode(extras: Record<string, unknown>): string | null {
  const raw = extras.agent;
  if (typeof raw !== "string" || raw === "") return null;
  if (raw === "agent") return "build";
  if (raw === "ask" || raw === "plan" || raw === "build") return raw;
  return raw;
}
