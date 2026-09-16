// Adapter Grok Build — TRD §8.2. AgentPort contra el sidecar que habla
// ACP (`grok agent stdio`). La UI no importa este package; solo composition.ts.

import type {
  AgentEvent,
  AgentPort,
  ModelRef,
  SessionId,
  TurnRequest,
} from "@steer/ports";
import { httpGet, httpPost, readSse } from "./client";
import { createGrokEventMapper } from "./map-events";
import { GROK_ID, mapGrokModels, mapGrokModelsOutput } from "./map-models";
import type { GrokModelListItem } from "./map-models";
import {
  buildPromptImages,
  buildPromptText,
  effortFromExtras,
} from "./prompt";

export const AGENT_GROK_DEFAULT_URL = "http://127.0.0.1:4116";
export { GROK_ID, mapGrokModels, mapGrokModelsOutput };
export type { GrokModelListItem };

export type GrokAgentOptions = {
  baseUrl?: string;
};

export type GrokAgentPort = AgentPort & {
  setBaseUrl(url: string): void;
};

type HealthBody = {
  ok?: boolean;
  version?: string;
  detail?: string;
  authenticated?: boolean;
  grokCli?: boolean;
};

type ModelsBody = {
  output?: string;
  models?: GrokModelListItem[];
  catalog?: GrokModelListItem[];
};

type SessionBody = { sessionId?: string };

export function createGrokAgent(options: GrokAgentOptions = {}): GrokAgentPort {
  let baseUrl = (options.baseUrl ?? AGENT_GROK_DEFAULT_URL).replace(/\/+$/, "");
  let abortController: AbortController | null = null;

  return {
    id: GROK_ID,
    label: "Grok",

    setBaseUrl(url: string) {
      baseUrl = url.replace(/\/+$/, "");
    },

    async health() {
      try {
        const body = await httpGet<HealthBody>(baseUrl, "/v1/health");
        if (body.ok !== true) {
          return {
            ok: false,
            detail: body.detail ?? `sidecar Grok no healthy en ${baseUrl}`,
          };
        }
        if (body.authenticated === false) {
          return {
            ok: false,
            version: body.version,
            detail:
              body.detail ??
              "Grok no está autorizado. Ejecuta `grok login` o define XAI_API_KEY.",
          };
        }
        return {
          ok: true,
          version: body.version,
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
      const catalog = body.catalog ?? [];
      if (Array.isArray(body.models) && body.models.length > 0) {
        return mapGrokModels(body.models, catalog);
      }
      return mapGrokModelsOutput(body.output ?? "", catalog);
    },

    startTurn(req: TurnRequest): AsyncIterable<AgentEvent> {
      const ac = new AbortController();
      abortController = ac;
      const { signal } = ac;
      return (async function* (): AsyncGenerator<AgentEvent> {
        const prompt = buildPromptText(req.parts);
        const images = buildPromptImages(req.parts);
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
              message: "Grok no devolvió sessionId",
            };
            return;
          }
          sessionId = created.sessionId;
          yield { type: "session", sessionId };
        }

        const map = createGrokEventMapper();
        let sawDone = false;
        try {
          for await (const ev of readSse(
            baseUrl,
            `/v1/session/${encodeURIComponent(sessionId)}/prompt`,
            {
              text: prompt,
              images,
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
