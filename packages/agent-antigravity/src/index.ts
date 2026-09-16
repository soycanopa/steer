// Adapter Antigravity — AgentPort contra sidecar Node que encapsula `agy`
// headless (`--input-format stream-json`). La UI no importa este package.

import type {
  AgentEvent,
  AgentPort,
  ModelRef,
  SessionId,
  TurnRequest,
} from "@steer/ports";
import { httpGet, httpPost, readSse } from "./client";
import { createAgyEventMapper } from "./map-events";
import { ANTIGRAVITY_ID, mapAgyModels, mapAgyModelsOutput } from "./map-models";
import type { AgyModelListItem } from "./map-models";
import { buildPromptText, effortFromExtras } from "./prompt";

export const AGENT_ANTIGRAVITY_DEFAULT_URL = "http://127.0.0.1:4126";
export { ANTIGRAVITY_ID, mapAgyModels, mapAgyModelsOutput };
export type { AgyModelListItem };

export type AntigravityAgentOptions = {
  baseUrl?: string;
};

export type AntigravityAgentPort = AgentPort & {
  setBaseUrl(url: string): void;
};

type HealthBody = {
  ok?: boolean;
  version?: string;
  detail?: string;
  authenticated?: boolean;
};

type ModelsBody = {
  output?: string;
  models?: AgyModelListItem[];
};

type SessionBody = { sessionId?: string };

export function createAntigravityAgent(
  options: AntigravityAgentOptions = {},
): AntigravityAgentPort {
  let baseUrl = (options.baseUrl ?? AGENT_ANTIGRAVITY_DEFAULT_URL).replace(
    /\/+$/,
    "",
  );
  let abortController: AbortController | null = null;

  return {
    id: ANTIGRAVITY_ID,
    label: "Antigravity",

    setBaseUrl(url: string) {
      baseUrl = url.replace(/\/+$/, "");
    },

    async health() {
      try {
        const body = await httpGet<HealthBody>(baseUrl, "/v1/health");
        if (body.ok !== true) {
          return {
            ok: false,
            detail: body.detail ?? `sidecar Antigravity no healthy en ${baseUrl}`,
          };
        }
        if (body.authenticated === false) {
          return {
            ok: false,
            version: body.version,
            detail:
              body.detail ??
              "Antigravity no está autorizado. Abre `agy` e inicia sesión, o define GEMINI_API_KEY.",
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
      const body = await httpGet<ModelsBody>(baseUrl, "/v1/models");
      if (Array.isArray(body.models) && body.models.length > 0) {
        return mapAgyModels(body.models);
      }
      return mapAgyModelsOutput(body.output ?? "");
    },

    startTurn(req: TurnRequest): AsyncIterable<AgentEvent> {
      const ac = new AbortController();
      abortController = ac;
      const { signal } = ac;
      return (async function* (): AsyncGenerator<AgentEvent> {
        const prompt = buildPromptText(req.parts);
        const effort = effortFromExtras(req.extras);
        let sessionId: SessionId | null = req.sessionId;
        if (sessionId == null || sessionId === "") {
          const created = await httpPost<SessionBody>(
            baseUrl,
            "/v1/session",
            {
              directory: req.directory,
              modelId: req.model.modelId,
              effort,
            },
            signal,
          );
          if (typeof created?.sessionId !== "string" || created.sessionId === "") {
            yield {
              type: "error",
              message: "Antigravity no devolvió sessionId",
            };
            return;
          }
          sessionId = created.sessionId;
          yield { type: "session", sessionId };
        }

        const map = createAgyEventMapper();
        let sawDone = false;
        try {
          for await (const ev of readSse(
            baseUrl,
            `/v1/session/${encodeURIComponent(sessionId)}/prompt`,
            {
              text: prompt,
              effort,
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
        await httpPost(
          baseUrl,
          `/v1/session/${encodeURIComponent(sessionId)}/abort`,
          {},
        );
      } catch {
        // best-effort
      }
    },
  };
}
