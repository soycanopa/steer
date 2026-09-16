// Cursor.models.list() → ModelRef[]. Nunca hardcodear ids.

import type { ModelParamDef, ModelRef } from "@steer/ports";

export const CURSOR_ID = "cursor";

export type CursorModelParameter = {
  id: string;
  displayName?: string;
  values: Array<{ value: string; displayName?: string }>;
};

export type CursorModelListItem = {
  id: string;
  displayName?: string;
  description?: string;
  parameters?: CursorModelParameter[];
};

const EFFORT = new Set(["low", "high", "max"]);

function isEffortParam(param: CursorModelParameter): boolean {
  const id = param.id.toLowerCase();
  const name = (param.displayName ?? "").toLowerCase();
  return (
    id.includes("effort") ||
    id.includes("reasoning") ||
    id.includes("thinking") ||
    name.includes("effort") ||
    name.includes("reasoning")
  );
}

function valueLabel(
  param: CursorModelParameter,
  value: { value: string; displayName?: string },
): string {
  if (value.displayName != null && value.displayName !== "") {
    return value.displayName;
  }
  if (value.value === "false") return "Normal";
  if (value.value === "true") {
    return param.displayName != null && param.displayName !== ""
      ? param.displayName
      : "On";
  }
  return value.value;
}

export function mapCursorParams(
  parameters: CursorModelParameter[] | undefined,
): ModelParamDef[] {
  const out: ModelParamDef[] = [];
  for (const param of parameters ?? []) {
    if (isEffortParam(param) || param.values.length === 0) continue;
    out.push({
      id: param.id,
      label: param.displayName != null && param.displayName !== ""
        ? param.displayName
        : param.id,
      values: param.values.map((v) => ({
        value: v.value,
        label: valueLabel(param, v),
      })),
    });
  }
  return out;
}

export function defaultParamValues(
  params: ModelParamDef[] | undefined,
  prev: Record<string, string> = {},
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const param of params ?? []) {
    const allowed = new Set(param.values.map((v) => v.value));
    const keep = prev[param.id];
    if (keep != null && allowed.has(keep)) {
      next[param.id] = keep;
      continue;
    }
    const first = param.values[0]?.value;
    if (first != null) next[param.id] = first;
  }
  return next;
}

export function mapCursorModels(models: CursorModelListItem[]): ModelRef[] {
  return models
    .filter((m) => m.id !== "")
    .map((m) => {
      const effortParam = (m.parameters ?? []).find(isEffortParam);
      const reasoningVariants = (effortParam?.values ?? [])
        .map((v) => v.value)
        .filter((v): v is "low" | "high" | "max" => EFFORT.has(v));
      const reasoning = effortParam != null;
      return {
        providerId: CURSOR_ID,
        adapterId: CURSOR_ID,
        modelId: m.id,
        label:
          m.displayName != null && m.displayName !== ""
            ? m.displayName
            : m.id,
        capabilities: {
          reasoning,
          effort: reasoning,
          reasoningVariants,
          images: true,
          tools: true,
          params: mapCursorParams(m.parameters),
        },
      };
    });
}
