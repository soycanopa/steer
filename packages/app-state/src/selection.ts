// selectionSlice — modo Inspect, nodo seleccionado y tweaks en vivo
// (UX §4/§5.3/§5.4). Los drafts NO son la cola de intents (Fase E):
// son el override efímero del preview. Mismo nodo+scope+prop se
// reemplaza, no se apila.
import type { Scope, Selection, SourceLoc, TweakProp } from "@steer/domain";

export type TweakDraft = {
  steerId: string;
  scope: Scope;
  selection: Selection; // snapshot para el Intent de la Fase E
  prop: TweakProp;
  from: string;
  to: string;
};

export type SelectionSlice = {
  inspectOn: boolean;
  selection: Selection | null;
  /** data-steer-id del nodo seleccionado (lo asigna el bridge). */
  selectedId: string | null;
  hoverSelection: Selection | null;
  /** Alcance de los tweaks de la selección actual (UX §4.3). */
  scope: Scope;
  tweaks: TweakDraft[];
  /** Orden de aplicación para ⌘Z (undo del último override local). */
  tweakLog: Array<{ steerId: string; scope: Scope; prop: TweakProp }>;
};

export const initialSelectionSlice: SelectionSlice = {
  inspectOn: false,
  selection: null,
  selectedId: null,
  hoverSelection: null,
  scope: "instance",
  tweaks: [],
  tweakLog: [],
};

export function findTweak(
  tweaks: TweakDraft[],
  steerId: string,
  scope: Scope,
  prop: TweakProp,
): TweakDraft | undefined {
  return tweaks.find(
    (t) => t.steerId === steerId && t.scope === scope && t.prop === prop,
  );
}
