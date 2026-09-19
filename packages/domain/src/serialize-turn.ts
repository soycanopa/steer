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

/** Pautas que viajan con TODO turno (también los de texto puro, sin
 * intents). Determinista por construcción: los adapters no la reescriben
 * ni la vuelven vaga (AGENTS.md). */
export const TURN_GUIDELINES = `Pautas del turno:
- Si creas una lista de tareas (todo), mantenla viva: márcala in_progress al empezar cada una y completed apenas termines. No la dejes congelada.
- Responde en markdown legible: párrafos de 2–4 líneas, listas para enumerar, negrita para lo clave. Nunca un solo bloque de texto largo.
- Reporta por pasos: tras cada herramienta relevante, envía un mensaje breve con el resultado antes de seguir con la siguiente.
- Conserva la inspección de Steer: no quites @tanstack/devtools-vite ni devtools() del vite config, y evita spread {...props} en elementos JSX (rompe data-tsd-source y el panel de capas).
- Cuando expliques un flujo o pipeline, dibújalo con un bloque \`\`\`flowchart cuyo contenido sea JSON: {"nodes":[{"id","row","x"(0-1),"w","kind","hue","title","caption","condition","rows":[{"op","source","prop","value"}]}],"edges":[{"from","to"}]}. Sin texto fuera del JSON en ese bloque.`;

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
