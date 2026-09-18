// TodoPanel — lista de tareas que el agente-producto publica durante el
// turno (AgentEvent `todo`, UI.md §6). Colapsable; vive solo durante el
// turno: app-state la limpia en done/error y el panel desaparece.

import { memo, useState } from "react";
import { Check, ChevronDown, Circle, ListTodo, LoaderCircle, X } from "lucide-react";
import type { AgentTodo } from "@steer/domain";
import { t } from "./i18n";

function TodoRow({ todo }: { todo: AgentTodo }) {
  if (todo.status === "completed") {
    return (
      <li className="flex items-start gap-1.5 py-0.5">
        <Check size={12} className="mt-[3px] shrink-0 text-[var(--ok)]" aria-hidden />
        <span className="text-[length:var(--fs-1)] text-[var(--text-1)]">
          {todo.content}
        </span>
      </li>
    );
  }
  if (todo.status === "in_progress") {
    return (
      <li className="flex items-start gap-1.5 py-0.5">
        <LoaderCircle
          size={12}
          className="mt-[3px] shrink-0 animate-spin text-[var(--warn)]"
          aria-hidden
        />
        <span className="steer-shimmer text-[length:var(--fs-1)] text-[var(--text-0)]">
          {todo.content}
        </span>
      </li>
    );
  }
  if (todo.status === "cancelled") {
    return (
      <li className="flex items-start gap-1.5 py-0.5">
        <X size={12} className="mt-[3px] shrink-0 text-[var(--text-2)]" aria-hidden />
        <span className="text-[length:var(--fs-1)] text-[var(--text-2)] line-through">
          {todo.content}
        </span>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-1.5 py-0.5">
      <Circle size={12} className="mt-[3px] shrink-0 text-[var(--text-2)]" aria-hidden />
      <span className="text-[length:var(--fs-1)] text-[var(--text-2)]">
        {todo.content}
      </span>
    </li>
  );
}

/**
 * Panel colapsable sobre el composer. `open` es estado local sincronizado
 * con onToggle: sin eso, cada snapshot de todos re-abría el panel cerrado.
 */
export const TodoPanel = memo(function TodoPanel({
  todos,
}: {
  todos: AgentTodo[] | null;
}) {
  const [open, setOpen] = useState(true);
  if (todos == null || todos.length === 0) return null;
  const done = todos.filter((t) => t.status === "completed").length;
  const inProgress = todos.filter((t) => t.status === "in_progress").length;
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--bg-1)]"
    >
      <summary className="cursor-pointer list-none px-2 py-1 font-mono text-[length:var(--fs-0)] text-[var(--text-2)] marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1">
          <ChevronDown
            size={12}
            className="transition group-open:rotate-180"
            aria-hidden
          />
          <ListTodo size={12} aria-hidden />
          <span className={inProgress > 0 ? "steer-shimmer" : undefined}>
            {t.todos.title}
          </span>
          <span className="text-[var(--text-1)]">
            {done}/{todos.length}
          </span>
          {inProgress > 0 ? (
            <span className="text-[var(--warn)]">
              {t.common.inProgressNote(inProgress)}
            </span>
          ) : null}
        </span>
      </summary>
      <ul className="border-t border-[var(--line)] px-3 py-2">
        {todos.map((t) => (
          <TodoRow key={t.id} todo={t} />
        ))}
      </ul>
    </details>
  );
});
