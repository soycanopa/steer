/** Texto de un chunk ACP / streaming-json: string, ContentBlock, array, thought|delta. */

function pickString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function extractStreamText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    let out = "";
    for (const item of value) {
      out += extractStreamText(item);
    }
    return out;
  }
  if (typeof value !== "object") return "";
  const rec = value as Record<string, unknown>;
  const direct =
    pickString(rec.text) ||
    pickString(rec.thought) ||
    pickString(rec.reasoning) ||
    pickString(rec.delta) ||
    pickString(rec.thought_delta) ||
    pickString(rec.reasoning_delta);
  if (direct !== "") return direct;
  if ("content" in rec) return extractStreamText(rec.content);
  if ("message" in rec) return extractStreamText(rec.message);
  if ("data" in rec) return extractStreamText(rec.data);
  return "";
}
