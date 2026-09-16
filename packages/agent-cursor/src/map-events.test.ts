import { describe, expect, it } from "vitest";
import { createCursorEventMapper } from "./map-events";

describe("createCursorEventMapper", () => {
  it("emits session, text delta, tool, and done", () => {
    const map = createCursorEventMapper();
    expect(map({ type: "system", agent_id: "agent-1" }, null)).toEqual([
      { type: "session", sessionId: "agent-1" },
    ]);
    expect(
      map(
        {
          type: "assistant",
          agent_id: "agent-1",
          message: { content: [{ type: "text", text: "Hola" }] },
        },
        "agent-1",
      ),
    ).toEqual([{ type: "text-delta", text: "Hola" }]);
    expect(
      map(
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "Hola mundo" }] },
        },
        "agent-1",
      ),
    ).toEqual([{ type: "text-delta", text: " mundo" }]);
    expect(
      map(
        {
          type: "tool_call",
          call_id: "c1",
          name: "edit",
          status: "running",
          args: { path: "a.ts" },
        },
        "agent-1",
      ),
    ).toMatchObject([{ type: "tool", id: "c1", name: "edit", status: "start" }]);
    expect(map({ type: "done" }, "agent-1")).toEqual([{ type: "done" }]);
  });
});
