import { describe, expect, it } from "vitest";
import type { Intent, Selection } from "./intent";
import {
  buildApplyPayload,
  enqueueComment,
  enqueueTweak,
  removeIntent,
} from "./queue";

function sel(
  file = "src/components/Hero.tsx",
  line = 42,
  col = 6,
): Selection {
  return {
    source: { file, line, col },
    component: "Hero",
    route: "/",
    tag: "h1",
    textPreview: "Hola",
    computed: { fontSize: "32px" },
    breadcrumb: ["Hero", "h1"],
  };
}

describe("enqueueTweak replace-by-prop", () => {
  it("apila tweaks de props distintas", () => {
    const s = sel();
    let q: Intent[] = [];
    q = enqueueTweak(q, { selection: s, scope: "instance", prop: "fontSize", from: "32px", to: "40px" }, { id: "a", at: 1 });
    q = enqueueTweak(q, { selection: s, scope: "instance", prop: "textAlign", from: "left", to: "center" }, { id: "b", at: 2 });
    expect(q).toHaveLength(2);
    expect(q.map((i) => (i.kind === "tweak" ? i.prop : null))).toEqual([
      "fontSize",
      "textAlign",
    ]);
  });

  it("reemplaza el mismo nodo + scope + prop", () => {
    const s = sel();
    let q: Intent[] = [];
    q = enqueueTweak(q, { selection: s, scope: "instance", prop: "fontSize", from: "32px", to: "36px" }, { id: "a", at: 1 });
    q = enqueueTweak(q, { selection: s, scope: "instance", prop: "fontSize", from: "36px", to: "40px" }, { id: "b", at: 2 });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: "b", to: "40px", from: "36px" });
  });

  it("scope distinto no reemplaza", () => {
    const s = sel();
    let q: Intent[] = [];
    q = enqueueTweak(q, { selection: s, scope: "instance", prop: "fontSize", from: "32px", to: "36px" }, { id: "a", at: 1 });
    q = enqueueTweak(q, { selection: s, scope: "component", prop: "fontSize", from: "32px", to: "40px" }, { id: "b", at: 2 });
    expect(q).toHaveLength(2);
  });

  it("source distinto no reemplaza", () => {
    let q: Intent[] = [];
    q = enqueueTweak(q, { selection: sel("a.tsx", 1, 1), scope: "instance", prop: "fontSize", from: "1px", to: "2px" }, { id: "a", at: 1 });
    q = enqueueTweak(q, { selection: sel("b.tsx", 1, 1), scope: "instance", prop: "fontSize", from: "1px", to: "3px" }, { id: "b", at: 2 });
    expect(q).toHaveLength(2);
  });
});

describe("enqueueComment", () => {
  it("anexa el comment y trimea el body", () => {
    const { queue, intent } = enqueueComment(
      [],
      { selection: sel(), scope: "instance", body: "  más display  ", pin: 1 },
      { id: "c1", at: 10 },
    );
    expect(queue).toHaveLength(1);
    expect(intent).toMatchObject({ kind: "comment", body: "más display", pin: 1 });
  });

  it("body vacío no entra a la cola", () => {
    const start: Intent[] = [];
    const { queue } = enqueueComment(
      start,
      { selection: sel(), scope: "instance", body: "   ", pin: 1 },
      { id: "c1", at: 10 },
    );
    expect(queue).toBe(start);
  });
});

describe("removeIntent / buildApplyPayload", () => {
  it("quita por id", () => {
    let q: Intent[] = [];
    q = enqueueTweak(q, { selection: sel(), scope: "instance", prop: "opacity", from: "1", to: "0.8" }, { id: "x", at: 1 });
    expect(removeIntent(q, "x")).toHaveLength(0);
    expect(removeIntent(q, "nope")).toHaveLength(1);
  });

  it("payload arrastra projectRoot, route e intents", () => {
    const q = enqueueTweak(
      [],
      { selection: sel(), scope: "instance", prop: "opacity", from: "1", to: "0.5" },
      { id: "x", at: 1 },
    );
    const payload = buildApplyPayload(q, "/tmp/proj", { route: "/", userNote: "hola" });
    expect(payload).toEqual({
      projectRoot: "/tmp/proj",
      route: "/",
      intents: q,
      userNote: "hola",
    });
  });

  it("userNote omitido no agrega la key", () => {
    const payload = buildApplyPayload([], "/tmp/proj");
    expect("userNote" in payload).toBe(false);
  });
});
