// PreviewPort + protocolo iframe — ARCHITECTURE §4 / TRD §6.
// Los mensajes steer:* viajan por postMessage entre el parent y el bridge
// inyectado. Los tipos viven aquí para que app-state y preview-bridge
// compartan el contrato sin importarse entre sí.

import type { OverlayOverride, Selection, SourceLoc } from "@steer/domain";

/** Nodo del árbol de capas (Fase layers): espejo liviano del DOM. */
export type LayerNode = {
  id: string; // id efímero asignado por el bridge en cada push
  tag: string;
  cls: string | null;
  text: string | null; // primer texto propio, ~40 chars
  source: string | null; // "file:line:col" del data-tsd-source
  children: LayerNode[];
};

export type ParentToFrame =
  | { type: "steer:inspect-on" }
  | { type: "steer:inspect-off" }
  | { type: "steer:set-overrides"; overrides: OverlayOverride[] }
  | { type: "steer:clear-overrides" }
  | { type: "steer:highlight"; source: SourceLoc | null }
  // Pins de comentarios (Fase E): badges numerados anclados al nodo.
  | { type: "steer:add-pin"; intentId: string; steerId: string; number: number }
  | { type: "steer:remove-pin"; intentId: string }
  | { type: "steer:clear-pins" }
  // Layers (Fase layers): seleccionar un nodo desde el árbol de capas.
  | { type: "steer:select-node"; id: string };

export type FrameToParent =
  | { type: "steer:ready" }
  | { type: "steer:hover"; selection: Selection | null }
  /** `id` = data-steer-id que el bridge asignó al nodo clickeado
   *  (Fase D: el parent lo necesita para direccionar overrides). */
  | { type: "steer:select"; id: string; selection: Selection }
  | { type: "steer:navigate"; href: string }
  /** Árbol de capas (Fase layers): push automático en ready, navigate
   *  y con debounce tras mutaciones del DOM. */
  | { type: "steer:tree"; nodes: LayerNode[] };

export type PreviewPort = {
  setInspect(on: boolean): void;
  setOverrides(overrides: OverlayOverride[]): void;
  clearOverrides(): void;
  highlight(source: SourceLoc | null): void;
  addPin(intentId: string, steerId: string, number: number): void;
  removePin(intentId: string): void;
  clearPins(): void;
  /** Selecciona un nodo desde el árbol de capas. */
  selectNode(id: string): void;
  subscribe(handler: (msg: FrameToParent) => void): () => void;
};
