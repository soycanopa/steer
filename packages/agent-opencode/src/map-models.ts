// Mapeo de /config/providers → ModelRef[]. Nunca hardcodear modelos:
// el chat solo ve AgentPort.listModels().

import type { ModelRef } from "@steer/ports";

export const OPENCODE_PROVIDER_ID = "opencode";

type OpenCodeModelCaps = {
  reasoning?: boolean;
  temperature?: boolean;
  toolcall?: boolean;
  attachment?: boolean;
  input?: { image?: boolean };
};

type OpenCodeModel = {
  id: string;
  name?: string;
  capabilities?: OpenCodeModelCaps;
  variants?: Record<string, { reasoningEffort?: string }>;
};

const REASONING_VARIANTS = new Set(["low", "high", "max"]);

function mapReasoningVariants(
  variants: OpenCodeModel["variants"],
): ("low" | "high" | "max")[] {
  const out: ("low" | "high" | "max")[] = [];
  for (const key of Object.keys(variants ?? {})) {
    if (REASONING_VARIANTS.has(key)) {
      out.push(key as "low" | "high" | "max");
    }
  }
  return out;
}

type OpenCodeProvider = {
  id: string;
  name?: string;
  models?: Record<string, OpenCodeModel>;
};

export type ProvidersResponse = {
  providers?: OpenCodeProvider[];
  default?: Record<string, string>;
};

export function mapProvidersToModels(
  res: ProvidersResponse,
  defaultModel?: string | null,
): ModelRef[] {
  const out: ModelRef[] = [];
  for (const provider of res.providers ?? []) {
    if (!provider.models) continue;
    for (const [modelId, model] of Object.entries(provider.models)) {
      const caps = model.capabilities;
      const label =
        model.name != null && model.name !== ""
          ? model.name
          : `${provider.id}/${modelId}`;
      out.push({
        providerId: provider.id,
        modelId,
        label,
        capabilities: {
          reasoning: caps?.reasoning === true,
          effort: caps?.reasoning === true,
          reasoningVariants: mapReasoningVariants(model.variants),
          images: caps?.input?.image === true,
          tools: caps?.toolcall !== false,
        },
      });
    }
  }
  // El default del server primero en la lista.
  if (defaultModel != null) {
    const [defProvider, defModel] = defaultModel.split("/");
    if (defProvider != null && defModel != null) {
      out.sort((a, b) => {
        const aIs = a.providerId === defProvider && a.modelId === defModel ? 0 : 1;
        const bIs = b.providerId === defProvider && b.modelId === defModel ? 0 : 1;
        return aIs - bIs;
      });
    }
  }
  return out;
}
