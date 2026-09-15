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
import { httpDelete, httpGet, httpPost, readSse } from "./client";
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

/** AgentPort + setter para que el host fije la URL tras opencode_ensure. */
export type OpencodeAgentPort = AgentPort & {
  setBaseUrl(url: string): void;
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

/** OpenCode: `variant` top-level en prompt_async (low | high | max…). */
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

type PartTextKind = "text" | "reasoning";

/** Acumula texto por part id para emitir solo deltas (OpenCode manda snapshots). */
export function createSsePartTracker() {
  const partKinds = new Map<string, PartTextKind>();
  const partTexts = new Map<string, string>();
  const messageRoles = new Map<string, "user" | "assistant">();

  function registerMessageRole(messageId: string, role: "user" | "assistant"): void {
    messageRoles.set(messageId, role);
  }

  function isAssistantMessage(messageId: string | null): boolean {
    if (messageId == null) return true;
    const role = messageRoles.get(messageId);
    return role !== "user";
  }

  function registerPartKind(partId: string, kind: PartTextKind): void {
    partKinds.set(partId, kind);
  }

  function kindForPartId(partId: string | null): PartTextKind {
    if (partId != null && partKinds.has(partId)) {
      return partKinds.get(partId) ?? "text";
    }
    return "text";
  }

  function deltaFromPart(
    partId: string,
    kind: PartTextKind,
    newText: string,
  ): AgentEvent | null {
    registerPartKind(partId, kind);
    if (newText === "") return null;
    const prev = partTexts.get(partId);
    if (prev === newText) return null;
    let delta = newText;
    if (prev !== undefined && newText.startsWith(prev)) {
      delta = newText.slice(prev.length);
    }
    partTexts.set(partId, newText);
    if (delta === "") return null;
    return {
      type: kind === "text" ? "text-delta" : "reasoning-delta",
      text: delta,
    };
  }

  function map(ev: unknown, sessionId: SessionId): AgentEvent | null {
    if (typeof ev !== "object" || ev === null) return null;
    const e = ev as { type?: unknown; properties?: unknown };
    if (typeof e.type !== "string") return null;

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
        message:
          typeof message === "string" ? message : "OpenCode session error",
      };
    }
    if (e.type === "session.idle") {
      if (sid !== null && sid !== sessionId) return null;
      return { type: "done" };
    }
    if (sid !== null && sid !== sessionId) return null;

    if (e.type === "message.updated") {
      const props = e.properties as
        | { info?: { id?: unknown; role?: unknown } }
        | undefined;
      const id = props?.info?.id;
      const role = props?.info?.role;
      if (
        typeof id === "string" &&
        (role === "user" || role === "assistant")
      ) {
        registerMessageRole(id, role);
      }
      return null;
    }

    if (e.type === "message.part.delta") {
      const props = e.properties as
        | {
            messageID?: unknown;
            partID?: unknown;
            field?: unknown;
            delta?: unknown;
          }
        | undefined;
      if (typeof props?.delta !== "string" || props.delta === "") return null;
      const messageId =
        typeof props.messageID === "string" ? props.messageID : null;
      if (!isAssistantMessage(messageId)) return null;
      const partId =
        typeof props.partID === "string" && props.partID !== ""
          ? props.partID
          : null;
      const kind =
        props.field === "reasoning"
          ? "reasoning"
          : kindForPartId(partId);
      if (partId != null) registerPartKind(partId, kind);
      const prev = partId != null ? partTexts.get(partId) ?? "" : "";
      const next = prev + props.delta;
      if (partId != null) partTexts.set(partId, next);
      return {
        type: kind === "text" ? "text-delta" : "reasoning-delta",
        text: props.delta,
      };
    }

    if (e.type === "message.part.updated") {
      const props = e.properties as
        | {
            delta?: unknown;
            part?: {
              id?: unknown;
              messageID?: unknown;
              type?: unknown;
              text?: unknown;
              tool?: unknown;
              state?: { status?: unknown; title?: unknown; error?: unknown };
            };
          }
        | undefined;
      const part = props?.part;
      if (part == null) return null;
      const partId =
        typeof part.id === "string" && part.id !== "" ? part.id : null;
      const messageId =
        typeof part.messageID === "string" ? part.messageID : null;

      if (part.type === "text" || part.type === "reasoning") {
        if (!isAssistantMessage(messageId)) return null;
        const kind: PartTextKind =
          part.type === "reasoning" ? "reasoning" : "text";
        if (partId != null) registerPartKind(partId, kind);
        if (typeof props?.delta === "string" && props.delta !== "") {
          return {
            type: kind === "text" ? "text-delta" : "reasoning-delta",
            text: props.delta,
          };
        }
        if (partId == null) return null;
        const text = typeof part.text === "string" ? part.text : "";
        return deltaFromPart(partId, kind, text);
      }

      if (part.type === "tool") {
        const toolId = partId ?? undefined;
        const name = typeof part.tool === "string" ? part.tool : "tool";
        const status = part.state?.status;
        if (status === "running" || status === "pending") {
          const title = part.state?.title;
          return {
            type: "tool",
            id: toolId,
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
          return { type: "tool", id: toolId, name, status: "end", detail };
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

    if (e.type === "question.asked") {
      return mapQuestionRequest(e.properties);
    }

    return null;
  }

  return { map };
}

type OpenCodeQuestionOption = { label?: unknown; description?: unknown };
type OpenCodeQuestionInfo = {
  question?: unknown;
  header?: unknown;
  options?: unknown;
};
type OpenCodeQuestionRequest = {
  id?: unknown;
  questions?: unknown;
};

function mapQuestionRequest(raw: unknown): AgentEvent | null {
  const props = raw as OpenCodeQuestionRequest | undefined;
  const questionId = typeof props?.id === "string" ? props.id : "";
  const rows = Array.isArray(props?.questions) ? props.questions : [];
  const questions = rows.flatMap((row) => {
    const info = row as OpenCodeQuestionInfo;
    const prompt =
      typeof info.question === "string"
        ? info.question
        : typeof info.header === "string"
          ? info.header
          : "";
    if (prompt === "") return [];
    const options = Array.isArray(info.options)
      ? info.options.flatMap((opt) => {
          const o = opt as OpenCodeQuestionOption;
          return typeof o.label === "string" && o.label !== "" ? [o.label] : [];
        })
      : undefined;
    const header =
      typeof info.header === "string" && info.header !== "" ? info.header : undefined;
    return [{ prompt, header, options }];
  });
  if (questionId === "" || questions.length === 0) return null;
  return { type: "question", questionId, questions };
}

export function createOpencodeAgent(
  options: OpenCodeAgentOptions = {},
): OpencodeAgentPort {
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
          const variant = resolveVariant(req);
          const parts = buildOpenCodeParts(req.parts, "");
          if (parts.length === 0) {
            parts.push({ type: "text", text: "[turno vacío]" });
          }

          const promptBody = {
            model: {
              providerID: req.model.providerId,
              modelID: req.model.modelId,
            },
            ...(agentName != null ? { agent: agentName } : {}),
            ...(variant != null ? { variant } : {}),
            parts,
          };

          // OpenCode docs: GET /event?directory=… → server.connected, luego bus.
          // Mismo directory que session/prompt_async. Si el SSE del webview no
          // entrega deltas, GET /session/:id/message completa el turno.
          const sseParts = createSsePartTracker();
          let promptSent = false;
          let emittedText = "";
          let emittedReasoning = "";
          let questionPending = false;

          const pollUntilStable = async (
            emit: (ev: AgentEvent) => void,
          ): Promise<void> => {
            let stable = 0;
            let lastText = "";
            for (let i = 0; i < 120 && !signal.aborted; i += 1) {
              await sleep(450, signal).catch(() => {});
              if (!promptSent) continue;
              try {
                const rows = await httpGet<MessageRow[]>(
                  baseUrl,
                  `/session/${encodeURIComponent(sessionId)}/message`,
                  directory,
                );
                const { text, reasoning } = latestAssistantText(rows);
                if (reasoning.length > emittedReasoning.length) {
                  emit({
                    type: "reasoning-delta",
                    text: reasoning.slice(emittedReasoning.length),
                  });
                  emittedReasoning = reasoning;
                }
                if (text.length > emittedText.length) {
                  emit({
                    type: "text-delta",
                    text: text.slice(emittedText.length),
                  });
                  emittedText = text;
                  stable = 0;
                  lastText = text;
                } else if (text !== "" && text === lastText) {
                  stable += 1;
                  if (stable >= 3) return;
                }
              } catch {
                // Turno en curso.
              }
            }
          };

          const sseAbort = new AbortController();
          const sseSignal = mergeAbortSignals(signal, sseAbort.signal);

          void (async () => {
            while (!promptSent && !signal.aborted) {
              await sleep(80, signal).catch(() => {});
            }
            let stable = 0;
            let lastText = "";
            for (let i = 0; i < 180 && !signal.aborted; i += 1) {
              await sleep(450, signal).catch(() => {});
              if (sseAbort.signal.aborted) return;
              try {
                const rows = await httpGet<MessageRow[]>(
                  baseUrl,
                  `/session/${encodeURIComponent(sessionId)}/message`,
                  directory,
                );
                const { text } = latestAssistantText(rows);
                if (questionPending) {
                  stable = 0;
                  continue;
                }
                if (
                  text !== "" &&
                  text === lastText &&
                  !hasRunningTool(rows)
                ) {
                  stable += 1;
                  if (stable >= 3) {
                    sseAbort.abort();
                    return;
                  }
                } else {
                  stable = 0;
                  lastText = text;
                }
              } catch {
                // Turno en curso.
              }
            }
            if (!signal.aborted) sseAbort.abort();
          })();

          try {
            for await (const raw of readSse(
              baseUrl,
              "/event",
              directory,
              sseSignal,
            )) {
              const eventType =
                typeof raw === "object" &&
                raw !== null &&
                typeof (raw as { type?: unknown }).type === "string"
                  ? (raw as { type: string }).type
                  : "";

              if (!promptSent && eventType === "server.connected") {
                await httpPost(
                  baseUrl,
                  `/session/${encodeURIComponent(sessionId)}/prompt_async`,
                  promptBody,
                  directory,
                  signal,
                );
                promptSent = true;
              }

              if (
                eventType === "question.replied" ||
                eventType === "question.rejected"
              ) {
                questionPending = false;
              }

              const mapped =
                eventType === "question.asked"
                  ? mapQuestionRequest(
                      (raw as { properties?: unknown }).properties,
                    )
                  : sseParts.map(raw, sessionId);
              if (mapped != null) {
                if (mapped.type === "text-delta") emittedText += mapped.text;
                if (mapped.type === "reasoning-delta") {
                  emittedReasoning += mapped.text;
                }
                if (mapped.type === "question") {
                  questionPending = true;
                }
                yield mapped;
                if (mapped.type === "done" || mapped.type === "error") {
                  sseAbort.abort();
                  return;
                }
              }
            }
          } catch (err) {
            if (!sseAbort.signal.aborted && !signal.aborted) {
              throw err;
            }
          }

          if (!promptSent) {
            yield {
              type: "error",
              message:
                "OpenCode no envió server.connected en GET /event. ¿CORS y directory correctos?",
            };
            return;
          }

          if (!questionPending) {
            const pending: AgentEvent[] = [];
            await pollUntilStable((ev) => {
              pending.push(ev);
            });
            for (const ev of pending) yield ev;
            yield { type: "done" };
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
      remember?: boolean,
    ): Promise<void> {
      await httpPost(
        baseUrl,
        `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`,
        {
          response: accept ? (remember === true ? "always" : "once") : "reject",
        },
      );
    },

    async respondQuestion(
      sessionId: SessionId,
      questionId: string,
      answers: string[][],
      directory: string,
    ): Promise<void> {
      await resolveBase();
      const body = { answers };
      try {
        await httpPost(
          baseUrl,
          `/question/${encodeURIComponent(questionId)}/reply`,
          body,
          directory,
        );
        return;
      } catch {
        await httpPost(
          baseUrl,
          `/session/${encodeURIComponent(sessionId)}/question/${encodeURIComponent(questionId)}/reply`,
          body,
          directory,
        );
      }
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

    async deleteSession(sessionId: SessionId, directory: string) {
      await resolveBase();
      await httpDelete(
        baseUrl,
        `/session/${encodeURIComponent(sessionId)}`,
        directory,
      );
    },

    setBaseUrl(url: string) {
      baseUrl = url.replace(/\/+$/, "");
    },
  };
}

/** extras.agent → nombre de agente OpenCode (`GET /agent`). */
function mapAgentMode(extras: Record<string, unknown>): string | null {
  const raw = extras.agent;
  if (typeof raw !== "string" || raw === "") return null;
  if (raw === "agent") return "build";
  if (raw === "ask") return "general";
  if (raw === "plan" || raw === "build" || raw === "general" || raw === "explore") {
    return raw;
  }
  return raw;
}

type MessageRow = {
  info?: { role?: string };
  parts?: Array<{
    type?: string;
    text?: string;
    state?: { status?: string };
  }>;
};

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
  return ctrl.signal;
}

function hasRunningTool(rows: MessageRow[]): boolean {
  const assistants = rows.filter((row) => row.info?.role === "assistant");
  const last = assistants[assistants.length - 1];
  if (last?.parts == null) return false;
  for (const part of last.parts) {
    if (part.type !== "tool") continue;
    const status = part.state?.status;
    if (status === "running" || status === "pending") return true;
  }
  return false;
}

function latestAssistantText(rows: MessageRow[]): {
  text: string;
  reasoning: string;
} {
  const assistants = rows.filter((row) => row.info?.role === "assistant");
  const last = assistants[assistants.length - 1];
  if (last == null) return { text: "", reasoning: "" };

  let text = "";
  let reasoning = "";
  for (const part of last.parts ?? []) {
    if (part.type === "text" && typeof part.text === "string") text += part.text;
    if (part.type === "reasoning" && typeof part.text === "string") {
      reasoning += part.text;
    }
  }
  return { text, reasoning };
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
