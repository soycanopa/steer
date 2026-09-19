// streaming-json de Grok Build (y el sidecar ACP proyectado a esa forma)
// → AgentEvent.

import { isTodoTool, parseTodos } from "@steer/domain";
import type { AgentEvent, SessionId } from "@steer/ports";
import { extractStreamText } from "./extract-stream-text";

export type GrokStreamEvent = {
  type?: unknown;
  data?: unknown;
  contextTokens?: unknown;
  contextWindow?: unknown;
  message?: unknown;
  content?: unknown;
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

function toolStatus(status: unknown): "start" | "end" {
  if (status === "completed" || status === "failed" || status === "cancelled") {
    return "end";
  }
  return "start";
}

/** El ACP de Grok a veces no trae toolName/title; el nombre real viaja
 * dentro del rawInput como {"type":"ListDir",…}. */
function rawInputType(value: unknown): string | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const t = (value as { type?: unknown }).type;
    if (typeof t === "string" && t !== "") return t;
  }
  return null;
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
      const text = extractStreamText(e.data) || extractStreamText(e);
      if (text !== "") out.push({ type: "text-delta", text });
      return out;
    }

    if (e.type === "thought" || e.type === "thinking" || e.type === "reasoning") {
      const text =
        extractStreamText(e.data) ||
        extractStreamText(e.message) ||
        extractStreamText(e.content) ||
        extractStreamText(e);
      if (text !== "") out.push({ type: "reasoning-delta", text });
      return out;
    }

    if (e.type === "tool_call") {
      const name =
        typeof e.toolName === "string"
          ? e.toolName
          : typeof e.title === "string"
            ? e.title
            : (rawInputType(e.rawInput) ?? "tool");
      out.push({
        type: "tool",
        id: typeof e.toolCallId === "string" ? e.toolCallId : undefined,
        name,
        status: toolStatus(e.status),
        detail: toolDetail(e.rawInput),
      });
      if (isTodoTool(name)) {
        const todos = parseTodos(e.rawInput);
        if (todos.length > 0) out.push({ type: "todo", todos });
      }
      return out;
    }

    if (e.type === "tool_call_update") {
      const name =
        typeof e.toolName === "string"
          ? e.toolName
          : typeof e.title === "string"
            ? e.title
            : (rawInputType(e.rawOutput) ?? "tool");
      out.push({
        type: "tool",
        id: typeof e.toolCallId === "string" ? e.toolCallId : undefined,
        name,
        status: toolStatus(e.status),
        detail: toolDetail(e.rawOutput),
      });
      if (isTodoTool(name)) {
        const todos = parseTodos(e.rawOutput);
        if (todos.length > 0) out.push({ type: "todo", todos });
      }
      return out;
    }

    if (e.type === "usage") {
      if (typeof e.contextTokens !== "number" || e.contextTokens <= 0) {
        return out;
      }
      const usageEvent: AgentEvent =
        typeof e.contextWindow === "number" && e.contextWindow > 0
          ? { type: "usage", contextTokens: e.contextTokens, contextWindow: e.contextWindow }
          : { type: "usage", contextTokens: e.contextTokens };
      out.push(usageEvent);
      return out;
    }

    if (e.type === "end") {
      out.push({ type: "done" });
      return out;
    }

    if (e.type === "error") {
      const message =
        extractStreamText(e.message) !== ""
          ? extractStreamText(e.message)
          : extractStreamText(e.data) !== ""
            ? extractStreamText(e.data)
            : "Grok: turn failed";
      out.push({ type: "error", message });
      return out;
    }

    return out;
  };
}
