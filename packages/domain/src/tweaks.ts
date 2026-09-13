// Helpers de valores de tweaks — parsing de computed styles del Selection
// y serialización a valores CSS. Puro, sin dependencias. El bridge y la
// UI comparten estas convenciones (valores "from" siempre como llegan
// del computed; "to" en unidades canónicas).

import type { TweakProp } from "./intent";

/** Props del TweakList P0 en orden de UI.md §5.2 (recortado a
 * IMPLEMENTATION §3-D: 6 props). */
export const P0_TWEAK_PROPS: TweakProp[] = [
  "fontSize",
  "color",
  "textAlign",
  "padding",
  "borderRadius",
  "opacity",
];

/** "32px" → 32; "0px 8px" → 0 (primer valor = shorthand). */
export function numFromPx(value: string | undefined): number | null {
  if (value === undefined) return null;
  const m = /(-?\d+(?:\.\d+)?)px/.exec(value);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function pxValue(n: number): string {
  return `${Math.round(n * 100) / 100}px`;
}

/** computed opacity "1" / "0.55" → 0–100. */
export function opacityFromComputed(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function opacityValue(pct: number): string {
  return (pct / 100).toFixed(2);
}

/** "rgb(91, 140, 255)" → "#5b8cff"; hex pasa through; otro → null. */
export function colorToHex(value: string | undefined): string | null {
  if (value === undefined) return null;
  const v = value.trim().toLowerCase();
  if (v === "" || v === "none" || v === "transparent") return null;
  if (/^#[0-9a-f]{3,8}$/.test(v)) return v;
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v);
  if (m === null) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((c) =>
    Number(c).toString(16).padStart(2, "0"),
  );
  return `#${r}${g}${b}`;
}

export type TextAlignValue = "left" | "center" | "right" | "justify";

/** computed "start"/"end" → left/right (best-effort). */
export function alignFromComputed(
  value: string | undefined,
): TextAlignValue | null {
  switch (value) {
    case "left":
    case "start":
      return "left";
    case "center":
      return "center";
    case "right":
    case "end":
      return "right";
    case "justify":
      return "justify";
    default:
      return null;
  }
}
