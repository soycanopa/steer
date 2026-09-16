import { describe, expect, it } from "vitest";
import { mapGrokModelsOutput, parseGrokModelsOutput } from "./map-models";

describe("parseGrokModelsOutput", () => {
  it("parses grok models text without hardcoding ids", () => {
    const output = `You are logged in with grok.com.

Default model: grok-example-default

Available models:
  * grok-example-default (default)
  - grok-example-alt
`;
    const models = parseGrokModelsOutput(output);
    expect(models.map((m) => m.id)).toEqual([
      "grok-example-default",
      "grok-example-alt",
    ]);
    expect(models[0]?.isDefault).toBe(true);
  });

  it("parses JSON catalogs from the CLI", () => {
    const models = parseGrokModelsOutput(
      JSON.stringify({
        default: "alpha",
        models: [{ id: "alpha", name: "Alpha" }, { id: "beta" }],
      }),
    );
    expect(models).toMatchObject([
      { id: "alpha", label: "Alpha", isDefault: true },
      { id: "beta", label: "beta", isDefault: false },
    ]);
  });
});

describe("mapGrokModelsOutput", () => {
  it("sets adapterId grok and keeps catalog ids", () => {
    const models = mapGrokModelsOutput(`
Available models:
  - catalog-one
`);
    expect(models).toHaveLength(1);
    expect(models[0]?.adapterId).toBe("grok");
    expect(models[0]?.providerId).toBe("grok");
    expect(models[0]?.modelId).toBe("catalog-one");
    expect(models[0]?.capabilities.reasoning).toBe(false);
  });

  it("maps catalog effort levels without inventing ids", () => {
    const models = mapGrokModelsOutput(`Available models:\n  - catalog-one\n`, [
      {
        id: "catalog-one",
        label: "Catalog One",
        supportsReasoningEffort: true,
        reasoningEfforts: [
          { value: "xhigh", label: "Extra High" },
          { value: "high", label: "High" },
          { value: "low", label: "Low" },
        ],
      },
    ]);
    expect(models[0]?.label).toBe("Catalog One");
    expect(models[0]?.capabilities.reasoning).toBe(true);
    expect(models[0]?.capabilities.reasoningVariants).toEqual([
      "low",
      "high",
      "max",
    ]);
  });
});
