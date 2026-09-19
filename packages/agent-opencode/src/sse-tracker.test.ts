import { describe, expect, it } from "vitest";
import { buildOpenCodeParts, buildPromptText, createSsePartTracker } from "./index";

const SID = "ses_1";

describe("createSsePartTracker — eventos v2", () => {
  it("session.text.delta emite text-delta", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "session.text.delta",
          data: { sessionID: SID, assistantMessageID: "msg_1", delta: "Hola" },
        },
        SID,
      ),
    ).toEqual({ type: "text-delta", text: "Hola" });
  });

  it("session.reasoning.delta emite reasoning-delta", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "session.reasoning.delta",
          data: { sessionID: SID, delta: "pensando" },
        },
        SID,
      ),
    ).toEqual({ type: "reasoning-delta", text: "pensando" });
  });

  it("eventos de otra sesión se descartan", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "session.text.delta",
          data: { sessionID: "ses_otra", delta: "x" },
        },
        SID,
      ),
    ).toBeNull();
  });

  it("server.connected no produce eventos", () => {
    const map = createSsePartTracker().map;
    expect(map({ type: "server.connected", data: {} }, SID)).toBeNull();
  });

  it("session.execution.succeeded del turno activo emite done (cierre v2)", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        { type: "session.execution.succeeded", data: { sessionID: SID } },
        SID,
      ),
    ).toEqual({ type: "done" });
  });

  it("session.idle del session activo emite done", () => {
    const map = createSsePartTracker().map;
    expect(
      map({ type: "session.idle", data: { sessionID: SID } }, SID),
    ).toEqual({ type: "done" });
  });

  it("session.execution.failed emite error con el mensaje del server", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "session.execution.failed",
          data: {
            sessionID: SID,
            error: { type: "provider", message: "quota exceeded" },
          },
        },
        SID,
      ),
    ).toEqual({ type: "error", message: "quota exceeded" });
  });

  it("session.execution.interrupted emite done", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        { type: "session.execution.interrupted", data: { sessionID: SID, reason: "user" } },
        SID,
      ),
    ).toEqual({ type: "done" });
  });

  it("tool: input.started abre, success cierra con el nombre recordado", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "session.tool.input.started",
          data: { sessionID: SID, id: "tool_1", name: "read" },
        },
        SID,
      ),
    ).toEqual({ type: "tool", id: "tool_1", name: "read", status: "start" });
    expect(
      map(
        {
          type: "session.tool.success",
          data: { sessionID: SID, id: "tool_1", content: [] },
        },
        SID,
      ),
    ).toEqual({ type: "tool", id: "tool_1", name: "read", status: "end" });
  });

  it("tool.failed cierra con el error como detail", () => {
    const map = createSsePartTracker().map;
    map(
      {
        type: "session.tool.input.started",
        data: { sessionID: SID, id: "tool_2", name: "bash" },
      },
      SID,
    );
    expect(
      map(
        {
          type: "session.tool.failed",
          data: {
            sessionID: SID,
            id: "tool_2",
            error: { type: "tool", message: "exit 1" },
          },
        },
        SID,
      ),
    ).toEqual({
      type: "tool",
      id: "tool_2",
      name: "bash",
      status: "end",
      detail: "exit 1",
    });
  });

  it("todowrite: tool.called con input emite el snapshot normalizado", () => {
    const map = createSsePartTracker().map;
    map(
      {
        type: "session.tool.input.started",
        data: { sessionID: SID, id: "tool_3", name: "todowrite" },
      },
      SID,
    );
    expect(
      map(
        {
          type: "session.tool.called",
          data: {
            sessionID: SID,
            id: "tool_3",
            input: {
              todos: [
                { id: "t1", content: "Explorar", status: "completed" },
                { content: "Editar", status: "in_progress" },
              ],
            },
          },
        },
        SID,
      ),
    ).toEqual({
      type: "todo",
      todos: [
        { id: "t1", content: "Explorar", status: "completed" },
        { id: "todo-2", content: "Editar", status: "in_progress" },
      ],
    });
  });

  it("todowrite: input.ended con args JSON emite todo (fallback)", () => {
    const map = createSsePartTracker().map;
    map(
      {
        type: "session.tool.input.started",
        data: { sessionID: SID, id: "tool_4", name: "write_todos" },
      },
      SID,
    );
    expect(
      map(
        {
          type: "session.tool.input.ended",
          data: {
            sessionID: SID,
            id: "tool_4",
            text: JSON.stringify({
              todos: [{ content: "Uno", status: "in_progress" }],
            }),
          },
        },
        SID,
      ),
    ).toEqual({
      type: "todo",
      todos: [{ id: "todo-1", content: "Uno", status: "in_progress" }],
    });
  });

  it("permission.asked mapea action+resources al summary", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "permission.asked",
          data: {
            id: "per_1",
            sessionID: SID,
            action: "edit",
            resources: ["src/App.tsx"],
          },
        },
        SID,
      ),
    ).toEqual({
      type: "permission",
      permissionId: "per_1",
      summary: "edit · src/App.tsx",
    });
  });

  it("permission.asked usa message si viene", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "permission.asked",
          data: {
            id: "per_2",
            sessionID: SID,
            action: "shell",
            resources: [],
            message: "Run npm test?",
          },
        },
        SID,
      ),
    ).toEqual({
      type: "permission",
      permissionId: "per_2",
      summary: "Run npm test?",
    });
  });

  it("form.created mapea fields visibles a preguntas con labels", () => {
    const map = createSsePartTracker().map;
    expect(
      map(
        {
          type: "form.created",
          data: {
            form: {
              id: "form_1",
              sessionID: SID,
              title: "Details",
              fields: [
                {
                  key: "stack",
                  title: "Which stack?",
                  type: "string",
                  options: [
                    { value: "tanstack", label: "TanStack Start" },
                    { value: "next", label: "Next" },
                  ],
                },
                { key: "secret", title: "Hidden", hidden: true },
              ],
            },
          },
        },
        SID,
      ),
    ).toEqual({
      type: "question",
      questionId: "form_1",
      questions: [
        {
          prompt: "Which stack?",
          options: ["TanStack Start", "Next"],
        },
      ],
    });
  });
});

describe("buildOpenCodeParts / buildPromptText — v2", () => {
  it("arma texto y files data-URL", () => {
    const body = buildOpenCodeParts([
      { type: "text", text: "Cambia el color" },
      { type: "image", mime: "image/png", dataBase64: "QUJD" },
    ]);
    expect(body.text).toContain("Cambia el color");
    expect(body.files).toEqual([
      { uri: "data:image/png;base64,QUJD", name: "preview-1.png" },
    ]);
  });

  it("buildPromptText nota las imágenes en el texto", () => {
    const text = buildPromptText([
      { type: "image", mime: "image/jpeg", dataBase64: "x" },
    ]);
    expect(text).toBe("[image attached]");
  });
});
