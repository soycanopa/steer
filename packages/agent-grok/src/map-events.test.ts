import { describe, expect, it } from "vitest";
import { createGrokEventMapper } from "./map-events";

describe("createGrokEventMapper", () => {
  it("maps streaming-json text, thought, tools, and end", () => {
    const map = createGrokEventMapper();
    expect(map({ type: "session", sessionId: "s1" }, null)).toEqual([
      { type: "session", sessionId: "s1" },
    ]);
    expect(map({ type: "thought", data: "hmm" }, "s1")).toEqual([
      { type: "reasoning-delta", text: "hmm" },
    ]);
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
});
