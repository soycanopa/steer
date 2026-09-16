import { describe, expect, it } from "vitest";
import type { AgentPort, ModelRef } from "@steer/ports";
import { resolveAgentPort } from "./resolve-agent";

function stub(id: string): AgentPort {
  return {
    id,
    label: id,
    async health() {
      return { ok: true };
    },
    async listModels() {
      return [];
    },
    startTurn() {
      return (async function* () {})();
    },
    async abort() {},
  };
}

describe("resolveAgentPort", () => {
  const agents = [stub("opencode"), stub("cursor")];

  it("uses adapterId when present", () => {
    const model: ModelRef = {
      providerId: "cursor",
      adapterId: "cursor",
      modelId: "x",
      label: "x",
      capabilities: {
        reasoning: false,
        effort: false,
        images: true,
        tools: true,
      },
    };
    expect(resolveAgentPort(agents, model)?.id).toBe("cursor");
  });

  it("falls back to OpenCode for nested vendor ids", () => {
    const model: ModelRef = {
      providerId: "anthropic",
      adapterId: "opencode",
      modelId: "claude",
      label: "claude",
      capabilities: {
        reasoning: true,
        effort: true,
        images: false,
        tools: true,
      },
    };
    expect(resolveAgentPort(agents, model)?.id).toBe("opencode");
  });
});
