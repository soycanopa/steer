// intentsSlice — cola de Intent (TRD §5), sesiones de chat y
// transcript. La cola es domain puro; este slice solo la guarda y la
// pasa a los ports. El apply de la Fase E NO llama a ningún agente:
// deja el lote en el transcript de la sesión activa (criterio de
// hecho). La F muestra la llamada real y ancla agentSessionId.
import type { ApplyPayload, Intent } from "@steer/domain";
import type { LayerNode } from "@steer/ports";

export type TranscriptBlock =
  | { kind: "user"; id: string; text: string }
  | { kind: "batch"; id: string; payload: ApplyPayload };

/** Una conversación con el agente. `agentSessionId` llega en Fase F. */
export type ChatSession = {
  id: string;
  title: string | null;
  createdAt: number;
  blocks: TranscriptBlock[];
  agentSessionId: string | null;
};

export function newChatSession(title: string | null = null): ChatSession {
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: Date.now(),
    blocks: [],
    agentSessionId: null,
  };
}

export type IntentsSlice = {
  queue: Intent[];
  sessions: ChatSession[];
  activeSessionId: string;
  /** Visibilidad de la columna de chat (toggle del titlebar). */
  chatOpen: boolean;
  /** Visibilidad del panel de capas (toggle del titlebar). */
  layersOpen: boolean;
  /** Árbol de capas empujado por el bridge (null = aún sin árbol). */
  tree: LayerNode[] | null;
  /** Siguiente número de pin (#1, #2… UX §5.5). */
  nextPin: number;
  /** Nota del composer que viaja como userNote del ApplyPayload. */
  draftNote: string;
};

/** Slice inicial con la primera sesión ya activa. */
export function initialIntents(): IntentsSlice {
  const session = newChatSession();
  return {
    queue: [],
    sessions: [session],
    activeSessionId: session.id,
    chatOpen: true,
    layersOpen: true,
    tree: null,
    nextPin: 1,
    draftNote: "",
  };
}
