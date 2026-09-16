// Session scope — mismo AgentPort reutiliza sessionId; otro adapter
// abre conversación nueva (el sessionId no viaja entre providers).

import type { ChatSession } from "./intents";
import { newChatSession } from "./intents";

export function reuseAgentSessionId(
  session: Pick<ChatSession, "agentSessionId" | "agentAdapterId"> | undefined,
  adapterId: string,
): string | null {
  if (session == null) return null;
  const id = session.agentSessionId;
  if (id == null || id === "") return null;
  if (session.agentAdapterId != null && session.agentAdapterId !== adapterId) {
    return null;
  }
  return id;
}

export function forkChatIfAdapterChanged(args: {
  sessions: ChatSession[];
  activeSessionId: string;
  prevAdapterId: string | null;
  nextAdapterId: string | null;
}): { sessions: ChatSession[]; activeSessionId: string } {
  if (
    args.prevAdapterId == null ||
    args.nextAdapterId == null ||
    args.prevAdapterId === args.nextAdapterId
  ) {
    return {
      sessions: args.sessions,
      activeSessionId: args.activeSessionId,
    };
  }
  const current = args.sessions.find((s) => s.id === args.activeSessionId);
  const empty =
    current == null ||
    (current.blocks.length === 0 &&
      (current.agentSessionId == null || current.agentSessionId === ""));
  if (empty) {
    return {
      sessions: args.sessions,
      activeSessionId: args.activeSessionId,
    };
  }
  const next = newChatSession();
  return {
    sessions: [...args.sessions, next],
    activeSessionId: next.id,
  };
}
