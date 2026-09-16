// Adapter Cursor — TRD §8.1. AgentPort contra el sidecar Node del SDK
// local. La UI no importa este package; solo composition.ts.

import type {
  AgentEvent,
  AgentPort,
  ModelRef,
  SessionId,
  TurnRequest,
} from "@steer/ports";
import { httpGet, httpPost, readSse } from "./client";
import { createCursorEventMapper } from "./map-events";
import { mapCursorModels, CURSOR_ID, type CursorModelListItem } from "./map-models";
import { buildPromptImages, buildPromptText } from "./prompt";

export const AGENT_CURSOR_DEFAULT_URL = "http://127.0.0.1:4106";
export { CURSOR_ID, mapCursorModels };
export type { CursorModelListItem };

export type CursorAgentOptions = {
  baseUrl?: string;
};

export type CursorAgentPort = AgentPort & {
  setBaseUrl(url: string): void;
  /** Autoriza el SDK (login de navegador si no hay clave/store). */
  login(): Promise<void>;
};

type HealthBody = {
  ok?: boolean;
  version?: string;
  detail?: string;
  authenticated?: boolean;
  email?: string;
  cursorApp?: boolean;
};
type ModelsBody = { models?: CursorModelListItem[] };
type SessionBody = { sessionId?: string };

export function createCursorAgent(
  options: CursorAgentOptions = {},
): CursorAgentPort {
  let baseUrl = (options.baseUrl ?? AGENT_CURSOR_DEFAULT_URL).replace(
    /\/+$/,
    "",
  );
  let abortController: AbortController | null = null;

  return {
    id: CURSOR_ID,
    label: "Cursor",

    setBaseUrl(url: string) {
      baseUrl = url.replace(/\/+$/, "");
    },

    async login() {
      await httpPost(baseUrl, "/v1/login", {});
    },

    async health() {
      try {
        const body = await httpGet<HealthBody>(baseUrl, "/v1/health");
        if (body.ok !== true) {
          return {
            ok: false,
            detail: body.detail ?? `sidecar Cursor no healthy en ${baseUrl}`,
          };
        }
        if (body.authenticated === false) {
          return {
            ok: false,
            version: body.version,
            detail:
              body.detail ??
              "Cursor no está autorizado en Steer. Confirma el login en el navegador.",
          };
        }
        return {
          ok: true,
          version: body.email ?? body.version,
        };
      } catch (err) {
        return {
          ok: false,
          detail: `${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },

    async listModels(): Promise<ModelRef[]> {
      const body = await httpGet<ModelsBody>(baseUrl, "/v1/models");
      return mapCursorModels(body.models ?? []);
    },

    startTurn(req: TurnRequest): AsyncIterable<AgentEvent> {
      const ac = new AbortController();
      abortController = ac;
      const { signal } = ac;
      return (async function* (): AsyncGenerator<AgentEvent> {
        const prompt = buildPromptText(req.parts);
        const images = buildPromptImages(req.parts);
        let sessionId: SessionId | null = req.sessionId;
        if (sessionId == null || sessionId === "") {
          const created = await httpPost<SessionBody>(
            baseUrl,
            "/v1/session",
            {
              directory: req.directory,
              modelId: req.model.modelId,
              extras: req.extras,
            },
            signal,
          );
          if (typeof created?.sessionId !== "string" || created.sessionId === "") {
            yield {
              type: "error",
              message: "Cursor no devolvió sessionId",
            };
            return;
          }
          sessionId = created.sessionId;
          yield { type: "session", sessionId };
        }

        const map = createCursorEventMapper();
        let sawDone = false;
        try {
          for await (const ev of readSse(
            baseUrl,
            `/v1/session/${encodeURIComponent(sessionId)}/prompt`,
            {
              text: prompt,
              images,
              extras: req.extras,
              modelId: req.model.modelId,
              directory: req.directory,
            },
            signal,
          )) {
            const mapped = map(ev, sessionId);
            for (const item of mapped) {
              if (item.type === "done") sawDone = true;
              yield item;
            }
          }
        } catch (err) {
          if (signal.aborted) {
            yield { type: "error", message: "Turno abortado" };
            return;
          }
          yield {
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          };
          return;
        }
        if (!sawDone) {
          yield { type: "done" };
        }
      })();
    },

    async abort(sessionId: SessionId | null) {
      abortController?.abort();
      abortController = null;
      if (sessionId == null || sessionId === "") return;
      try {
        await httpPost(baseUrl, `/v1/session/${encodeURIComponent(sessionId)}/abort`, {});
      } catch {
        // best-effort
      }
    },
  };
}
