// Mapeo de GET /api/model (v2) → ModelRef[]. Nunca hardcodear modelos:
// el chat solo ve AgentPort.listModels().

import type { ModelRef } from "@steer/ports";

export const OPENCODE_PROVIDER_ID = "opencode";

type V2ModelCapabilities = {
  tools?: boolean;
  input?: string[];
  output?: string[];
};

type V2ModelVariant = {
  id?: string;
};

export type V2ModelInfo = {
  id?: string;
  modelID?: string;
  providerID?: string;
  name?: string;
  enabled?: boolean;
  status?: string;
  capabilities?: V2ModelCapabilities;
  variants?: V2ModelVariant[];
  limit?: { context?: number; input?: number; output?: number };
};

/** Envoltura estándar v2: { location?, data }. */
export type V2ModelListOutput = {
  data?: V2ModelInfo[];
};
export type V2ModelDefaultOutput = {
  data?: V2ModelInfo | null;
};

const REASONING_VARIANTS = new Set(["low", "high", "max"]);

function modelIdOf(model: V2ModelInfo): string {
  if (typeof model.modelID === "string" && model.modelID !== "") {
    return model.modelID;
  }
  return typeof model.id === "string" ? model.id : "";
}

function reasoningVariantsOf(model: V2ModelInfo): ("low" | "high" | "max")[] {
  const out: ("low" | "high" | "max")[] = [];
  for (const variant of model.variants ?? []) {
    const id = variant?.id;
    if (typeof id === "string" && REASONING_VARIANTS.has(id)) {
      out.push(id as "low" | "high" | "max");
    }
  }
  return out;
}

export function mapModelsToRefs(
  body: V2ModelListOutput,
  defaultModel?: V2ModelInfo | null,
): ModelRef[] {
  const out: ModelRef[] = [];
  for (const model of body.data ?? []) {
    const providerId = model.providerID;
    const modelId = modelIdOf(model);
    if (providerId == null || providerId === "" || modelId === "") continue;
    if (model.enabled === false) continue;
    const efforts = reasoningVariantsOf(model);
    out.push({
      providerId,
      adapterId: OPENCODE_PROVIDER_ID,
      modelId,
      label:
        model.name != null && model.name !== ""
          ? model.name
          : `${providerId}/${modelId}`,
      capabilities: {
        reasoning: efforts.length > 0,
        effort: efforts.length > 0,
        reasoningVariants: efforts,
        images: (model.capabilities?.input ?? []).includes("image"),
        tools: model.capabilities?.tools !== false,
        contextWindow:
          typeof model.limit?.context === "number"
            ? model.limit.context
            : undefined,
      },
    });
  }
  // El default del server primero en la lista.
  const def = defaultModel ?? null;
  const defProvider = def?.providerID;
  const defModel = modelIdOf(def ?? {});
  if (defProvider != null && defProvider !== "" && defModel !== "") {
    out.sort((a, b) => {
      const aIs =
        a.providerId === defProvider && a.modelId === defModel ? 0 : 1;
      const bIs =
        b.providerId === defProvider && b.modelId === defModel ? 0 : 1;
      return aIs - bIs;
    });
  }
  return out;
}
