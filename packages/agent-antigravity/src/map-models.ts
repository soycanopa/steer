// `agy models` → ModelRef[]. Nunca hardcodear ids.

import type { ModelRef } from "@steer/ports";

export const ANTIGRAVITY_ID = "antigravity";

export type AgyModelListItem = {
  id: string;
  label?: string;
};

const ANSI = /\u001b\[[0-9;]*m/g;
/** `agy models` usa tab entre slug y nombre. */
const ROW = /^([a-z0-9][a-z0-9._+-]*)(?:\t+|\s{2,})(\S.*)$/i;
const SLUG = /^\s*[*+\-]?\s*([a-z0-9][a-z0-9._+-]*)\s*$/i;

function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

function fromJson(raw: string): AgyModelListItem[] | null {
  const trimmed = raw.trim();
  if (trimmed === "" || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null
        ? ((parsed as { models?: unknown; data?: unknown }).models ??
          (parsed as { data?: unknown }).data)
        : null;
    if (!Array.isArray(list)) return null;
    return list.flatMap((item) => itemToModel(item)).filter((m) => m.id !== "");
  } catch {
    return null;
  }
}

function itemToModel(item: unknown): AgyModelListItem[] {
  if (typeof item === "string" && item !== "") return [{ id: item, label: item }];
  if (typeof item !== "object" || item === null) return [];
  const o = item as { id?: unknown; name?: unknown; displayName?: unknown };
  if (typeof o.id !== "string" || o.id === "") return [];
  const label =
    typeof o.displayName === "string" && o.displayName !== ""
      ? o.displayName
      : typeof o.name === "string" && o.name !== ""
        ? o.name
        : o.id;
  return [{ id: o.id, label }];
}

export function parseAgyModelsOutput(output: string): AgyModelListItem[] {
  const from = fromJson(output);
  if (from != null) return from;

  const seen = new Map<string, AgyModelListItem>();
  for (const line of stripAnsi(output).split(/\r?\n/)) {
    const row = line.match(ROW);
    if (row?.[1] != null) {
      const id = row[1];
      const label = row[2]?.trim() ?? id;
      seen.set(id, { id, label });
      continue;
    }
    const slug = line.match(SLUG);
    if (slug?.[1] != null && slug[1].includes("-")) {
      seen.set(slug[1], { id: slug[1], label: slug[1] });
    }
  }
  return [...seen.values()];
}

export function mapAgyModels(models: AgyModelListItem[]): ModelRef[] {
  return models
    .filter((m) => m.id !== "")
    .map((m) => ({
      providerId: ANTIGRAVITY_ID,
      adapterId: ANTIGRAVITY_ID,
      modelId: m.id,
      label: m.label != null && m.label !== "" ? m.label : m.id,
      capabilities: {
        // El effort ya viene en el slug (`-high`, `-medium`, Thinking).
        reasoning: false,
        effort: false,
        images: false,
        tools: true,
      },
    }));
}

export function mapAgyModelsOutput(output: string): ModelRef[] {
  return mapAgyModels(parseAgyModelsOutput(output));
}
