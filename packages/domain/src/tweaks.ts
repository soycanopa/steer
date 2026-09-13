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

/** "rgb(91, 140, 255)" | "oklch(0.208 0.042 265.755)" | "#abc" → "#hex". */
export function colorToHex(value: string | undefined): string | null {
  if (value === undefined) return null;
  const v = value.trim().toLowerCase();
  if (v === "" || v === "none" || v === "transparent") return null;
  if (/^#[0-9a-f]{3,8}$/.test(v)) return v;
  if (v.startsWith("oklch")) return oklchToHex(v);
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v);
  if (m === null) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((c) =>
    Number(c).toString(16).padStart(2, "0"),
  );
  return `#${r}${g}${b}`;
}

/** oklch(L C H[/α]) → hex. Tailwind v4 emite colores computed en oklch.
 *  Conversión estándar OKLab → sRGB lineal → gamma 2.4. */
export function oklchToHex(value: string): string | null {
  const m =
    /oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+(-?[\d.]+)(?:deg)?/i.exec(value);
  if (m === null) return null;
  const parse = (s: string | undefined, scale = 1): number | null => {
    if (s === undefined) return null;
    if (s.endsWith("%")) {
      const n = Number(s.slice(0, -1));
      return Number.isFinite(n) ? (n / 100) * scale : null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const L = parse(m[1], 1);
  const C = parse(m[2], 0.4);
  const H = Number(m[3]);
  if (L === null || C === null || !Number.isFinite(H)) return null;

  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const mm = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLinear = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
  const gLinear = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
  const bLinear = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s;

  const gamma = (c: number): number => {
    const clamped = Math.min(1, Math.max(0, c));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };
  const hex = (c: number): string =>
    Math.round(gamma(c) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${hex(rLinear)}${hex(gLinear)}${hex(bLinear)}`;
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
