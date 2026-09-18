// todos.ts — lista de tareas que el agente-producto publica durante un turno
// (todo.updated de OpenCode, tool calls todowrite / update_plan de los CLI).
// Pura: sin React, sin fetch, sin Tauri. Evento `todo` de AgentEvent (§4).

export type AgentTodoStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export type AgentTodo = {
  id: string;
  content: string;
  status: AgentTodoStatus;
};

/** Estados crudos que reportan los providers → estado del contrato. */
const STATUS_ALIASES: Record<string, AgentTodoStatus> = {
  pending: "pending",
  in_progress: "in_progress",
  "in-progress": "in_progress",
  inprogress: "in_progress",
  active: "in_progress",
  current: "in_progress",
  completed: "completed",
  complete: "completed",
  done: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
};

/** Nombres (normalizados, sin separadores) de los tool calls que publican la
 * lista de tareas en los distintos CLI: todowrite, write_todos, update_plan… */
const TODO_TOOLS = new Set([
  "todowrite",
  "todoupdate",
  "writetodos",
  "updatetodos",
  "updateplan",
  "setplan",
]);

export function isTodoTool(name: string): boolean {
  return TODO_TOOLS.has(name.toLowerCase().replace(/[^a-z]/g, ""));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstString(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = item[key];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

/** Acepta el payload crudo del provider (args del tool call, evento de bus)
 * y lo normaliza a la lista del contrato. Ignora lo que no sepa parsear. */
export function parseTodos(raw: unknown): AgentTodo[] {
  const items = todoItems(raw);
  const out: AgentTodo[] = [];
  items.forEach((item, index) => {
    const todo = toTodo(item, index);
    if (todo !== null) out.push(todo);
  });
  return out;
}

function todoItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) {
    for (const key of ["todos", "plan", "items"]) {
      const v = raw[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function toTodo(item: unknown, index: number): AgentTodo | null {
  if (typeof item === "string") {
    const content = item.trim();
    return content === "" ? null : { id: `todo-${index + 1}`, content, status: "pending" };
  }
  if (!isRecord(item)) return null;
  const content = firstString(item, [
    "content",
    "text",
    "description",
    "subject",
    "title",
    "activeForm",
  ]);
  if (content === null) return null;
  const rawStatus = firstString(item, ["status", "state"])?.toLowerCase() ?? "";
  const status = STATUS_ALIASES[rawStatus] ?? "pending";
  const id = firstString(item, ["id"]) ?? `todo-${index + 1}`;
  return { id, content, status };
}

/** El snapshot nuevo REEMPLAZA la lista previa. Reutiliza el id previo de un
 * item con igual contenido para que las claves de render no bailen entre
 * snapshots; deduplica por contenido (primera aparición gana) y renombra
 * ids repetidos en vez de perder tareas mal formadas. */
export function replaceTodos(
  prev: AgentTodo[] | null,
  next: AgentTodo[],
): AgentTodo[] {
  const prevIdByContent = new Map((prev ?? []).map((t) => [t.content, t.id]));
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  const out: AgentTodo[] = [];
  next.forEach((t, index) => {
    const content = t.content.trim();
    if (content === "" || seenContent.has(content)) return;
    let id = t.id || prevIdByContent.get(content) || `todo-${index + 1}`;
    while (seenIds.has(id)) id = `${id}+`;
    seenIds.add(id);
    seenContent.add(content);
    out.push({ id, content, status: t.status });
  });
  return out;
}
