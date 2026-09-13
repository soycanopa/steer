// queue.ts — cola de intents (TRD §5). Replace-by-prop: el mismo nodo
// (source) + scope + prop se REEMPLAZA, no se apila (UX §5.4).
// Pura: sin React, sin fetch, sin Tauri.

import type { ApplyPayload, Intent, Scope, Selection, TweakProp } from "./intent";

export type TweakInput = {
  selection: Selection;
  scope: Scope;
  prop: TweakProp;
  from: string;
  to: string;
};

export type CommentInput = {
  selection: Selection;
  scope: Scope;
  body: string;
  pin: number;
};

function sourceKey(s: Selection): string {
  return `${s.source.file}:${s.source.line}:${s.source.col}`;
}

export function enqueueTweak(queue: Intent[], input: TweakInput): Intent[] {
  const intent: Intent = {
    id: crypto.randomUUID(),
    kind: "tweak",
    at: Date.now(),
    selection: input.selection,
    scope: input.scope,
    prop: input.prop,
    from: input.from,
    to: input.to,
  };
  return [...filterSameTweak(queue, intent), intent];
}

/** Misma selección (source) + scope + prop → reemplaza. */
function filterSameTweak(queue: Intent[], incoming: Intent): Intent[] {
  if (incoming.kind !== "tweak") return queue;
  const key = sourceKey(incoming.selection);
  return queue.filter((i) => {
    if (i.kind !== "tweak") return true;
    return !(
      sourceKey(i.selection) === key &&
      i.scope === incoming.scope &&
      i.prop === incoming.prop
    );
  });
}

export function enqueueComment(
  queue: Intent[],
  input: CommentInput,
): { queue: Intent[]; intent: Intent } {
  const intent: Intent = {
    id: crypto.randomUUID(),
    kind: "comment",
    at: Date.now(),
    selection: input.selection,
    scope: input.scope,
    pin: input.pin,
    body: input.body.trim(),
  };
  // Pin vacío no se encola (UX §5.5): caller filtra antes, pero
  // devolvemos la cola intacta igualmente.
  if (input.body.trim() === "") return { queue, intent };
  return { queue: [...queue, intent], intent };
}

export function removeIntent(queue: Intent[], id: string): Intent[] {
  return queue.filter((i) => i.id !== id);
}

export function buildApplyPayload(
  queue: Intent[],
  projectRoot: string,
  opts: { route?: string | null; userNote?: string } = {},
): ApplyPayload {
  return {
    projectRoot,
    route: opts.route ?? null,
    intents: queue,
    userNote: opts.userNote,
  };
}
