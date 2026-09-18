import { describe, expect, it } from "vitest";
import { createSsePartTracker } from "./index";

describe("createSsePartTracker — todos", () => {
  it("todo.updated del session activo emite el snapshot normalizado", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "todo.updated",
          properties: {
            sessionID: "ses-1",
            todos: [
              { id: "t1", content: "Explorar", status: "completed" },
              { content: "Editar", status: "in_progress" },
            ],
          },
        },
        "ses-1",
      ),
    ).toEqual({
      type: "todo",
      todos: [
        { id: "t1", content: "Explorar", status: "completed" },
        { id: "todo-2", content: "Editar", status: "in_progress" },
      ],
    });
  });

  it("todo.updated de otra sesión se descarta", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "todo.updated",
          properties: {
            sessionID: "otra",
            todos: [{ content: "X", status: "pending" }],
          },
        },
        "ses-1",
      ),
    ).toBeNull();
  });

  it("fallback: tool part todowrite con state.input emite todo", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "message.part.updated",
          properties: {
            part: {
              id: "p1",
              messageID: "m1",
              type: "tool",
              tool: "todowrite",
              state: {
                status: "running",
                input: {
                  todos: [{ content: "Uno", status: "in_progress" }],
                },
              },
            },
          },
        },
        "ses-1",
      ),
    ).toEqual({
      type: "todo",
      todos: [{ id: "todo-1", content: "Uno", status: "in_progress" }],
    });
  });

  it("tool part normal sigue emitiendo tool", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "message.part.updated",
          properties: {
            part: {
              id: "p2",
              messageID: "m1",
              type: "tool",
              tool: "read",
              state: { status: "running" },
            },
          },
        },
        "ses-1",
      ),
    ).toEqual({
      type: "tool",
      id: "p2",
      name: "read",
      status: "start",
      detail: undefined,
    });
  });
});
