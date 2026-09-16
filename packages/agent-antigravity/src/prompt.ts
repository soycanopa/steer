import { serializeTurn } from "@steer/domain";
import type { TurnPart } from "@steer/ports";

export function buildPromptText(parts: TurnPart[]): string {
  const texts: string[] = [];
  for (const part of parts) {
    if (part.type === "intents") {
      texts.push(serializeTurn(part.payload));
    } else if (part.type === "text") {
      texts.push(part.text);
    }
  }
  return texts.filter((t) => t.trim() !== "").join("\n\n");
}

/** `agy --effort` is low|medium|high. Steer max maps to high. */
export function effortFromExtras(
  extras: Record<string, unknown>,
): "low" | "medium" | "high" | undefined {
  const raw = rawEffort(extras);
  if (raw == null) return undefined;
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  if (raw === "max") return "high";
  return undefined;
}

function rawEffort(extras: Record<string, unknown>): string | undefined {
  const reasoning = extras.reasoning;
  if (typeof reasoning === "object" && reasoning !== null) {
    const effort = (reasoning as { effort?: unknown }).effort;
    if (typeof effort === "string" && effort !== "") return effort;
  }
  const params = extras.params;
  if (Array.isArray(params)) {
    for (const p of params) {
      if (
        p != null &&
        typeof p === "object" &&
        (p as { id?: unknown }).id === "effort" &&
        typeof (p as { value?: unknown }).value === "string"
      ) {
        return (p as { value: string }).value;
      }
    }
  }
  return undefined;
}
