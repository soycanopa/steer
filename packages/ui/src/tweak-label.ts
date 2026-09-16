// Labels de tweaks en chips del chat. Fuera de ChatPanel para que Fast
// Refresh no se rompa al exportar un helper no-componente del mismo módulo.

import type { TweakProp } from "@steer/domain";

const TWEAK_PROP_LABELS: Partial<Record<TweakProp, string>> = {
  fontSize: "Tamaño",
  fontWeight: "Peso",
  lineHeight: "Interlineado",
  letterSpacing: "Tracking",
  color: "Color",
  backgroundColor: "Fondo",
  textAlign: "Alineación",
  width: "Ancho",
  height: "Alto",
  padding: "Padding",
  margin: "Margen",
  gap: "Gap",
  flexDirection: "Dirección",
  flexWrap: "Wrap",
  justifyContent: "Justify",
  alignItems: "Align",
  maxWidth: "Max ancho",
  objectFit: "Object fit",
  fontStyle: "Estilo",
  textDecoration: "Decoración",
  borderRadius: "Radio",
  opacity: "Opacidad",
};

export function tweakEditLabel(prop: TweakProp, to: string): string {
  const name = TWEAK_PROP_LABELS[prop] ?? prop;
  return `${name} · ${to}`;
}
