import { describe, expect, it } from "vitest";
import { mapAgyModelsOutput, parseAgyModelsOutput } from "./map-models";

describe("parseAgyModelsOutput", () => {
  it("parses tab-separated agy models rows", () => {
    const models = parseAgyModelsOutput(
      "gemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n",
    );
    expect(models.map((m) => m.id)).toEqual([
      "gemini-3.8-flash-high",
      "claude-sonnet-4-6",
    ]);
    expect(models[0]?.label).toBe("Gemini 3.8 Flash (High)");
  });
});

describe("mapAgyModelsOutput", () => {
  it("sets adapterId antigravity", () => {
    const models = mapAgyModelsOutput("gemini-fixture-high     Fixture High\n");
    expect(models[0]?.adapterId).toBe("antigravity");
    expect(models[0]?.modelId).toBe("gemini-fixture-high");
    expect(models[0]?.capabilities.reasoning).toBe(false);
    expect(models[0]?.capabilities.effort).toBe(false);
  });
});
