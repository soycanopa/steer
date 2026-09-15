// agentSlice — estado del AgentPort seleccionado (TRD §10). app-state
// solo ve el contrato de packages/ports; los adapters se inyectan.

import type { AgentMode, AgentPort, AgentSessionSummary, ModelRef } from "@steer/ports";

export type AgentStatus = "unknown" | "checking" | "up" | "down";

/** Default = cada tool una vez; always = auto-aprobar. */
export type PermissionPolicy = "default" | "always";

/** Nivel de reasoning cuando el modelo lo soporta (OpenCode extras). */
export type ReasoningEffort = "low" | "high" | "max";

export type AgentSlice = {
  /** Ports disponibles (composition root). El seleccionado es el primero. */
  agentPorts: AgentPort[];
  agentStatus: AgentStatus;
  agentDetail: string | null;
  agentModels: ModelRef[];
  selectedModel: ModelRef | null;
  /** Effort de reasoning del modelo seleccionado. */
  reasoningEffort: ReasoningEffort;
  /** Modo ask | plan | agent (build). */
  agentMode: AgentMode;
  permissionPolicy: PermissionPolicy;
  /** Sesiones OpenCode del proyecto abierto (cache al abrir el picker). */
  agentSessions: AgentSessionSummary[];
  /** true mientras corre un startTurn. */
  agentBusy: boolean;
};

export function initialAgentSlice(agents: AgentPort[] = []): AgentSlice {
  return {
    agentPorts: agents,
    agentStatus: "unknown",
    agentDetail: null,
    agentModels: [],
    selectedModel: null,
    reasoningEffort: "high",
    agentMode: "agent",
    permissionPolicy: "default",
    agentSessions: [],
    agentBusy: false,
  };
}

/** Modelo por defecto para P0: el primero que devuelve listModels(). */
export function pickDefaultModel(models: ModelRef[]): ModelRef | null {
  return models[0] ?? null;
}
