import type { Scope, SourceLoc, TweakProp } from "./intent";

// Override efímero que el bridge aplica en el iframe (TRD §6.2).
// CSS vive en un único <style data-steer-overlay>. `prop: "text"` no es CSS:
// el bridge escribe textContent y lo restaura al reset/clear. Nunca toca disco.
//
// Selector que construye el bridge (Fase D):
//  - scope "instance"  → [data-steer-id="<steerId>"]
//  - scope "component" → [data-tsd-source="<file>:<line>:<col>"]
//    (si no hay source cae a data-steer-id).
export type OverlayOverride = {
  /** data-steer-id asignado al nodo dentro del iframe */
  steerId: string;
  prop: TweakProp;
  value: string;
  source?: SourceLoc | null;
  scope?: Scope;
};
