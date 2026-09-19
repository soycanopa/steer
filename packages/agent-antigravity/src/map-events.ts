// stream-json de `agy` → AgentEvent.

import { isTodoTool, parseTodos } from "@steer/domain";
import type { AgentEvent, SessionId } from "@steer/ports";

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const THOUGHT_STEPS = new Set([
  "thinking",
  "thought",
  "reasoning",
  "planner",
]);

function isThoughtStep(stepType: string): boolean {
  return THOUGHT_STEPS.has(stepType);
}

/** Tool args que publican la lista de tareas (tool_args al arrancar,
 * tool_info al terminar). null si el tool no es de todos o no trae lista. */
function todosFromStep(
  step: Record<string, unknown>,
  name: string,
): ReturnType<typeof parseTodos> | null {
  if (!isTodoTool(name)) return null;
  for (const key of ["tool_args", "args", "input", "tool_info"]) {
    if (key in step) {
      const todos = parseTodos(step[key]);
      if (todos.length > 0) return todos;
    }
  }
  return null;
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
      const thoughtDelta =
        textOf(step.thought_delta) ||
        textOf(step.reasoning_delta) ||
        (isThoughtStep(stepType) ? textOf(step.text_delta) : "");
      const replyDelta =
        !isThoughtStep(stepType) && stepType === "agent_response"
          ? textOf(step.text_delta)
          : "";
      // Usage POR-TURNO: step agent_response DONE = prompt real del turno
      // (input nuevos + cache leída). result.usage es acumulativo: no sirve
      // para el anillo de contexto (docs headless + verificado en vivo).
      if (state === "DONE" && stepType === "agent_response") {
        const usage =
          typeof step.usage === "object" && step.usage !== null
            ? (step.usage as Record<string, unknown>)
            : null;
        const num = (v: unknown) => (typeof v === "number" ? v : 0);
        const contextTokens =
          num(usage?.input_tokens) + num(usage?.cache_read_tokens);
        if (contextTokens > 0) {
          out.push({ type: "usage", contextTokens });
        }
      }
      if (replyDelta !== "") {
        out.push({ type: "text-delta", text: replyDelta });
      }
      if (thoughtDelta !== "") {
        out.push({ type: "reasoning-delta", text: thoughtDelta });
      }
      if (stepType === "tool") {
        const name = textOf(step.tool_name) || "tool";
        const id = `${textOf(step.step_index) || "t"}-${name}`;
        if (state === "ACTIVE" && !toolSeen.has(id)) {
          toolSeen.add(id);
          out.push({ type: "tool", id, name, status: "start" });
          const todos = todosFromStep(step, name);
          if (todos !== null) out.push({ type: "todo", todos });
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
          const todos = todosFromStep(step, name);
          if (todos !== null) out.push({ type: "todo", todos });
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
      // result.usage es ACUMULATIVO de la sesión (docs headless §streaming):
      // el contexto real del turno viene por step_update (ver abajo).
      out.push({ type: "done" });
      return out;
    }

    if (kind === "error") {
      out.push({
        type: "error",
        message:
          textOf(e.message) !== ""
            ? textOf(e.message)
            : "Antigravity: turn failed",
      });
    }

    return out;
  };
}
