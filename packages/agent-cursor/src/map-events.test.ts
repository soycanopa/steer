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
    expect(
      map({ type: "thinking", text: "mirando el cwd" }, "agent-1"),
    ).toEqual([{ type: "reasoning-delta", text: "mirando el cwd" }]);
    expect(map({ type: "done" }, "agent-1")).toEqual([{ type: "done" }]);
  });

  it("tool_call de todos emite tool + todo", () => {
    const map = createCursorEventMapper();
    map({ type: "system", agent_id: "agent-1" }, null);
    expect(
      map(
        {
          type: "tool_call",
          call_id: "c2",
          name: "todowrite",
          status: "running",
          args: {
            todos: [
              { content: "Explorar", status: "completed" },
              { content: "Editar", status: "in_progress" },
            ],
          },
        },
        "agent-1",
      ),
    ).toEqual([
      expect.objectContaining({ type: "tool", id: "c2", name: "todowrite" }),
      {
        type: "todo",
        todos: [
          { id: "todo-1", content: "Explorar", status: "completed" },
          { id: "todo-2", content: "Editar", status: "in_progress" },
        ],
      },
    ]);
  });

  it("un tool normal no emite todo", () => {
    const map = createCursorEventMapper();
    map({ type: "system", agent_id: "agent-1" }, null);
    expect(
      map({ type: "tool_call", call_id: "c3", name: "edit", status: "running", args: {} }, "agent-1"),
    ).toEqual([expect.objectContaining({ type: "tool", name: "edit" })]);
  });
});
