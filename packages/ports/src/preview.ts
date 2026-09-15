// PreviewPort + protocolo iframe — ARCHITECTURE §4 / TRD §6.
import type { OverlayOverride, Selection, SourceLoc } from "@steer/domain";

export type LayerNode = {
  id: string;
  tag: string;
  cls: string | null;
  text: string | null;
  source: string | null;
  children: LayerNode[];
};

export type PreviewModeMsg = "interact" | "comment" | "inspect";

export type ParentToFrame =
  | { type: "steer:inspect-on" }
  | { type: "steer:inspect-off" }
  | { type: "steer:set-mode"; mode: PreviewModeMsg }
  | { type: "steer:set-overrides"; overrides: OverlayOverride[] }
  | { type: "steer:clear-overrides" }
  | { type: "steer:highlight"; source: SourceLoc | null }
  | {
      type: "steer:add-pin";
      intentId: string;
      steerId: string;
      number: number;
      body?: string;
    }
  | { type: "steer:remove-pin"; intentId: string }
  | { type: "steer:clear-pins" }
  | { type: "steer:select-node"; id: string }
  | { type: "steer:focus-pin"; intentId: string }
  | { type: "steer:capture" };

export type FrameToParent =
  | { type: "steer:ready" }
  | { type: "steer:hover"; selection: Selection | null }
  | { type: "steer:select"; id: string; selection: Selection }
  | { type: "steer:navigate"; href: string }
  | { type: "steer:tree"; nodes: LayerNode[] }
  | { type: "steer:captured"; mime: string; dataUrl: string }
  | { type: "steer:capture-error"; message: string }
  /** Popover del preview (modo comentario): crear o editar pin. */
  | {
      type: "steer:comment-submit";
      intentId: string | null;
      body: string;
      steerId: string;
    };

export type PreviewPort = {
  setInspect(on: boolean): void;
  setMode(mode: PreviewModeMsg): void;
  setOverrides(overrides: OverlayOverride[]): void;
  clearOverrides(): void;
  highlight(source: SourceLoc | null): void;
  addPin(intentId: string, steerId: string, number: number, body?: string): void;
  removePin(intentId: string): void;
  clearPins(): void;
  selectNode(id: string): void;
  focusPin(intentId: string): void;
  capture(): void;
  subscribe(handler: (msg: FrameToParent) => void): () => void;
};
