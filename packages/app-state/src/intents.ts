// intentsSlice — cola de Intent (TRD §5), sesiones de chat y
// transcript. La cola es domain puro; este slice solo la guarda y la
// pasa a los ports.
import type { AgentTodo, ApplyPayload, Intent } from "@steer/domain";
import type { LayerNode } from "@steer/ports";

export type TranscriptTool = {
  id?: string;
  name: string;
  status: "start" | "end";
  detail?: string;
};

/** Adjunto de imagen (cámara / file picker) que viaja al agente. */
export type ChatAttachment = {
  id: string;
  mime: "image/png" | "image/jpeg";
  dataBase64: string;
  name: string;
};

export type TranscriptBlock =
  | { kind: "user"; id: string; text: string }
  | { kind: "batch"; id: string; payload: ApplyPayload }
  | { kind: "image"; id: string; mime: string; dataBase64: string; name: string }
  | {
      kind: "agent";
      id: string;
      text: string;
      reasoning: string;
      tools: TranscriptTool[];
      status: "streaming" | "done" | "error";
      /**
       * Respuesta partida en globos: cada vez que el agente retoma después
       * de una herramienta/permiso/pregunta se sella un segmento. `text`
       * conserva la concatenación completa (compat). Bloques viejos
       * persistidos no lo traen: la UI cae a [text].
       */
      segments?: string[];
      /** Inicio del turno (ms). Bloques viejos persistidos no lo traen. */
      startedAt?: number;
      /** Fin del turno (ms). null mientras hace stream. */
      finishedAt?: number | null;
    }
  | {
      kind: "question";
      id: string;
      questionId: string;
      prompt: string;
      options?: string[];
      questions: Array<{ prompt: string; options?: string[] }>;
      status: "pending" | "answered";
      answer?: string;
      error?: string;
    };

/** Una conversación con el agente. `agentSessionId` llega del AgentEvent. */
export type ChatSession = {
  id: string;
  title: string | null;
  createdAt: number;
  blocks: TranscriptBlock[];
  agentSessionId: string | null;
  /** AgentPort que emitió `agentSessionId`. Otro adapter no lo reutiliza. */
  agentAdapterId: string | null;
  /**
   * Tareas en curso que publicó el agente (AgentEvent `todo`). Solo vive
   * durante el turno; en done/error se limpia y el panel se oculta.
   */
  todos: AgentTodo[] | null;
};

export function newChatSession(title: string | null = null): ChatSession {
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: Date.now(),
    blocks: [],
    agentSessionId: null,
    agentAdapterId: null,
    todos: null,
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
  /** Imágenes listas para el próximo Apply (cámara / adjuntar). */
  draftAttachments: ChatAttachment[];
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
    draftAttachments: [],
  };
}
