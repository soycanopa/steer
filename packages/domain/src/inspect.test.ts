import { describe, expect, it } from "vitest";
import { inspectKind, isFlexOrGrid } from "./inspect";

describe("inspectKind", () => {
  it("textos y headings", () => {
    expect(inspectKind({ tag: "h1" })).toBe("text");
    expect(inspectKind({ tag: "span" })).toBe("text");
    expect(inspectKind({ tag: "p" })).toBe("text");
    expect(inspectKind({ tag: "button" })).toBe("text");
  });

  it("imágenes y media", () => {
    expect(inspectKind({ tag: "img" })).toBe("image");
    expect(inspectKind({ tag: "svg" })).toBe("image");
    expect(inspectKind({ tag: "video" })).toBe("image");
  });

  it("cajas / layout", () => {
    expect(inspectKind({ tag: "div" })).toBe("box");
    expect(inspectKind({ tag: "section" })).toBe("box");
    expect(inspectKind({ tag: "ul" })).toBe("box");
  });
});

describe("isFlexOrGrid", () => {
  it("detecta flex y grid", () => {
    expect(isFlexOrGrid({ display: "flex" })).toBe(true);
    expect(isFlexOrGrid({ display: "inline-flex" })).toBe(true);
    expect(isFlexOrGrid({ display: "grid" })).toBe(true);
    expect(isFlexOrGrid({ display: "block" })).toBe(false);
  });
});
