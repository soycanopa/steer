// resolveAgentPort — elige AgentPort por ModelRef.adapterId (ARCHITECTURE §5).

import type { AgentPort, ModelRef } from "@steer/ports";

export function resolveAgentPort(
  agents: AgentPort[],
  model: ModelRef | null,
): AgentPort | null {
  if (agents.length === 0) return null;
  if (model == null) return agents[0] ?? null;
  const adapterId =
    model.adapterId ??
    (agents.some((a) => a.id === model.providerId)
      ? model.providerId
      : undefined);
  if (adapterId != null) {
    return agents.find((a) => a.id === adapterId) ?? agents[0] ?? null;
  }
  return agents.find((a) => a.id === "opencode") ?? agents[0] ?? null;
}
