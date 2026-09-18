import { describe, expect, it } from "vitest";
import { computedMatchesTweak } from "./tweaks";

describe("computedMatchesTweak", () => {
  it("acepta el mismo px y un redondeo chico", () => {
    expect(computedMatchesTweak("fontSize", "40px", "40px")).toBe(true);
    expect(computedMatchesTweak("fontSize", "39.6px", "40px")).toBe(true);
    expect(computedMatchesTweak("fontSize", "24px", "40px")).toBe(false);
  });

  it("compara colores rgb/hex", () => {
    expect(computedMatchesTweak("color", "rgb(91, 140, 255)", "#5b8cff")).toBe(
      true,
    );
    expect(computedMatchesTweak("color", "#111111", "#ffffff")).toBe(false);
  });

  it("normaliza text-align start/left", () => {
    expect(computedMatchesTweak("textAlign", "start", "left")).toBe(true);
    expect(computedMatchesTweak("textAlign", "center", "left")).toBe(false);
  });

  it("compara copy de text por whitespace", () => {
    expect(
      computedMatchesTweak("text", "Hola  mundo", "Hola mundo"),
    ).toBe(true);
    expect(computedMatchesTweak("text", "Hola", "Chau")).toBe(false);
  });
});
