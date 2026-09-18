import { describe, expect, it } from "vitest";
import { createAgyEventMapper } from "./map-events";

describe("createAgyEventMapper", () => {
  it("maps init, text delta, tool, and result", () => {
    const map = createAgyEventMapper();
    expect(
      map(
        {
          event: "init",
          conversation_id: "c1",
          init: { cwd: "/tmp" },
        },
        null,
      ),
    ).toEqual([{ type: "session", sessionId: "c1" }]);
    expect(
      map(
        {
          event: "step_update",
          step_update: {
            conversation_id: "c1",
            step_type: "agent_response",
            state: "ACTIVE",
            text_delta: "hola",
          },
        },
        "c1",
      ),
    ).toEqual([{ type: "text-delta", text: "hola" }]);
    expect(
      map(
        {
          event: "step_update",
          step_update: {
            conversation_id: "c1",
            step_type: "thinking",
            state: "ACTIVE",
            thought_delta: "veo el repo",
          },
        },
        "c1",
      ),
    ).toEqual([{ type: "reasoning-delta", text: "veo el repo" }]);
    expect(
      map(
        {
          event: "result",
          result: { conversation_id: "c1", status: "SUCCESS", response: "hola" },
        },
        "c1",
      ),
    ).toEqual([{ type: "done" }]);
  });

  it("tool step de todos emite tool + todo (args en ACTIVE, tool_info en DONE)", () => {
    const map = createAgyEventMapper();
    map({ event: "init", conversation_id: "c1", init: { cwd: "/tmp" } }, null);
    expect(
      map(
        {
          event: "step_update",
          step_update: {
            conversation_id: "c1",
            step_type: "tool",
            step_index: "3",
            state: "ACTIVE",
            tool_name: "todowrite",
            tool_args: {
              todos: [
                { content: "Explorar", status: "completed" },
                { content: "Editar", status: "in_progress" },
              ],
            },
          },
        },
        "c1",
      ),
    ).toEqual([
      { type: "tool", id: "3-todowrite", name: "todowrite", status: "start" },
      {
        type: "todo",
        todos: [
          { id: "todo-1", content: "Explorar", status: "completed" },
          { id: "todo-2", content: "Editar", status: "in_progress" },
        ],
      },
    ]);
    expect(
      map(
        {
          event: "step_update",
          step_update: {
            conversation_id: "c1",
            step_type: "tool",
            step_index: "3",
            state: "DONE",
            tool_name: "todowrite",
            tool_info: { updated: 2 },
          },
        },
        "c1",
      ),
    ).toEqual([
      expect.objectContaining({ type: "tool", id: "3-todowrite", status: "end" }),
    ]);
  });
});
