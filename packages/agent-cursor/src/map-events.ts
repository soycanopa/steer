// SDKMessage del sidecar Cursor → AgentEvent. El stream puede mandar
// snapshots de texto; emitimos solo deltas.

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
};

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as { type?: unknown; text?: unknown };
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
    }
  }
  return parts.join("");
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
      const next = textFromContent(e.message?.content);
      const d = delta(assistantText === "" ? undefined : assistantText, next);
      if (d != null) {
        assistantText = next.startsWith(assistantText)
          ? next
          : assistantText + d;
        out.push({ type: "text-delta", text: d });
      }
      return out;
    }

    if (e.type === "thinking") {
      const next = typeof e.text === "string" ? e.text : "";
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
      return out;
    }

    if (e.type === "request" && typeof e.request_id === "string") {
      out.push({
        type: "permission",
        permissionId: e.request_id,
        summary: "Cursor pide confirmación",
      });
      return out;
    }

    if (e.type === "status" && e.status === "ERROR") {
      const message =
        typeof e.text === "string" && e.text !== ""
          ? e.text
          : "Cursor: el turno falló";
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
