// serialize-turn.ts — plantilla de prompt (TRD §7). Determinista:
// texto ES + JSON EN adjunto para que el agente no "poetice" el target.
// El adapter lo manda como part; NO lo reescribe ni lo vuelve vago.

import type { ApplyPayload } from "./intent";

const REGLAS = `Reglas:
- Escribe solo source del repo. No dejes overrides ni <style> inyectado.
- Prefiere tokens del theme / escala Tailwind / CVA variants sobre px crudos.
- Respeta scope: instance = este uso; component = el componente.
- No refactorices fuera de los targets.
- No commitees.`;

export function serializeTurn(payload: ApplyPayload): string {
  const resumen = payload.intents
    .map((i) => {
      if (i.kind === "tweak") {
        const loc = `${i.selection.source.file}:${i.selection.source.line}`;
        return `- [tweak] ${loc} ${i.prop} ${i.from} → ${i.to} (scope: ${i.scope})`;
      }
      if (i.kind === "comment") {
        const loc = `${i.selection.source.file}:${i.selection.source.line}`;
        return `- [comment #${i.pin}] ${loc} “${i.body}”`;
      }
      if (i.kind === "select") {
        const loc = `${i.selection.source.file}:${i.selection.source.line}`;
        return `- [select] ${loc} <${i.selection.tag}>`;
      }
      return `- [screenshot] ${i.selection ? "con selección" : "sin selección"}`;
    })
    .join("\n");

  return `El usuario dirigió la UI. NO adivines el nodo. USA las rutas y líneas.

${REGLAS}

INTENTS_JSON
${JSON.stringify(payload, null, 2)}

Resumen humano:
${resumen}`;
}
