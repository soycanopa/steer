// intentsSlice — cola de Intent (TRD §5) y transcript del chat.
// La cola es domain puro; este slice solo la guarda y la pasa a los
// ports. El apply de la Fase E NO llama a ningún agente: deja el lote
// en el transcript (criterio de hecho). La F muestra la llamada real.
import type { ApplyPayload, Intent } from "@steer/domain";

export type TranscriptBlock =
  | { kind: "user"; id: string; text: string }
  | { kind: "batch"; id: string; payload: ApplyPayload };

export type IntentsSlice = {
  queue: Intent[];
  transcript: TranscriptBlock[];
  /** Siguiente número de pin (#1, #2… UX §5.5). */
  nextPin: number;
  /** Nota del composer que viaja como userNote del ApplyPayload. */
  draftNote: string;
};

export const initialIntentsSlice: IntentsSlice = {
  queue: [],
  transcript: [],
  nextPin: 1,
  draftNote: "",
};
