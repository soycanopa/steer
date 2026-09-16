// `grok models` (texto o JSON) + catálogo del CLI → ModelRef[].
// Nunca hardcodear ids.

import type { ModelRef } from "@steer/ports";

export const GROK_ID = "grok";

export type GrokEffortOption = {
  value: string;
  label?: string;
  isDefault?: boolean;
};

export type GrokModelListItem = {
  id: string;
  label?: string;
  isDefault?: boolean;
  hidden?: boolean;
  supportsReasoningEffort?: boolean;
  reasoningEfforts?: GrokEffortOption[];
};

const ANSI = /\u001b\[[0-9;]*m/g;
const LIST_LINE = /^\s*[*+\-]\s+(\S+)/;
const DEFAULT_LINE = /^\s*Default model:\s+(\S+)/i;
function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

function fromJson(raw: string): GrokModelListItem[] | null {
  const trimmed = raw.trim();
  if (trimmed === "" || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item) => itemToModel(item)).filter(hasId);
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as {
      models?: unknown;
      data?: unknown;
      default?: unknown;
      defaultModel?: unknown;
    };
    const list = obj.models ?? obj.data;
    if (!Array.isArray(list)) return null;
    const def =
      typeof obj.default === "string"
        ? obj.default
        : typeof obj.defaultModel === "string"
          ? obj.defaultModel
          : undefined;
    return list
      .flatMap((item) => itemToModel(item))
      .filter(hasId)
      .map((m) => ({
        ...m,
        isDefault: m.isDefault === true || m.id === def,
      }));
  } catch {
    return null;
  }
}

function itemToModel(item: unknown): GrokModelListItem[] {
  if (typeof item === "string" && item !== "") {
    return [{ id: item, label: item }];
  }
  if (typeof item !== "object" || item === null) return [];
  const o = item as {
    id?: unknown;
    name?: unknown;
    displayName?: unknown;
    hidden?: unknown;
    supportsReasoningEffort?: unknown;
    reasoningEfforts?: unknown;
  };
  if (typeof o.id !== "string" || o.id === "") return [];
  const label =
    typeof o.displayName === "string" && o.displayName !== ""
      ? o.displayName
      : typeof o.name === "string" && o.name !== ""
        ? o.name
        : o.id;
  return [
    {
      id: o.id,
      label,
      hidden: o.hidden === true,
      supportsReasoningEffort: o.supportsReasoningEffort === true,
      reasoningEfforts: parseEfforts(o.reasoningEfforts),
    },
  ];
}

function parseEfforts(raw: unknown): GrokEffortOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: GrokEffortOption[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item !== "") {
      out.push({ value: item });
      continue;
    }
    if (typeof item !== "object" || item === null) continue;
    const o = item as {
      value?: unknown;
      id?: unknown;
      label?: unknown;
      default?: unknown;
      isDefault?: unknown;
    };
    const value =
      typeof o.value === "string"
        ? o.value
        : typeof o.id === "string"
          ? o.id
          : "";
    if (value === "") continue;
    out.push({
      value,
      label: typeof o.label === "string" ? o.label : undefined,
      isDefault: o.default === true || o.isDefault === true,
    });
  }
  return out.length > 0 ? out : undefined;
}

function hasId(m: GrokModelListItem): boolean {
  return m.id !== "";
}

export function parseGrokModelsOutput(output: string): GrokModelListItem[] {
  const from = fromJson(output);
  if (from != null) return from;

  const text = stripAnsi(output);
  let defaultId: string | undefined;
  const seen = new Map<string, GrokModelListItem>();
  for (const line of text.split(/\r?\n/)) {
    const def = line.match(DEFAULT_LINE);
    if (def?.[1] != null) {
      defaultId = def[1].replace(/[.,;:]+$/, "");
      continue;
    }
    const listed = line.match(LIST_LINE);
    if (listed?.[1] == null) continue;
    const id = listed[1].replace(/[),]+$/, "");
    if (id === "") continue;
    const isDefault = /\(default\)/i.test(line) || id === defaultId;
    const prev = seen.get(id);
    seen.set(id, {
      id,
      label: id,
      isDefault: prev?.isDefault === true || isDefault,
    });
  }
  if (defaultId != null && !seen.has(defaultId)) {
    seen.set(defaultId, { id: defaultId, label: defaultId, isDefault: true });
  }
  return [...seen.values()];
}

function mergeCatalog(
  listed: GrokModelListItem[],
  catalog: GrokModelListItem[],
): GrokModelListItem[] {
  if (catalog.length === 0) return listed;
  const byId = new Map(catalog.map((m) => [m.id, m]));
  if (listed.length === 0) {
    return catalog.filter((m) => m.hidden !== true);
  }
  return listed.map((m) => {
    const extra = byId.get(m.id);
    if (extra == null) return m;
    return {
      ...m,
      label: extra.label ?? m.label,
      supportsReasoningEffort:
        extra.supportsReasoningEffort ?? m.supportsReasoningEffort,
      reasoningEfforts: extra.reasoningEfforts ?? m.reasoningEfforts,
    };
  });
}

function toSteerVariant(value: string): "low" | "high" | "max" | null {
  const v = value.toLowerCase();
  if (v === "low") return "low";
  if (v === "high") return "high";
  if (v === "max" || v === "xhigh") return "max";
  return null;
}

function mapEfforts(efforts: GrokEffortOption[] | undefined): {
  reasoningVariants: ("low" | "high" | "max")[];
} {
  const seen = new Set<"low" | "high" | "max">();
  for (const effort of efforts ?? []) {
    const mapped = toSteerVariant(effort.value);
    if (mapped != null) seen.add(mapped);
  }
  return {
    reasoningVariants: (["low", "high", "max"] as const).filter((v) =>
      seen.has(v),
    ),
  };
}

export function mapGrokModels(
  models: GrokModelListItem[],
  catalog: GrokModelListItem[] = [],
): ModelRef[] {
  const merged = mergeCatalog(models, catalog);
  const sorted = [...merged].sort((a, b) => {
    if (a.isDefault === b.isDefault) return 0;
    return a.isDefault === true ? -1 : 1;
  });
  return sorted
    .filter((m) => m.id !== "" && m.hidden !== true)
    .map((m) => {
      const { reasoningVariants } = mapEfforts(m.reasoningEfforts);
      const reasoning =
        m.supportsReasoningEffort === true || reasoningVariants.length > 0;
      return {
        providerId: GROK_ID,
        adapterId: GROK_ID,
        modelId: m.id,
        label: m.label != null && m.label !== "" ? m.label : m.id,
        capabilities: {
          reasoning,
          effort: reasoning,
          reasoningVariants,
          images: true,
          tools: true,
        },
      };
    });
}

export function mapGrokModelsOutput(
  output: string,
  catalog: GrokModelListItem[] = [],
): ModelRef[] {
  return mapGrokModels(parseGrokModelsOutput(output), catalog);
}
