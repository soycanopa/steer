import { describe, expect, it } from "vitest";
import type { ApplyPayload } from "@steer/domain";
import { buildPromptText, wrapSteerWorkspace } from "./prompt";

const payload = {
  projectRoot: "/tmp/app",
  intents: [],
} as unknown as ApplyPayload;

describe("wrapSteerWorkspace", () => {
  it("prefixes PROJECT_ROOT without rewriting INTENTS_JSON", () => {
    const body = buildPromptText([
      { type: "intents", payload },
      { type: "text", text: "hola" },
    ]);
    const wrapped = wrapSteerWorkspace("/tmp/app", body);
    expect(wrapped).toContain("PROJECT_ROOT: /tmp/app");
    expect(wrapped).toContain("INTENTS_JSON");
    expect(wrapped).toContain('"projectRoot": "/tmp/app"');
    expect(wrapped).toContain("hola");
    expect(wrapped.indexOf("PROJECT_ROOT")).toBeLessThan(
      wrapped.indexOf("INTENTS_JSON"),
    );
  });
});
