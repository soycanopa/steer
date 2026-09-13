// Adapter OpenCode — TRD §8. Implementa AgentPort contra `opencode serve`
// en :4096 (HTTP+SSE). Implementación en Fase F: health, listModels,
// startTurn, abort. La UI no importa este package; solo composition.ts.

/** Base URL por defecto del server OpenCode local (TRD §4.2). */
export const AGENT_OPENCODE_DEFAULT_URL = "http://127.0.0.1:4096";
