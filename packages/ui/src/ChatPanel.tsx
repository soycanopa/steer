// ChatPanel — UI.md §6. Transcript (abajo = último), IntentBatchCard,
// stream del agente (Fase F) y composer. Sin imports de adapters.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  History,
  MessagesSquare,
  Pin,
  Plus,
  SendHorizontal,
  Square,
  X,
} from "lucide-react";
import type { ApplyPayload, Intent } from "@steer/domain";

export type AgentModeUi = "ask" | "plan" | "agent";

const AGENT_MODES: Array<{
  id: AgentModeUi;
  label: string;
  hint: string;
}> = [
  { id: "ask", label: "Ask", hint: "Solo pregunta / explica" },
  { id: "plan", label: "Plan", hint: "Propone cambios sin escribir" },
  { id: "agent", label: "Agent", hint: "Edita el repo (build)" },
];

export type AgentSessionItemView = {
  id: string;
  title: string;
  createdAt: number;
  bound: boolean;
};

export type TranscriptToolView = {
  name: string;
  status: "start" | "end";
  detail?: string;
};

export type TranscriptBlockView =
  | { kind: "user"; id: string; text: string }
  | { kind: "batch"; id: string; payload: ApplyPayload }
  | { kind: "image"; id: string; mime: string; dataBase64: string; name: string }
  | {
      kind: "agent";
      id: string;
      text: string;
      tools: TranscriptToolView[];
      status: "streaming" | "done" | "error";
    };

export type ModelOptionView = {
  key: string;
  label: string;
  reasoning: boolean;
};

export type SessionView = {
  id: string;
  title: string | null;
  createdAt: number;
  blockCount: number;
  active: boolean;
};

export type PendingCommentView = {
  id: string;
  pin: number;
  body: string;
};

export type ChatAttachmentView = {
  id: string;
  mime: string;
  dataBase64: string;
  name: string;
};

export type ChatPanelProps = {
  transcript: TranscriptBlockView[];
  sessionTitle: string | null;
  sessions: SessionView[];
  queueCount: number;
  /** Capturas pendientes: thumbnail en el composer, no pill de comentarios. */
  attachments: ChatAttachmentView[];
  draftNote: string;
  pendingComments: PendingCommentView[];
  models: ModelOptionView[];
  selectedModelKey: string | null;
  agentMode: AgentModeUi;
  agentBusy: boolean;
  agentOnline: boolean;
  /** Sesiones OpenCode del proyecto (picker). */
  agentSessions: AgentSessionItemView[];
  onDraftNote(text: string): void;
  onApply(): void;
  onClearQueue(): void;
  onNewSession(): void;
  onSelectSession(id: string): void;
  onSelectModel(key: string): void;
  onSetAgentMode(mode: AgentModeUi): void;
  onRefreshAgentSessions(): void;
  onBindAgentSession(id: string): void;
  onAbort(): void;
  onRemoveComment(id: string): void;
  onFocusComment(id: string): void;
  onRemoveAttachment(id: string): void;
};

export function ChatPanel({
  transcript,
  sessionTitle,
  sessions,
  queueCount,
  attachments,
  draftNote,
  pendingComments,
  models,
  selectedModelKey,
  agentMode,
  agentBusy,
  agentOnline,
  agentSessions,
  onDraftNote,
  onApply,
  onClearQueue,
  onNewSession,
  onSelectSession,
  onSelectModel,
  onSetAgentMode,
  onRefreshAgentSessions,
  onBindAgentSession,
  onAbort,
  onRemoveComment,
  onFocusComment,
  onRemoveAttachment,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [agentSessionsOpen, setAgentSessionsOpen] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  function toggleAgentSessions() {
    const next = !agentSessionsOpen;
    setAgentSessionsOpen(next);
    if (next) onRefreshAgentSessions();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-1)]">
      <div className="flex h-8 shrink-0 items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-1)] text-[var(--text-1)]">
          {sessionTitle ?? "Nueva sesión"}
        </span>
        <button
          type="button"
          onClick={toggleAgentSessions}
          title="Sesiones OpenCode de este proyecto"
          className={`flex size-5 items-center justify-center rounded-[var(--radius-s)] transition-colors duration-120 ${
            agentSessionsOpen
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--text-1)] hover:bg-[var(--bg-3)]"
          }`}
        >
          <MessagesSquare size={13} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          title={`Sesiones locales (${sessions.length})`}
          className={`flex size-5 items-center justify-center rounded-[var(--radius-s)] transition-colors duration-120 ${
            historyOpen
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--text-1)] hover:bg-[var(--bg-3)]"
          }`}
        >
          <History size={13} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onNewSession}
          title="Nueva sesión"
          className="flex size-5 items-center justify-center rounded-[var(--radius-s)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-3)]"
        >
          <Plus size={13} strokeWidth={1.75} />
        </button>
      </div>
      {agentSessionsOpen ? (
        <AgentSessionsList
          items={agentSessions}
          onSelect={(id) => {
            onBindAgentSession(id);
            setAgentSessionsOpen(false);
          }}
          onRefresh={onRefreshAgentSessions}
          onClose={() => setAgentSessionsOpen(false)}
        />
      ) : historyOpen ? (
        <SessionList sessions={sessions} onSelect={onSelectSession} />
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {transcript.length === 0 ? (
          <p className="mt-6 text-center text-[length:var(--fs-1)] text-[var(--text-2)]">
            Deja comentarios en el preview o escribe una nota; el envío va al agente.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {transcript.map((block) => {
              if (block.kind === "user") {
                return <UserBlock key={block.id} text={block.text} />;
              }
              if (block.kind === "image") {
                return (
                  <div
                    key={block.id}
                    className="w-fit max-w-full overflow-hidden rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)]"
                  >
                    <img
                      src={`data:${block.mime};base64,${block.dataBase64}`}
                      alt={block.name}
                      className="max-h-36 max-w-[220px] object-cover"
                    />
                    <p className="border-t border-[var(--line)] px-2 py-1 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
                      {block.name}
                    </p>
                  </div>
                );
              }
              if (block.kind === "agent") {
                return (
                  <AgentBlock
                    key={block.id}
                    text={block.text}
                    tools={block.tools}
                    status={block.status}
                  />
                );
              }
              return <IntentBatchCard key={block.id} payload={block.payload} />;
            })}
          </div>
        )}
      </div>

      {/* Sin border-t: la columna chat no lleva línea superior sobre el composer. */}
      <div className="relative shrink-0 px-3 pt-2 pb-3">
        {agentBusy ? (
          <button
            type="button"
            onClick={onAbort}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-m)] bg-[var(--bg-2)] px-3 py-1.5 text-[length:var(--fs-1)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-3)]"
          >
            <Square size={11} strokeWidth={2} className="fill-current" />
            Detener turno
          </button>
        ) : null}

        <PendingComments
          comments={pendingComments}
          onFocus={onFocusComment}
          onRemove={onRemoveComment}
        />

        <Composer
          value={draftNote}
          onChange={onDraftNote}
          onSubmit={onApply}
          canSend={
            (queueCount > 0 || attachments.length > 0 || draftNote.trim() !== "") &&
            !agentBusy &&
            agentOnline
          }
          sendHint={
            pendingComments.length > 0
              ? `Enviar ${pendingComments.length} comentario${pendingComments.length === 1 ? "" : "s"} al agente (⌘Enter)`
              : attachments.length > 0
                ? "Enviar captura al agente (⌘Enter)"
                : "Enviar al agente (⌘Enter)"
          }
          attachments={attachments}
          onRemoveAttachment={onRemoveAttachment}
          models={models}
          selectedModelKey={selectedModelKey}
          onSelectModel={onSelectModel}
          agentMode={agentMode}
          onSetAgentMode={onSetAgentMode}
          agentOnline={agentOnline}
        />
      </div>
    </div>
  );
}

/**
 * Comentarios pendientes en el chat.
 * · 1–2: tags sueltos (ver / quitar)
 * · 3+: un chip “N comentarios” abre un popover con la lista
 */
function PendingComments({
  comments,
  onFocus,
  onRemove,
}: {
  comments: PendingCommentView[];
  onFocus(id: string): void;
  onRemove(id: string): void;
}) {
  const [open, setOpen] = useState(false);

  if (comments.length === 0) return null;

  if (comments.length > 2) {
    return (
      <div className="relative mb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pin)]/40 bg-[var(--pin)]/12 px-2.5 py-1 text-[length:var(--fs-0)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--pin)]/20"
        >
          <Pin size={11} strokeWidth={1.75} className="text-[var(--pin)]" />
          {comments.length} comentarios
          <ChevronDown
            size={11}
            strokeWidth={1.75}
            className={`text-[var(--text-2)] transition-transform duration-120 ${open ? "" : "-rotate-90"}`}
          />
        </button>
        {open ? (
          <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-full min-w-[220px] overflow-y-auto rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)] py-1 shadow-lg">
            {comments.map((c) => (
              <div
                key={c.id}
                className="group flex items-start gap-1.5 px-2.5 py-1.5 hover:bg-[var(--bg-2)]"
              >
                <button
                  type="button"
                  onClick={() => onFocus(c.id)}
                  title="Ver en el preview"
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="font-mono text-[var(--pin)]">#{c.pin}</span>{" "}
                  <span className="text-[length:var(--fs-1)] text-[var(--text-1)]">
                    {c.body}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(c.id)}
                  title="Eliminar"
                  className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--danger)]"
                >
                  <X size={10} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {comments.map((c) => (
        <span
          key={c.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--pin)]/40 bg-[var(--pin)]/12 py-0.5 pr-1 pl-2 text-[length:var(--fs-0)] text-[var(--text-0)]"
        >
          <button
            type="button"
            onClick={() => onFocus(c.id)}
            title={c.body}
            className="min-w-0 max-w-[160px] truncate text-left hover:text-[var(--pin)]"
          >
            <span className="font-mono text-[var(--pin)]">#{c.pin}</span>{" "}
            {c.body}
          </button>
          <button
            type="button"
            onClick={() => onRemove(c.id)}
            title="Quitar comentario"
            className="flex size-4 shrink-0 items-center justify-center rounded-full text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--danger)]"
          >
            <X size={10} strokeWidth={2} />
          </button>
        </span>
      ))}
    </div>
  );
}

function SessionList({
  sessions,
  onSelect,
}: {
  sessions: SessionView[];
  onSelect(id: string): void;
}) {
  const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <ul className="max-h-44 shrink-0 overflow-y-auto bg-[var(--bg-0)] py-1">
      {sorted.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onSelect(s.id)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-120 ${
              s.active ? "bg-[var(--accent-dim)]" : "hover:bg-[var(--bg-2)]"
            }`}
          >
            <span className="min-w-0 flex-1 truncate text-[length:var(--fs-1)] text-[var(--text-0)]">
              {s.title ?? "Nueva sesión"}
            </span>
            <span className="shrink-0 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
              {new Date(s.createdAt).toLocaleDateString()}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Sesiones OpenCode del directorio del proyecto. */
function AgentSessionsList({
  items,
  onSelect,
  onRefresh,
  onClose,
}: {
  items: AgentSessionItemView[];
  onSelect(id: string): void;
  onRefresh(): void;
  onClose(): void;
}) {
  return (
    <div className="max-h-56 shrink-0 overflow-y-auto border-b border-[var(--line)] bg-[var(--bg-0)] py-1">
      <div className="flex items-center gap-1 px-2 pb-1">
        <span className="min-w-0 flex-1 truncate font-mono text-[length:var(--fs-0)] text-[var(--text-2)] uppercase">
          Sesiones OpenCode
        </span>
        <button
          type="button"
          onClick={onRefresh}
          title="Actualizar"
          className="flex size-4 items-center justify-center text-[var(--text-2)] hover:text-[var(--text-0)]"
        >
          <ChevronUp size={11} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar"
          className="flex size-4 items-center justify-center text-[var(--text-2)] hover:text-[var(--text-0)]"
        >
          <X size={11} strokeWidth={1.75} />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-2)]">
          Sin sesiones de OpenCode para este proyecto.
        </p>
      ) : (
        <ul>
          {items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-120 hover:bg-[var(--bg-2)] ${
                  s.bound ? "bg-[var(--accent-dim)]" : ""
                }`}
              >
                <Bot size={12} strokeWidth={1.75} className="shrink-0 text-[var(--text-2)]" />
                <span className="min-w-0 flex-1 truncate text-[length:var(--fs-1)] text-[var(--text-0)]">
                  {s.title}
                </span>
                {s.bound ? (
                  <span className="shrink-0 font-mono text-[length:var(--fs-0)] text-[var(--accent)]">
                    activa
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserBlock({ text }: { text: string }) {
  return (
    <div className="w-fit max-w-full rounded-[var(--radius-m)] bg-[var(--bg-2)] px-3 py-2 text-[length:var(--fs-2)] text-[var(--text-0)]">
      {text}
    </div>
  );
}

// UI.md §6.2: card con header "N intents · scope(s)" + lista de intents.
// Colapsado muestra solo el header.
function IntentBatchCard({ payload }: { payload: ApplyPayload }) {
  const [open, setOpen] = useState(true);
  const intents = payload.intents;
  const scopes = [
    ...new Set(
      intents.map((i) => ("scope" in i ? i.scope : null)).filter((s) => s !== null),
    ),
  ].join(" + ");
  const header = `${intents.length} intent${intents.length === 1 ? "" : "s"}${scopes ? ` · ${scopes}` : ""}`;

  return (
    <div className="overflow-hidden rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-2)]"
      >
        <span>{header}</span>
        <ChevronDown
          size={13}
          strokeWidth={1.75}
          className={`text-[var(--text-2)] transition-transform duration-120 ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? (
        <ul className="border-t border-[var(--line)] px-3 py-2">
          {intents.map((intent) => (
            <IntentRow key={intent.id} intent={intent} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function IntentRow({ intent }: { intent: Intent }) {
  if (intent.kind === "comment") {
    const loc = `${intent.selection.source.file}:${intent.selection.source.line}`;
    return (
      <IntentRowShell
        icon={<Pin size={11} strokeWidth={1.75} className="shrink-0 text-[var(--pin)]" />}
        loc={loc}
        text={`#${intent.pin} “${intent.body}”`}
      />
    );
  }
  if (intent.kind === "tweak") {
    const loc = `${intent.selection.source.file}:${intent.selection.source.line}`;
    return (
      <IntentRowShell
        icon={<span className="size-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />}
        loc={loc}
        text={`${intent.prop} ${intent.from} → ${intent.to}`}
      />
    );
  }
  if (intent.kind === "select") {
    const loc = `${intent.selection.source.file}:${intent.selection.source.line}`;
    return <IntentRowShell icon={null} loc={loc} text={`<${intent.selection.tag}>`} />;
  }
  return <IntentRowShell icon={null} loc="—" text="screenshot" />;
}

function IntentRowShell({
  icon,
  loc,
  text,
}: {
  icon: ReactNode | null;
  loc: string;
  text: string;
}) {
  return (
    <li className="flex items-center gap-2 py-0.5 font-mono text-[length:var(--fs-0)] text-[var(--text-1)]">
      {icon}
      <span className="min-w-0 flex-1 truncate">
        {loc} {text}
      </span>
    </li>
  );
}

// Stream del agente (Fase F): texto + tool calls básicos.
function AgentBlock({
  text,
  tools,
  status,
}: {
  text: string;
  tools: TranscriptToolView[];
  status: "streaming" | "done" | "error";
}) {
  const border =
    status === "error"
      ? "border-[var(--danger)]"
      : status === "done"
        ? "border-[var(--ok)]/40"
        : "border-[var(--accent)]/50";
  return (
    <div
      className={`rounded-[var(--radius-m)] border ${border} bg-[var(--bg-0)] px-3 py-2`}
    >
      <div className="mb-1 flex items-center gap-2 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
        <span
          className={
            status === "error"
              ? "text-[var(--danger)]"
              : status === "done"
                ? "text-[var(--ok)]"
                : "text-[var(--accent)]"
          }
        >
          {status === "streaming"
            ? "OpenCode…"
            : status === "done"
              ? "OpenCode"
              : "OpenCode · error"}
        </span>
      </div>
      {tools.length > 0 ? (
        <ul className="mb-1.5 space-y-0.5">
          {tools.map((t, i) => (
            <li
              key={`${t.name}-${i}`}
              className="truncate font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
            >
              <span className={t.status === "start" ? "text-[var(--warn)]" : "text-[var(--text-2)]"}>
                {t.status === "start" ? "·" : "✓"}
              </span>{" "}
              {t.name}
              {t.detail ? ` — ${t.detail}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {text !== "" ? (
        <p className="text-[length:var(--fs-2)] whitespace-pre-wrap text-[var(--text-1)]">
          {text}
        </p>
      ) : status === "streaming" ? (
        <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">escribiendo…</p>
      ) : null}
    </div>
  );
}

// Composer: textarea alto con fila inferior DENTRO del campo:
// [modo agent] [select modelo] [enviar]
function Composer({
  value,
  onChange,
  onSubmit,
  canSend,
  sendHint,
  attachments,
  onRemoveAttachment,
  models,
  selectedModelKey,
  onSelectModel,
  agentMode,
  onSetAgentMode,
  agentOnline,
}: {
  value: string;
  onChange(text: string): void;
  onSubmit(): void;
  canSend: boolean;
  sendHint?: string;
  attachments: ChatAttachmentView[];
  onRemoveAttachment(id: string): void;
  models: ModelOptionView[];
  selectedModelKey: string | null;
  onSelectModel(key: string): void;
  agentMode: AgentModeUi;
  onSetAgentMode(mode: AgentModeUi): void;
  agentOnline: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [modeOpen, setModeOpen] = useState(false);

  function autoGrow() {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
  }

  return (
    <div className="relative rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-2)] focus-within:border-[var(--accent)]">
      {attachments.length > 0 ? (
        <div className="flex gap-1.5 px-2 pt-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative size-12 overflow-hidden rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--bg-0)]"
            >
              <img
                src={`data:${a.mime};base64,${a.dataBase64}`}
                alt={a.name}
                className="size-full object-cover"
              />
              <button
                type="button"
                title="Quitar captura"
                onClick={() => onRemoveAttachment(a.id)}
                className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-[var(--bg-0)] text-[var(--text-2)] hover:text-[var(--danger)]"
              >
                <X size={9} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <textarea
        ref={ref}
        rows={3}
        value={value}
        placeholder="Nota opcional… (el envío manda comentarios + cola al agente)"
        onChange={(e) => {
          onChange(e.target.value);
          autoGrow();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        className="max-h-[140px] min-h-[96px] w-full resize-none rounded-t-[var(--radius-m)] bg-transparent px-3 pt-2.5 pb-10 text-[length:var(--fs-2)] text-[var(--text-0)] outline-none placeholder:text-[var(--text-2)]"
      />

      {/* Controles dentro del input */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 px-2 pb-2">
        <div className="relative pointer-events-auto">
          <button
            type="button"
            onClick={() => setModeOpen((v) => !v)}
            title={`Modo agente: ${agentMode}`}
            className="flex h-6 items-center gap-1 rounded-[var(--radius-s)] bg-[var(--bg-3)] px-1.5 font-mono text-[length:var(--fs-0)] text-[var(--text-1)] transition-colors duration-120 hover:text-[var(--text-0)]"
          >
            <Bot size={11} strokeWidth={1.75} />
            {agentMode}
          </button>
          {modeOpen ? (
            <>
              <button
                type="button"
                aria-label="Cerrar"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setModeOpen(false)}
              />
              <div className="absolute bottom-full left-0 z-20 mb-1 w-40 rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)] py-1 shadow-lg">
                {AGENT_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSetAgentMode(m.id);
                      setModeOpen(false);
                    }}
                    className={`flex w-full flex-col items-start px-2.5 py-1.5 text-left transition-colors duration-120 ${
                      agentMode === m.id
                        ? "bg-[var(--accent-dim)]"
                        : "hover:bg-[var(--bg-2)]"
                    }`}
                  >
                    <span className="text-[length:var(--fs-1)] text-[var(--text-0)]">
                      {m.label}
                    </span>
                    <span className="font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
                      {m.hint}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <select
          aria-label="Modelo"
          value={selectedModelKey ?? ""}
          onChange={(e) => {
            if (e.target.value !== "") onSelectModel(e.target.value);
          }}
          disabled={models.length === 0}
          title={
            models.length === 0
              ? "OpenCode no responde — no hay modelos"
              : "Modelo del agente"
          }
          className="pointer-events-auto h-6 min-w-0 max-w-[140px] flex-1 truncate rounded-[var(--radius-s)] bg-[var(--bg-3)] px-1.5 font-mono text-[length:var(--fs-0)] text-[var(--text-1)] outline-none disabled:opacity-40"
        >
          {models.length === 0 ? (
            <option value="">{agentOnline ? "sin modelos" : "OpenCode off"}</option>
          ) : (
            models.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))
          )}
        </select>

        <button
          type="button"
          onClick={() => canSend && onSubmit()}
          disabled={!canSend}
          title={sendHint ?? "Enviar al agente (⌘Enter)"}
          className="pointer-events-auto ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-colors duration-120 hover:bg-[#6c99ff] disabled:opacity-40"
        >
          <SendHorizontal size={13} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
