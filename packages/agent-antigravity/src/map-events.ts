// stream-json de `agy` → AgentEvent.

import type { AgentEvent, SessionId } from "@steer/ports";

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function conversationId(ev: Record<string, unknown>): string | undefined {
  if (typeof ev.conversation_id === "string" && ev.conversation_id !== "") {
    return ev.conversation_id;
  }
  const nested = ev.init ?? ev.step_update ?? ev.result;
  if (typeof nested === "object" && nested !== null) {
    const id = (nested as { conversation_id?: unknown }).conversation_id;
    if (typeof id === "string" && id !== "") return id;
  }
  return undefined;
}

export function createAgyEventMapper() {
  let sessionEmitted = false;
  const toolSeen = new Set<string>();

  return function map(
    ev: unknown,
    fallbackSession: SessionId | null,
  ): AgentEvent[] {
    if (typeof ev !== "object" || ev === null) return [];
    const e = ev as Record<string, unknown>;
    const kind = typeof e.event === "string" ? e.event : typeof e.type === "string" ? e.type : "";
    if (kind === "") return [];

    const out: AgentEvent[] = [];
    const sid = conversationId(e) ?? fallbackSession;
    if (!sessionEmitted && sid != null) {
      sessionEmitted = true;
      out.push({ type: "session", sessionId: sid });
    }

    if (kind === "init" || kind === "session") {
      return out;
    }

    if (kind === "step_update") {
      const step =
        typeof e.step_update === "object" && e.step_update !== null
          ? (e.step_update as Record<string, unknown>)
          : e;
      const stepType = textOf(step.step_type);
      const state = textOf(step.state);
      const delta = textOf(step.text_delta);
      if (stepType === "agent_response" && delta !== "") {
        out.push({ type: "text-delta", text: delta });
      }
      if (stepType === "thinking" && delta !== "") {
        out.push({ type: "reasoning-delta", text: delta });
      }
      if (stepType === "tool") {
        const name = textOf(step.tool_name) || "tool";
        const id = `${textOf(step.step_index) || "t"}-${name}`;
        if (state === "ACTIVE" && !toolSeen.has(id)) {
          toolSeen.add(id);
          out.push({ type: "tool", id, name, status: "start" });
        }
        if (state === "DONE") {
          out.push({
            type: "tool",
            id,
            name,
            status: "end",
            detail:
              typeof step.tool_info === "object" && step.tool_info !== null
                ? JSON.stringify(step.tool_info).slice(0, 400)
                : undefined,
          });
        }
      }
      return out;
    }

    if (kind === "result") {
      const result =
        typeof e.result === "object" && e.result !== null
          ? (e.result as Record<string, unknown>)
          : e;
      const status = textOf(result.status);
      if (status !== "" && status !== "SUCCESS") {
        const message =
          textOf(result.error) !== ""
            ? textOf(result.error)
            : `Antigravity: ${status}`;
        out.push({ type: "error", message });
        return out;
      }
      out.push({ type: "done" });
      return out;
    }

    if (kind === "error") {
      out.push({
        type: "error",
        message:
          textOf(e.message) !== ""
            ? textOf(e.message)
            : "Antigravity: el turno falló",
      });
    }

    return out;
  };
}
