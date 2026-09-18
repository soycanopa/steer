// AgentPort — ARCHITECTURE §4. Contrato estable; los adapters lo implementan.
// La UI nunca lo implementa. Un provider nuevo = un package @steer/agent-<id>.

import type { AgentTodo, ApplyPayload } from "@steer/domain";

export type ProviderId = string; // "opencode" | "cursor" | "grok-build" | "claude-code" | "acp:<name>"
export type SessionId = string;

/** Modo de agente que el adapter mapea a su nomenclatura (build/ask/plan). */
export type AgentMode = "ask" | "plan" | "agent";

export type ModelParamDef = {
  id: string;
  label: string;
  values: Array<{ value: string; label: string }>;
};

export type ModelRef = {
  providerId: ProviderId;
  /**
   * AgentPort.id que listó este modelo. OpenCode rellena providerId con el
   * vendor conectado (anthropic, …); adapterId sigue siendo "opencode".
   */
  adapterId?: ProviderId;
  modelId: string;
  label: string;
  capabilities: {
    reasoning: boolean;
    effort: boolean;
    /** Variantes OpenCode soportadas (low / high / max). Vacío = todas si reasoning. */
    reasoningVariants?: ("low" | "high" | "max")[];
    images: boolean;
    tools: boolean;
    /**
     * Knobs del catálogo del provider (Cursor: `fast`, `optimize_for`…).
     * La UI no inventa ids; solo pinta lo que listModels() trajo.
     */
    params?: ModelParamDef[];
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
  /** Snapshot completo de la lista de tareas del agente (todo.updated,
   * todowrite…). El adapter ya la normalizó con domain.parseTodos. */
  | { type: "todo"; todos: AgentTodo[] }
  | { type: "permission"; permissionId: string; summary: string }
  | {
      type: "question";
      questionId: string;
      questions: Array<{
        prompt: string;
        header?: string;
        options?: string[];
      }>;
    }
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
  respondQuestion?(
    sessionId: SessionId,
    questionId: string,
    answers: string[][],
    directory: string,
  ): Promise<void>;
  /** Sesiones del provider para un directorio de proyecto (P0: OpenCode). */
  listSessions?(directory: string): Promise<AgentSessionSummary[]>;
  /** Elimina una sesión remota del provider (P0: OpenCode DELETE /session/:id). */
  deleteSession?(sessionId: SessionId, directory: string): Promise<void>;
};
