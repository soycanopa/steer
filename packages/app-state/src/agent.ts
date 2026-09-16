// agentSlice — estado del AgentPort seleccionado (TRD §10). app-state
// solo ve el contrato de packages/ports; los adapters se inyectan.

import type {
  AgentMode,
  AgentPort,
  AgentSessionSummary,
  ModelParamDef,
  ModelRef,
} from "@steer/ports";

export type AgentStatus = "unknown" | "checking" | "up" | "down";

/** Default = cada tool una vez; always = auto-aprobar. */
export type PermissionPolicy = "default" | "always";

/** Nivel de reasoning cuando el modelo lo soporta (OpenCode extras). */
export type ReasoningEffort = "low" | "high" | "max";

export type AgentSlice = {
  /** Ports disponibles (composition root). Apply usa resolveAgentPort. */
  agentPorts: AgentPort[];
  agentStatus: AgentStatus;
  agentDetail: string | null;
  agentModels: ModelRef[];
  selectedModel: ModelRef | null;
  /** Effort de reasoning del modelo seleccionado. */
  reasoningEffort: ReasoningEffort;
  /** Valores de capabilities.params (id → value del catálogo). */
  modelParamValues: Record<string, string>;
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
    modelParamValues: {},
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

export function pickParamValues(
  params: ModelParamDef[] | undefined,
  prev: Record<string, string> = {},
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const param of params ?? []) {
    const allowed = new Set(param.values.map((v) => v.value));
    const keep = prev[param.id];
    if (keep != null && allowed.has(keep)) {
      next[param.id] = keep;
      continue;
    }
    const first = param.values[0]?.value;
    if (first != null) next[param.id] = first;
  }
  return next;
}
