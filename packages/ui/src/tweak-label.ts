// Labels de tweaks en chips del chat. Fuera de ChatPanel para que Fast
// Refresh no se rompa al exportar un helper no-componente del mismo módulo.

import type { TweakProp } from "@steer/domain";
import { t } from "./i18n";

export function tweakEditLabel(prop: TweakProp, to: string): string {
  const labels = t.tweaks as Partial<Record<TweakProp, string>>;
  const name = labels[prop] ?? prop;
  if (prop === "text") {
    const compact = to.trim().replace(/\s+/g, " ");
    const shown = compact.length > 40 ? `${compact.slice(0, 40)}…` : compact;
    return `${name} · ${shown}`;
  }
  return `${name} · ${to}`;
}
