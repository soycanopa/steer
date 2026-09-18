import { describe, expect, it } from "vitest";
import type { ApplyPayload } from "./intent";
import { serializeTurn, TURN_GUIDELINES } from "./serialize-turn";

const payload: ApplyPayload = {
  projectRoot: "/tmp/proj",
  route: "/",
  intents: [
    {
      id: "t1",
      kind: "tweak",
      at: 1,
      scope: "instance",
      prop: "fontSize",
      from: "32px",
      to: "40px",
      selection: {
        source: { file: "src/components/Hero.tsx", line: 42, col: 6 },
        component: "Hero",
        route: "/",
        tag: "h1",
        textPreview: "Hola",
        computed: {},
        breadcrumb: ["Hero", "h1"],
      },
    },
    {
      id: "c1",
      kind: "comment",
      at: 2,
      scope: "instance",
      pin: 1,
      body: "Más display, menos UI copy.",
      selection: {
        source: { file: "src/components/Hero.tsx", line: 42, col: 6 },
        component: "Hero",
        route: "/",
        tag: "h1",
        textPreview: "Hola",
        computed: {},
        breadcrumb: ["Hero", "h1"],
      },
    },
  ],
  userNote: "nota del usuario",
};

describe("serializeTurn", () => {
  it("incluye reglas, JSON y resumen humano", () => {
    const text = serializeTurn(payload);
    expect(text).toContain("El usuario dirigió la UI");
    expect(text).toContain("No commitees");
    expect(text).toContain("INTENTS_JSON");
    expect(text).toContain('"projectRoot": "/tmp/proj"');
    expect(text).toContain("Resumen humano");
    expect(text).toContain(
      "- [tweak] src/components/Hero.tsx:42 fontSize 32px → 40px (scope: instance)",
    );
    expect(text).toContain(
      '- [comment #1] src/components/Hero.tsx:42 “Más display, menos UI copy.”',
    );
  });

  it("es snapshot-estable para el mismo payload", () => {
    const a = serializeTurn(payload);
    const b = serializeTurn(payload);
    expect(a).toBe(b);
  });
});

describe("TURN_GUIDELINES", () => {
  it("pide tareas vivas, markdown corto, reporte por partes y conservar la inspección", () => {
    expect(TURN_GUIDELINES).toContain("mantenla viva");
    expect(TURN_GUIDELINES).toContain("in_progress");
    expect(TURN_GUIDELINES).toContain("markdown");
    expect(TURN_GUIDELINES).toContain("Nunca un solo bloque");
    expect(TURN_GUIDELINES).toContain("mensaje breve");
    expect(TURN_GUIDELINES).toContain("devtools-vite");
    expect(TURN_GUIDELINES).toContain("{...props}");
  });

  it("es determinista", () => {
    expect(TURN_GUIDELINES).toBe(TURN_GUIDELINES);
  });
});
