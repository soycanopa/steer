import { describe, expect, it } from "vitest";
import { newChatSession, type ChatSession } from "./intents";
import {
  forkChatIfAdapterChanged,
  reuseAgentSessionId,
} from "./session-scope";

function session(
  patch: Partial<ChatSession> & Pick<ChatSession, "id">,
): ChatSession {
  return { ...newChatSession(), ...patch };
}

describe("reuseAgentSessionId", () => {
  it("keeps the id on the same adapter", () => {
    expect(
      reuseAgentSessionId(
        { agentSessionId: "sess-oc", agentAdapterId: "opencode" },
        "opencode",
      ),
    ).toBe("sess-oc");
  });

  it("drops the id when the adapter changed", () => {
    expect(
      reuseAgentSessionId(
        { agentSessionId: "sess-oc", agentAdapterId: "opencode" },
        "grok",
      ),
    ).toBeNull();
  });

  it("reuses a legacy snapshot without adapter id", () => {
    expect(
      reuseAgentSessionId(
        { agentSessionId: "sess-oc", agentAdapterId: null },
        "opencode",
      ),
    ).toBe("sess-oc");
  });
});

describe("forkChatIfAdapterChanged", () => {
  it("does not fork when switching models on the same adapter", () => {
    const current = session({
      id: "a",
      agentSessionId: "s1",
      agentAdapterId: "opencode",
      blocks: [{ kind: "user", id: "u", text: "hola" }],
    });
    const out = forkChatIfAdapterChanged({
      sessions: [current],
      activeSessionId: "a",
      prevAdapterId: "opencode",
      nextAdapterId: "opencode",
    });
    expect(out.activeSessionId).toBe("a");
    expect(out.sessions).toHaveLength(1);
  });

  it("forks a new empty chat when switching adapters with history", () => {
    const current = session({
      id: "a",
      agentSessionId: "s1",
      agentAdapterId: "opencode",
      blocks: [{ kind: "user", id: "u", text: "hola" }],
    });
    const out = forkChatIfAdapterChanged({
      sessions: [current],
      activeSessionId: "a",
      prevAdapterId: "opencode",
      nextAdapterId: "antigravity",
    });
    expect(out.sessions).toHaveLength(2);
    expect(out.activeSessionId).not.toBe("a");
    expect(out.sessions[0]?.agentSessionId).toBe("s1");
    expect(out.sessions[1]?.blocks).toEqual([]);
    expect(out.sessions[1]?.agentSessionId).toBeNull();
  });

  it("does not fork an empty chat", () => {
    const current = session({ id: "a" });
    const out = forkChatIfAdapterChanged({
      sessions: [current],
      activeSessionId: "a",
      prevAdapterId: "cursor",
      nextAdapterId: "grok",
    });
    expect(out.activeSessionId).toBe("a");
    expect(out.sessions).toHaveLength(1);
  });
});
