import { describe, expect, it } from "vitest";
import { extractStreamText } from "./extract-stream-text";

describe("extractStreamText", () => {
  it("acepta string plano", () => {
    expect(extractStreamText("hola")).toBe("hola");
  });

  it("acepta ContentBlock { type, text }", () => {
    expect(extractStreamText({ type: "text", text: "plan" })).toBe("plan");
  });

  it("acepta array de blocks", () => {
    expect(
      extractStreamText([
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ]),
    ).toBe("ab");
  });

  it("acepta thought / delta anidados", () => {
    expect(extractStreamText({ thought: "hmm" })).toBe("hmm");
    expect(extractStreamText({ delta: "x" })).toBe("x");
    expect(extractStreamText({ content: { text: "nested" } })).toBe("nested");
  });
});
