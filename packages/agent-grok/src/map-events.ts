// streaming-json de Grok Build (y el sidecar ACP proyectado a esa forma)
// → AgentEvent.

import type { AgentEvent, SessionId } from "@steer/ports";

export type GrokStreamEvent = {
  type?: unknown;
  data?: unknown;
  message?: unknown;
  sessionId?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  title?: unknown;
  status?: unknown;
  rawInput?: unknown;
  rawOutput?: unknown;
};

function toolDetail(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.slice(0, 400);
  try {
    return JSON.stringify(value).slice(0, 400);
  } catch {
    return undefined;
  }
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toolStatus(status: unknown): "start" | "end" {
  if (status === "completed" || status === "failed" || status === "cancelled") {
    return "end";
  }
  return "start";
}

export function createGrokEventMapper() {
  let sessionEmitted = false;

  return function map(
    ev: unknown,
    fallbackSession: SessionId | null,
  ): AgentEvent[] {
    if (typeof ev !== "object" || ev === null) return [];
    const e = ev as GrokStreamEvent;
    if (typeof e.type !== "string") return [];

    const out: AgentEvent[] = [];
    const sid =
      typeof e.sessionId === "string" && e.sessionId !== ""
        ? e.sessionId
        : fallbackSession;
    if (!sessionEmitted && sid != null) {
      sessionEmitted = true;
      out.push({ type: "session", sessionId: sid });
    }

    if (e.type === "session") {
      return out;
    }

    if (e.type === "text") {
      const text = textOf(e.data);
      if (text !== "") out.push({ type: "text-delta", text });
      return out;
    }

    if (e.type === "thought") {
      const text = textOf(e.data);
      if (text !== "") out.push({ type: "reasoning-delta", text });
      return out;
    }

    if (e.type === "tool_call") {
      const name =
        typeof e.toolName === "string"
          ? e.toolName
          : typeof e.title === "string"
            ? e.title
            : "tool";
      out.push({
        type: "tool",
        id: typeof e.toolCallId === "string" ? e.toolCallId : undefined,
        name,
        status: toolStatus(e.status),
        detail: toolDetail(e.rawInput),
      });
      return out;
    }

    if (e.type === "tool_call_update") {
      out.push({
        type: "tool",
        id: typeof e.toolCallId === "string" ? e.toolCallId : undefined,
        name: typeof e.toolName === "string" ? e.toolName : "tool",
        status: toolStatus(e.status),
        detail: toolDetail(e.rawOutput),
      });
      return out;
    }

    if (e.type === "end") {
      out.push({ type: "done" });
      return out;
    }

    if (e.type === "error") {
      const message =
        textOf(e.message) !== ""
          ? textOf(e.message)
          : textOf(e.data) !== ""
            ? textOf(e.data)
            : "Grok: el turno falló";
      out.push({ type: "error", message });
      return out;
    }

    return out;
  };
}
