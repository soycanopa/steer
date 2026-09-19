// SDKMessage del sidecar Cursor → AgentEvent. El stream puede mandar
// snapshots de texto; emitimos solo deltas.

import { isTodoTool, parseTodos } from "@steer/domain";
import type { AgentEvent, SessionId } from "@steer/ports";

export type CursorSdkMessage = {
  type?: unknown;
  agent_id?: unknown;
  run_id?: unknown;
  request_id?: unknown;
  call_id?: unknown;
  name?: unknown;
  status?: unknown;
  text?: unknown;
  message?: { content?: unknown };
  args?: unknown;
  usage?: unknown;
};

function splitContent(content: unknown): { text: string; thinking: string } {
  if (typeof content === "string") return { text: content, thinking: "" };
  if (!Array.isArray(content)) return { text: "", thinking: "" };
  const text: string[] = [];
  const thinking: string[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as { type?: unknown; text?: unknown };
    if (typeof b.text !== "string") continue;
    if (
      b.type === "thinking" ||
      b.type === "thought" ||
      b.type === "reasoning"
    ) {
      thinking.push(b.text);
    } else if (b.type === "text" || b.type == null) {
      text.push(b.text);
    }
  }
  return { text: text.join(""), thinking: thinking.join("") };
}

function delta(prev: string | undefined, next: string): string | null {
  if (next === "") return null;
  if (prev === next) return null;
  if (prev != null && next.startsWith(prev)) {
    const d = next.slice(prev.length);
    return d === "" ? null : d;
  }
  return next;
}

function toolDetail(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.slice(0, 400);
  try {
    return JSON.stringify(value).slice(0, 400);
  } catch {
    return undefined;
  }
}

export function createCursorEventMapper() {
  let assistantText = "";
  let thinkingText = "";
  let sessionEmitted = false;

  return function map(
    ev: unknown,
    fallbackSession: SessionId | null,
  ): AgentEvent[] {
    if (typeof ev !== "object" || ev === null) return [];
    const e = ev as CursorSdkMessage;
    if (typeof e.type !== "string") return [];

    const out: AgentEvent[] = [];
    const sid =
      typeof e.agent_id === "string" && e.agent_id !== ""
        ? e.agent_id
        : fallbackSession;
    if (!sessionEmitted && sid != null) {
      sessionEmitted = true;
      out.push({ type: "session", sessionId: sid });
    }

    if (e.type === "assistant") {
      const parts = splitContent(e.message?.content);
      const think = delta(
        thinkingText === "" ? undefined : thinkingText,
        parts.thinking,
      );
      if (think != null) {
        thinkingText = parts.thinking.startsWith(thinkingText)
          ? parts.thinking
          : thinkingText + think;
        out.push({ type: "reasoning-delta", text: think });
      }
      const d = delta(assistantText === "" ? undefined : assistantText, parts.text);
      if (d != null) {
        assistantText = parts.text.startsWith(assistantText)
          ? parts.text
          : assistantText + d;
        out.push({ type: "text-delta", text: d });
      }
      return out;
    }

    if (
      e.type === "thinking" ||
      e.type === "thought" ||
      e.type === "reasoning"
    ) {
      const fromMsg = splitContent(e.message?.content).thinking;
      const next =
        typeof e.text === "string" && e.text !== ""
          ? e.text
          : fromMsg !== ""
            ? fromMsg
            : splitContent(e.message?.content).text;
      const d = delta(thinkingText === "" ? undefined : thinkingText, next);
      if (d != null) {
        thinkingText = next.startsWith(thinkingText) ? next : thinkingText + d;
        out.push({ type: "reasoning-delta", text: d });
      }
      return out;
    }

    if (e.type === "tool_call") {
      const name = typeof e.name === "string" ? e.name : "tool";
      const id = typeof e.call_id === "string" ? e.call_id : undefined;
      const status = e.status === "running" ? "start" : "end";
      out.push({
        type: "tool",
        id,
        name,
        status,
        detail: toolDetail(status === "start" ? e.args : undefined),
      });
      if (isTodoTool(name)) {
        const todos = parseTodos(e.args);
        if (todos.length > 0) out.push({ type: "todo", todos });
      }
      return out;
    }

    if (e.type === "usage" && typeof e.usage === "object" && e.usage !== null) {
      const usage = e.usage as {
        inputTokens?: unknown;
        cacheReadTokens?: unknown;
        cacheWriteTokens?: unknown;
      };
      const num = (v: unknown) => (typeof v === "number" ? v : 0);
      const total =
        num(usage.inputTokens) +
        num(usage.cacheReadTokens) +
        num(usage.cacheWriteTokens);
      if (total > 0) {
        out.push({ type: "usage", contextTokens: total });
      }
      return out;
    }

    if (e.type === "request" && typeof e.request_id === "string") {
      out.push({
        type: "permission",
        permissionId: e.request_id,
        summary: "Cursor asks for confirmation",
      });
      return out;
    }

    if (e.type === "status" && e.status === "ERROR") {
      const message =
        typeof e.text === "string" && e.text !== ""
          ? e.text
          : "Cursor: turn failed";
      out.push({ type: "error", message });
      return out;
    }

    if (e.type === "done") {
      out.push({ type: "done" });
      return out;
    }

    if (e.type === "error") {
      const message =
        typeof e.text === "string" ? e.text : "Cursor: error de sidecar";
      out.push({ type: "error", message });
      return out;
    }

    return out;
  };
}
