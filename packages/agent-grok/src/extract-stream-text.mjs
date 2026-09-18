/** Texto de un chunk ACP / streaming-json: string, ContentBlock, array, thought|delta. */

function pickString(value) {
  return typeof value === "string" ? value : "";
}

export function extractStreamText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    let out = "";
    for (let i = 0; i < value.length; i++) {
      out += extractStreamText(value[i]);
    }
    return out;
  }
  if (typeof value !== "object") return "";
  const direct =
    pickString(value.text) ||
    pickString(value.thought) ||
    pickString(value.reasoning) ||
    pickString(value.delta) ||
    pickString(value.thought_delta) ||
    pickString(value.reasoning_delta);
  if (direct !== "") return direct;
  if ("content" in value) return extractStreamText(value.content);
  if ("message" in value) return extractStreamText(value.message);
  if ("data" in value) return extractStreamText(value.data);
  return "";
}
