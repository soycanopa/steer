// Adapter OpenCode — TRD §8. Implementa AgentPort contra el server v2
// (`opencode serve`, rutas /api/*, SSE /api/event, Basic auth opcional).
// La UI no importa este package; solo composition.ts.

import { isTodoTool, parseTodos, serializeTurn, type ApplyPayload } from "@steer/domain";
import type {
  AgentEvent,
  AgentPort,
  ModelRef,
  SessionId,
  TurnPart,
  TurnRequest,
} from "@steer/ports";
import { httpDelete, httpGet, httpPost, readSse, type OpenCodeAuth } from "./client";
import {
  mapModelsToRefs,
  OPENCODE_PROVIDER_ID,
  type V2ModelDefaultOutput,
  type V2ModelListOutput,
} from "./map-models";

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
export { mapModelsToRefs, OPENCODE_PROVIDER_ID } from "./map-models";
export type {
  V2ModelDefaultOutput,
  V2ModelInfo,
  V2ModelListOutput,
} from "./map-models";

export type OpenCodeAgentOptions = {
  /** Base URL del server. Default: AGENT_OPENCODE_DEFAULT_URL. */
  baseUrl?: string;
};

/** AgentPort + setters para que el host fije URL y auth tras opencode_ensure. */
export type OpencodeAgentPort = AgentPort & {
  setBaseUrl(url: string): void;
  /** Basic auth del server v2 (password impreso en su stdout). */
  setAuth(auth: OpenCodeAuth | null): void;
};

type Envelope<T> = { data?: T };

/** Construye el texto del prompt a partir de TurnPart[] (TRD §7). */
export function buildPromptText(parts: TurnPart[]): string {
  const texts: string[] = [];
  for (const part of parts) {
    if (part.type === "intents") {
      texts.push(serializeTurn(part.payload));
    } else if (part.type === "text") {
      texts.push(part.text);
    } else if (part.type === "image") {
      texts.push("[image attached]");
    }
  }
  return texts.filter((t) => t.trim() !== "").join("\n\n");
}

export type OpenCodePromptBody = {
  text: string;
  files: Array<{ uri: string; name: string }>;
};

/** Cuerpo de POST /api/session/:id/prompt: texto + data-URL por imagen. */
export function buildOpenCodeParts(parts: TurnPart[]): OpenCodePromptBody {
  const text = buildPromptText(parts).trim();
  const files: OpenCodePromptBody["files"] = [];
  let img = 0;
  for (const part of parts) {
    if (part.type !== "image") continue;
    img += 1;
    const ext = part.mime === "image/jpeg" ? "jpg" : "png";
    files.push({
      uri: `data:${part.mime};base64,${part.dataBase64}`,
      name: `preview-${img}.${ext}`,
    });
  }
  return { text, files };
}

/** OpenCode: `variant` del Model.Ref (low | high | max…). */
function resolveVariant(req: TurnRequest): string | undefined {
  const extras = req.extras as {
    reasoning?: { effort?: unknown };
    effort?: unknown;
  };
  const raw = extras?.reasoning?.effort ?? extras?.effort;
  if (typeof raw === "string" && raw !== "") {
    return raw;
  }
  return undefined;
}

/** extras.agent → nombre de agente OpenCode (`GET /api/agent`). */
function mapAgentMode(extras: Record<string, unknown>): string | null {
  const raw = extras.agent;
  if (typeof raw !== "string" || raw === "") return null;
  if (raw === "agent") return "build";
  return raw;
}

type V2FormField = {
  key?: unknown;
  title?: unknown;
  hidden?: unknown;
  type?: unknown;
  options?: Array<{ value?: unknown; label?: unknown } | undefined>;
};
type V2FormInfo = {
  id?: unknown;
  sessionID?: unknown;
  fields?: unknown;
};

type V2EventShape = { type?: unknown; data?: unknown };

function sessionIdOf(data: Record<string, unknown>): string | null {
  const direct = data.sessionID;
  if (typeof direct === "string") return direct;
  const form = data.form as V2FormInfo | undefined;
  if (form != null && typeof form.sessionID === "string") return form.sessionID;
  return null;
}

/** Mapea eventos v2 de /api/event → AgentEvent. Deltas reales: sin snapshots. */
export function createSsePartTracker() {
  const toolNames = new Map<string, string>();

  function toolNameFor(id: string | null): string | null {
    if (id == null) return null;
    return toolNames.get(id) ?? null;
  }

  function map(ev: unknown, sessionId: SessionId): AgentEvent | null {
    if (typeof ev !== "object" || ev === null) return null;
    const e = ev as V2EventShape;
    if (typeof e.type !== "string") return null;
    const type = e.type;
    if (type === "server.connected") return null;
    const data = (e.data ?? {}) as Record<string, unknown>;
    const sid = sessionIdOf(data);
    if (sid !== null && sid !== sessionId) return null;

    switch (type) {
      case "session.idle":
      // v2 cierra el turno con execution.succeeded; idle llega en otros
      // contextos (p. ej. reversiones). Ambos significan "sin trabajo".
      case "session.execution.succeeded":
        return { type: "done" };

      case "session.execution.interrupted":
        return { type: "done" };

      case "session.execution.failed": {
        const err = data.error as { message?: unknown } | undefined;
        const message =
          typeof err?.message === "string" && err.message !== ""
            ? err.message
            : "OpenCode: turn failed";
        return { type: "error", message };
      }

      case "session.text.delta": {
        const delta = data.delta;
        return typeof delta === "string" && delta !== ""
          ? { type: "text-delta", text: delta }
          : null;
      }

      case "session.reasoning.delta": {
        const delta = data.delta;
        return typeof delta === "string" && delta !== ""
          ? { type: "reasoning-delta", text: delta }
          : null;
      }

      case "session.step.ended": {
        // Contexto ocupado por el turno: prompt de este step (input+cache).
        // El último step gana: la conversación completa se re-envía cada uno.
        const tokens = data.tokens as
          | {
              input?: unknown;
              cache?: { read?: unknown; write?: unknown };
            }
          | undefined;
        const input = typeof tokens?.input === "number" ? tokens.input : 0;
        const read =
          typeof tokens?.cache?.read === "number" ? tokens.cache.read : 0;
        const write =
          typeof tokens?.cache?.write === "number" ? tokens.cache.write : 0;
        const total = input + read + write;
        return total > 0 ? { type: "usage", contextTokens: total } : null;
      }

      case "session.tool.input.started": {
        const id = data.id;
        const name = data.name;
        if (typeof id === "string" && typeof name === "string") {
          toolNames.set(id, name);
        }
        if (typeof id !== "string" || id === "" || typeof name !== "string" || name === "") {
          return null;
        }
        return { type: "tool", id, name, status: "start" };
      }

      case "session.tool.called": {
        const name = toolNameFor(typeof data.id === "string" ? data.id : null);
        if (name != null && isTodoTool(name)) {
          const todos = parseTodos(data.input);
          if (todos.length > 0) return { type: "todo", todos };
        }
        return null;
      }

      case "session.tool.input.ended": {
        const id = typeof data.id === "string" ? data.id : null;
        const name = toolNameFor(id);
        if (name == null || !isTodoTool(name)) return null;
        if (typeof data.text !== "string" || data.text === "") return null;
        try {
          const todos = parseTodos(JSON.parse(data.text));
          if (todos.length > 0) return { type: "todo", todos };
        } catch {
          // Args aún no son JSON parseable.
        }
        return null;
      }

      case "session.tool.success": {
        const id = typeof data.id === "string" ? data.id : null;
        if (id == null) return null;
        return { type: "tool", id, name: toolNames.get(id) ?? "tool", status: "end" };
      }

      case "session.tool.failed": {
        const id = typeof data.id === "string" ? data.id : null;
        if (id == null) return null;
        const err = data.error as { message?: unknown } | undefined;
        return {
          type: "tool",
          id,
          name: toolNames.get(id) ?? "tool",
          status: "end",
          detail:
            typeof err?.message === "string" && err.message !== ""
              ? err.message
              : undefined,
        };
      }

      case "permission.asked": {
        const id = data.id;
        if (typeof id !== "string" || id === "") return null;
        const action = typeof data.action === "string" ? data.action : "";
        const resources = Array.isArray(data.resources)
          ? data.resources.filter((r): r is string => typeof r === "string")
          : [];
        const message =
          typeof data.message === "string" && data.message !== ""
            ? data.message
            : null;
        const summary = message ?? [action, ...resources].filter((s) => s !== "").join(" · ");
        return {
          type: "permission",
          permissionId: id,
          summary: summary === "" ? "permission" : summary,
        };
      }

      case "form.created": {
        const form = data.form as V2FormInfo | undefined | null;
        if (form == null || typeof form.id !== "string" || form.id === "") return null;
        const fields = Array.isArray(form.fields)
          ? (form.fields as V2FormField[])
          : [];
        const questions = fields
          .filter((f) => f?.hidden !== true)
          .map((f) => {
            const prompt =
              typeof f.title === "string" && f.title !== ""
                ? f.title
                : typeof f.key === "string"
                  ? f.key
                  : "";
            const options = Array.isArray(f.options)
              ? f.options
                  .map((o) =>
                    typeof o?.label === "string" && o.label !== ""
                      ? o.label
                      : typeof o?.value === "string"
                        ? o.value
                        : "",
                  )
                  .filter((s) => s !== "")
              : undefined;
            return { prompt, options };
          })
          .filter((q) => q.prompt !== "");
        if (questions.length === 0) return null;
        return { type: "question", questionId: form.id, questions };
      }

      default:
        return null;
    }
  }

  return { map };
}

export function createOpencodeAgent(
  options: OpenCodeAgentOptions = {},
): OpencodeAgentPort {
  let baseUrl = (options.baseUrl ?? AGENT_OPENCODE_DEFAULT_URL).replace(
    /\/+$/,
    "",
  );
  let auth: OpenCodeAuth | null = null;
  let abortController: AbortController | null = null;
  /** Campos de forms pendientes, para mapear respuestas a {key: value}. */
  const formFields = new Map<string, V2FormField[]>();

  async function probeUrl(
    url: string,
  ): Promise<{ ok: boolean; version?: string }> {
    try {
      const body = await httpGet<Envelope<{ version?: unknown }>>(
        url,
        "/api/info",
        undefined,
        auth,
      );
      const version = body?.data?.version;
      return {
        ok: true,
        version: typeof version === "string" ? version : undefined,
      };
    } catch {
      return { ok: false };
    }
  }

  async function resolveBase(): Promise<boolean> {
    const candidates = [
      baseUrl,
      ...AGENT_OPENCODE_FALLBACK_URLS.filter((u) => u !== baseUrl),
    ];
    for (const url of candidates) {
      const h = await probeUrl(url);
      if (h.ok) {
        baseUrl = url.replace(/\/+$/, "");
        return true;
      }
    }
    return false;
  }

  function registerFormFields(questionId: string, rawForm: unknown): void {
    const form = rawForm as V2FormInfo | undefined | null;
    if (form == null) return;
    const fields = Array.isArray(form.fields) ? (form.fields as V2FormField[]) : [];
    if (fields.length > 0) formFields.set(questionId, fields);
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
            "OpenCode v2 server is not running. Start it with `opencode serve --port 4097`.",
        };
      }
      try {
        const h = await probeUrl(baseUrl);
        if (!h.ok) {
          return { ok: false, detail: `GET /api/info failed on ${baseUrl}` };
        }
        return { ok: true, version: h.version };
      } catch (err) {
        return {
          ok: false,
          detail: `${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },

    async listModels(): Promise<ModelRef[]> {
      await resolveBase();
      const def = await httpGet<V2ModelDefaultOutput>(
        baseUrl,
        "/api/model/default",
        undefined,
        auth,
      ).catch(() => null as V2ModelDefaultOutput | null);
      // El catálogo arranca frío: los primeros segundos /api/model puede
      // venir vacío aunque haya providers conectados. Reintenta corto.
      let body: V2ModelListOutput = { data: [] };
      for (let attempt = 0; attempt < 4; attempt += 1) {
        body = await httpGet<V2ModelListOutput>(
          baseUrl,
          "/api/model",
          undefined,
          auth,
        );
        if ((body?.data ?? []).length > 0) break;
        await sleep(700).catch(() => {});
      }
      return mapModelsToRefs(body, def?.data ?? null);
    },

    startTurn(req: TurnRequest): AsyncIterable<AgentEvent> {
      const ac = new AbortController();
      abortController = ac;
      const { signal } = ac;
      return (async function* (): AsyncGenerator<AgentEvent> {
        try {
          const found = await resolveBase();
          if (!found) {
            yield {
              type: "error",
              message:
                "OpenCode v2 server is not reachable. Start it with `opencode serve --port 4097`.",
            };
            return;
          }
          const directory = req.directory;

          let sessionId = req.sessionId;
          if (sessionId == null) {
            const variant = resolveVariant(req);
            const agentName = mapAgentMode(req.extras);
            const created = await httpPost<Envelope<{ id?: unknown }>>(
              baseUrl,
              "/api/session",
              {
                title: "Steer",
                location: { directory },
                model: {
                  id: req.model.modelId,
                  providerID: req.model.providerId,
                  ...(variant != null ? { variant } : {}),
                },
                ...(agentName != null ? { agent: agentName } : {}),
              },
              directory,
              signal,
              auth,
            );
            const newId = created?.data?.id;
            if (typeof newId !== "string" || newId === "") {
              throw new Error(
                "OpenCode did not return a session id (POST /api/session).",
              );
            }
            sessionId = newId;
          }
          yield { type: "session", sessionId };

          const parts = buildOpenCodeParts(req.parts);
          const promptBody = {
            text: parts.text !== "" ? parts.text : "[empty turn]",
            ...(parts.files.length > 0 ? { files: parts.files } : {}),
          };

          const tracker = createSsePartTracker();
          let promptSent = false;
          let questionPending = false;

          const sseAbort = new AbortController();
          const sseSignal = mergeAbortSignals(signal, sseAbort.signal);

          try {
            for await (const raw of readSse(
              baseUrl,
              "/api/event",
              undefined,
              sseSignal,
              auth,
            )) {
              const rawType =
                typeof raw === "object" && raw !== null
                  ? (raw as V2EventShape).type
                  : undefined;

              if (!promptSent) {
                if (rawType === "server.connected") {
                  await httpPost(
                    baseUrl,
                    `/api/session/${encodeURIComponent(sessionId)}/prompt`,
                    promptBody,
                    directory,
                    signal,
                    auth,
                  );
                  promptSent = true;
                }
                continue;
              }

              if (rawType === "form.replied" || rawType === "form.cancelled") {
                questionPending = false;
                const d = (raw as { data?: { formID?: unknown; form?: { id?: unknown } } })
                  .data;
                const formId = d?.formID ?? d?.form?.id;
                if (typeof formId === "string") formFields.delete(formId);
                continue;
              }

              const mapped = tracker.map(raw, sessionId);
              if (mapped == null) continue;

              if (mapped.type === "question") {
                questionPending = true;
                const d = (raw as { data?: { form?: unknown } }).data;
                registerFormFields(mapped.questionId, d?.form);
              }
              // Con pregunta pendiente el turno sigue: no cerrar por idle.
              if (mapped.type === "done" && questionPending) continue;

              yield mapped;
              if (mapped.type === "done" || mapped.type === "error") {
                sseAbort.abort();
                return;
              }
            }
            if (!signal.aborted && !sseAbort.signal.aborted) {
              yield {
                type: "error",
                message:
                  "OpenCode event stream ended before the turn finished.",
              };
            }
          } catch (err) {
            if (!sseAbort.signal.aborted && !signal.aborted) {
              throw err;
            }
          }
        } catch (err) {
          if (signal.aborted) {
            yield { type: "error", message: "Turn stopped." };
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
          `/api/session/${encodeURIComponent(sessionId)}/interrupt`,
          {},
          undefined,
          undefined,
          auth,
        );
      } catch {
        // El abort HTTP es best-effort; el local ya cortó el SSE.
      }
    },

    async respondPermission(
      sessionId: SessionId,
      permissionId: string,
      accept: boolean,
      remember?: boolean,
    ): Promise<void> {
      await httpPost(
        baseUrl,
        `/api/session/${encodeURIComponent(sessionId)}/permission/${encodeURIComponent(permissionId)}/reply`,
        { decision: accept ? (remember === true ? "always" : "once") : "reject" },
        undefined,
        undefined,
        auth,
      );
    },

    async respondQuestion(
      sessionId: SessionId,
      questionId: string,
      answers: string[][],
      directory: string,
    ): Promise<void> {
      await resolveBase();
      const fields = formFields.get(questionId) ?? [];
      const answer: Record<string, string | string[]> = {};
      fields.forEach((field, i) => {
        const row = answers[i] ?? [];
        if (row.length === 0) return;
        const key = typeof field.key === "string" && field.key !== "" ? field.key : `field${i}`;
        const options = Array.isArray(field.options) ? field.options : [];
        const toValue = (label: string): string => {
          const opt = options.find((o) => o?.label === label);
          return typeof opt?.value === "string" && opt.value !== ""
            ? opt.value
            : label;
        };
        answer[key] = row.length > 1 ? row.map(toValue) : toValue(row[0] ?? "");
      });
      await httpPost(
        baseUrl,
        `/api/session/${encodeURIComponent(sessionId)}/form/${encodeURIComponent(questionId)}/reply`,
        { answer },
        directory,
        undefined,
        auth,
      );
      formFields.delete(questionId);
    },

    async listSessions(directory: string) {
      await resolveBase();
      type SessionRow = {
        id?: unknown;
        title?: unknown;
        time?: { created?: unknown };
        location?: { directory?: unknown };
      };
      const url = `/api/session?limit=40&order=desc&directory=${encodeURIComponent(directory)}`;
      const rows = await httpGet<Envelope<SessionRow[]>>(
        baseUrl,
        url,
        undefined,
        auth,
      );
      return (rows?.data ?? []).flatMap((s) => {
        if (typeof s.id !== "string" || s.id === "") return [];
        const title =
          typeof s.title === "string" && s.title !== "" ? s.title : s.id;
        const createdAt =
          typeof s.time?.created === "number" ? s.time.created : 0;
        const dir =
          typeof s.location?.directory === "string"
            ? s.location.directory
            : null;
        return [{ id: s.id, title, createdAt, directory: dir }];
      });
    },

    async deleteSession(sessionId: SessionId, directory: string) {
      await resolveBase();
      await httpDelete(
        baseUrl,
        `/api/session/${encodeURIComponent(sessionId)}`,
        directory,
        auth,
      );
    },

    setBaseUrl(url: string) {
      baseUrl = url.replace(/\/+$/, "");
    },

    setAuth(next: OpenCodeAuth | null) {
      auth = next;
    },
  };
}

function mergeAbortSignals(
  a: AbortSignal,
  b: AbortSignal,
): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  a.addEventListener("abort", onAbort);
  b.addEventListener("abort", onAbort);
  ctrl.signal.addEventListener("abort", () => {
    a.removeEventListener("abort", onAbort);
    b.removeEventListener("abort", onAbort);
  });
  return ctrl.signal;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
