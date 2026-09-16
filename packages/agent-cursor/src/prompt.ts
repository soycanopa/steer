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

export function buildPromptImages(
  parts: TurnPart[],
): Array<{ data: string; mimeType: string }> {
  const images: Array<{ data: string; mimeType: string }> = [];
  for (const part of parts) {
    if (part.type !== "image") continue;
    images.push({ data: part.dataBase64, mimeType: part.mime });
  }
  return images;
}
