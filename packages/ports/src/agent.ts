// AgentPort — ARCHITECTURE §4. Contrato estable; los adapters lo implementan.
// La UI nunca lo implementa. Un provider nuevo = un package @steer/agent-<id>.

import type { ApplyPayload } from "@steer/domain";

export type ProviderId = string; // "opencode" | "claude-code" | "grok-build" | "acp:<name>"
export type SessionId = string;

/** Modo de agente que el adapter mapea a su nomenclatura (build/ask/plan). */
export type AgentMode = "ask" | "plan" | "agent";

export type ModelRef = {
  providerId: ProviderId;
  modelId: string;
  label: string;
  capabilities: {
    reasoning: boolean;
    effort: boolean;
    /** Variantes OpenCode soportadas (low / high / max). Vacío = todas si reasoning. */
    reasoningVariants?: ("low" | "high" | "max")[];
    images: boolean;
    tools: boolean;
  };
};

export type TurnRequest = {
  directory: string;
  sessionId: SessionId | null;
  model: ModelRef;
  extras: Record<string, unknown>; // agent mode, reasoning.effort…
  parts: TurnPart[];
};

export type TurnPart =
  | { type: "intents"; payload: ApplyPayload }
  | { type: "text"; text: string }
  | { type: "image"; mime: "image/png" | "image/jpeg"; dataBase64: string };

export type AgentEvent =
  | { type: "session"; sessionId: SessionId }
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | {
      type: "tool";
      id?: string;
      name: string;
      status: "start" | "end";
      detail?: string;
    }
  | { type: "permission"; permissionId: string; summary: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type AgentSessionSummary = {
  id: SessionId;
  title: string;
  createdAt: number;
  directory?: string | null;
};

export type AgentPort = {
  readonly id: ProviderId;
  readonly label: string;
  health(): Promise<{ ok: boolean; version?: string; detail?: string }>;
  listModels(): Promise<ModelRef[]>;
  ensureRuntime?(directory: string): Promise<void>;
  startTurn(req: TurnRequest): AsyncIterable<AgentEvent>;
  /** `sessionId` null: corta el stream local; el abort HTTP es best-effort si hay id. */
  abort(sessionId: SessionId | null): Promise<void>;
  respondPermission?(
    sessionId: SessionId,
    permissionId: string,
    accept: boolean,
    remember?: boolean,
  ): Promise<void>;
  /** Sesiones del provider para un directorio de proyecto (P0: OpenCode). */
  listSessions?(directory: string): Promise<AgentSessionSummary[]>;
};
