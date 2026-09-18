import { describe, expect, it } from "vitest";
import { createGrokEventMapper } from "./map-events";

describe("createGrokEventMapper", () => {
  it("maps streaming-json text, thought, tools, and end", () => {
    const map = createGrokEventMapper();
    expect(map({ type: "session", sessionId: "s1" }, null)).toEqual([
      { type: "session", sessionId: "s1" },
    ]);
    expect(map({ type: "thinking", data: "hmm2" }, "s1")).toEqual([
      { type: "reasoning-delta", text: "hmm2" },
    ]);
    expect(
      map({ type: "thought", data: { type: "text", text: "plan anidado" } }, "s1"),
    ).toEqual([{ type: "reasoning-delta", text: "plan anidado" }]);
    expect(
      map(
        {
          type: "thought",
          data: [
            { type: "text", text: "uno " },
            { type: "text", text: "dos" },
          ],
        },
        "s1",
      ),
    ).toEqual([{ type: "reasoning-delta", text: "uno dos" }]);
    expect(map({ type: "text", data: "hola" }, "s1")).toEqual([
      { type: "text-delta", text: "hola" },
    ]);
    expect(
      map(
        {
          type: "tool_call",
          toolCallId: "c1",
          toolName: "read_file",
          status: "in_progress",
          rawInput: { path: "a.ts" },
        },
        "s1",
      ),
    ).toMatchObject([
      { type: "tool", id: "c1", name: "read_file", status: "start" },
    ]);
    expect(map({ type: "end", sessionId: "s1" }, "s1")).toEqual([
      { type: "done" },
    ]);
  });

  it("tool sin toolName toma el nombre de rawInput.type", () => {
    const map = createGrokEventMapper();
    map({ type: "session", sessionId: "s1" }, null);
    expect(
      map(
        {
          type: "tool_call",
          toolCallId: "c7",
          status: "in_progress",
          rawInput: { type: "ListDir", path: "." },
        },
        "s1",
      ),
    ).toEqual([
      {
        type: "tool",
        id: "c7",
        name: "ListDir",
        status: "start",
        detail: '{"type":"ListDir","path":"."}',
      },
    ]);
  });

  it("tool_call de todos emite tool + todo; el update también", () => {
    const map = createGrokEventMapper();
    map({ type: "session", sessionId: "s1" }, null);
    expect(
      map(
        {
          type: "tool_call",
          toolCallId: "c9",
          toolName: "todo_write",
          status: "in_progress",
          rawInput: {
            todos: [
              { content: "Uno", status: "in_progress" },
              { content: "Dos", status: "pending" },
            ],
          },
        },
        "s1",
      ),
    ).toEqual([
      expect.objectContaining({ type: "tool", id: "c9", name: "todo_write" }),
      {
        type: "todo",
        todos: [
          { id: "todo-1", content: "Uno", status: "in_progress" },
          { id: "todo-2", content: "Dos", status: "pending" },
        ],
      },
    ]);
    expect(
      map(
        {
          type: "tool_call_update",
          toolCallId: "c9",
          toolName: "todo_write",
          status: "completed",
          rawOutput: { plan: ["Uno", "Dos", "Tres"] },
        },
        "s1",
      ),
    ).toEqual([
      expect.objectContaining({ type: "tool", name: "todo_write", status: "end" }),
      {
        type: "todo",
        todos: [
          { id: "todo-1", content: "Uno", status: "pending" },
          { id: "todo-2", content: "Dos", status: "pending" },
          { id: "todo-3", content: "Tres", status: "pending" },
        ],
      },
    ]);
  });
});
