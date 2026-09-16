import { describe, expect, it } from "vitest";
import { mapCursorModels } from "./map-models";

describe("mapCursorModels", () => {
  it("maps list() without hardcoding ids", () => {
    const models = mapCursorModels([
      {
        id: "composer-test",
        displayName: "Composer test",
        parameters: [
          {
            id: "reasoning",
            values: [
              { value: "low" },
              { value: "high" },
              { value: "max" },
            ],
          },
        ],
      },
      { id: "plain-model", displayName: "Plain" },
    ]);
    expect(models).toHaveLength(2);
    expect(models[0]?.adapterId).toBe("cursor");
    expect(models[0]?.providerId).toBe("cursor");
    expect(models[0]?.modelId).toBe("composer-test");
    expect(models[0]?.capabilities.reasoning).toBe(true);
    expect(models[0]?.capabilities.reasoningVariants).toEqual([
      "low",
      "high",
      "max",
    ]);
    expect(models[1]?.capabilities.reasoning).toBe(false);
  });

  it("maps catalog params like fast without treating them as reasoning", () => {
    const models = mapCursorModels([
      {
        id: "composer-fast",
        displayName: "Composer",
        parameters: [
          {
            id: "fast",
            displayName: "Fast",
            values: [
              { value: "false" },
              { value: "true", displayName: "Fast" },
            ],
          },
        ],
      },
    ]);
    expect(models[0]?.capabilities.reasoning).toBe(false);
    expect(models[0]?.capabilities.params).toEqual([
      {
        id: "fast",
        label: "Fast",
        values: [
          { value: "false", label: "Normal" },
          { value: "true", label: "Fast" },
        ],
      },
    ]);
  });
});
