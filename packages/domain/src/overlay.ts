import type { TweakProp } from "./intent";

// Override efímero que el bridge aplica en el iframe (TRD §6.2).
// Vive en un único <style data-steer-overlay>; nunca toca disco.
export type OverlayOverride = {
  /** data-steer-id asignado al nodo dentro del iframe */
  steerId: string;
  prop: TweakProp;
  value: string;
};
