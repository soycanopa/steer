// PreviewPort + protocolo iframe — ARCHITECTURE §4 / TRD §6.
// Los mensajes steer:* viajan por postMessage entre el parent y el bridge
// inyectado. Los tipos viven aquí para que app-state y preview-bridge
// compartan el contrato sin importarse entre sí.

import type { OverlayOverride, Selection, SourceLoc } from "@steer/domain";

export type ParentToFrame =
  | { type: "steer:inspect-on" }
  | { type: "steer:inspect-off" }
  | { type: "steer:set-overrides"; overrides: OverlayOverride[] }
  | { type: "steer:clear-overrides" }
  | { type: "steer:highlight"; source: SourceLoc | null }
  // Pins de comentarios (Fase E): badges numerados anclados al nodo.
  | { type: "steer:add-pin"; intentId: string; steerId: string; number: number }
  | { type: "steer:remove-pin"; intentId: string }
  | { type: "steer:clear-pins" };

export type FrameToParent =
  | { type: "steer:ready" }
  | { type: "steer:hover"; selection: Selection | null }
  /** `id` = data-steer-id que el bridge asignó al nodo clickeado
   *  (Fase D: el parent lo necesita para direccionar overrides). */
  | { type: "steer:select"; id: string; selection: Selection }
  | { type: "steer:navigate"; href: string };

export type PreviewPort = {
  setInspect(on: boolean): void;
  setOverrides(overrides: OverlayOverride[]): void;
  clearOverrides(): void;
  highlight(source: SourceLoc | null): void;
  addPin(intentId: string, steerId: string, number: number): void;
  removePin(intentId: string): void;
  clearPins(): void;
  subscribe(handler: (msg: FrameToParent) => void): () => void;
};
