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
          event: "result",
          result: { conversation_id: "c1", status: "SUCCESS", response: "hola" },
        },
        "c1",
      ),
    ).toEqual([{ type: "done" }]);
  });
});
