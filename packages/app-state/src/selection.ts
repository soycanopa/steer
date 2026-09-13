// selectionSlice — modo Inspect y nodo seleccionado (UX §4/§5.3).
// El hover se guarda para el debug pre; el Inspector de Fase D lo consume.
import type { Selection } from "@steer/domain";

export type SelectionSlice = {
  inspectOn: boolean;
  selection: Selection | null;
  hoverSelection: Selection | null;
};

export const initialSelectionSlice: SelectionSlice = {
  inspectOn: false,
  selection: null,
  hoverSelection: null,
};
