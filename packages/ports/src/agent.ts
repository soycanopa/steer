// AgentPort — ARCHITECTURE §4. Contrato estable; los adapters lo implementan.
// La UI nunca lo implementa. Un provider nuevo = un package @steer/agent-<id>.

import type { ApplyPayload } from "@steer/domain";

export type ProviderId = string; // "opencode" | "claude-code" | "grok-build" | "acp:<name>"
export type SessionId = string;

export type ModelRef = {
  providerId: ProviderId;
  modelId: string;
  label: string;
  capabilities: {
    reasoning: boolean;
    effort: boolean;
    images: boolean;
    tools: boolean;
  };
};

export type TurnRequest = {
  directory: string;
  sessionId: SessionId | null;
  model: ModelRef;
  extras: Record<string, unknown>; // reasoning.effort, temperature… el adapter interpreta
  parts: TurnPart[];
};

export type TurnPart =
  | { type: "intents"; payload: ApplyPayload }
  | { type: "text"; text: string }
  | { type: "image"; mime: "image/png"; dataBase64: string };

export type AgentEvent =
  | { type: "session"; sessionId: SessionId }
  | { type: "text-delta"; text: string }
  | { type: "tool"; name: string; status: "start" | "end"; detail?: string }
  | { type: "permission"; permissionId: string; summary: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type AgentPort = {
  readonly id: ProviderId;
  readonly label: string;
  health(): Promise<{ ok: boolean; version?: string; detail?: string }>;
  listModels(): Promise<ModelRef[]>;
  ensureRuntime?(directory: string): Promise<void>; // spawn serve si aplica
  startTurn(req: TurnRequest): AsyncIterable<AgentEvent>;
  abort(sessionId: SessionId): Promise<void>;
  respondPermission?(sessionId: SessionId, permissionId: string, accept: boolean): Promise<void>;
};
