// ChatPanel — UI.md §6. Transcript (abajo = último), IntentBatchCard,
// stream del agente (Fase F) y composer. Sin imports de adapters.

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  History,
  Lock,
  Pin,
  Plus,
  SendHorizontal,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { ApplyPayload, Intent, TweakProp } from "@steer/domain";
import {
  ModelSelector,
  type AgentAdapterView,
  type ProviderGroupView,
  type ReasoningEffortUi,
} from "./ModelSelector";
import { QuestionCard } from "./QuestionCard";
import { LoadingState } from "./LoadingState";

export type PermissionPolicyUi = "default" | "always";

const PERMISSION_POLICIES: Array<{
  id: PermissionPolicyUi;
  label: string;
  hint: string;
}> = [
  { id: "default", label: "Default", hint: "Pide permiso en cada tool" },
  { id: "always", label: "Always approved", hint: "Auto-aprueba las tools" },
];

export type AgentSessionItemView = {
  id: string;
  title: string;
  createdAt: number;
  bound: boolean;
};

export type TranscriptToolView = {
  id?: string;
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
      reasoning: string;
      tools: TranscriptToolView[];
      status: "streaming" | "done" | "error";
    }
  | {
      kind: "question";
      id: string;
      questionId: string;
      prompt: string;
      options?: string[];
      questions?: Array<{ prompt: string; options?: string[] }>;
      status: "pending" | "answered";
      answer?: string;
      error?: string;
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

export type PendingEditView = {
  id: string;
  prop: TweakProp;
  from: string;
  to: string;
  label: string;
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
  pendingEdits: PendingEditView[];
  agentTabs: AgentAdapterView[];
  providerGroups: ProviderGroupView[];
  selectedModelKey: string | null;
  reasoningEffort: ReasoningEffortUi;
  showModelReasoning: boolean;
  permissionPolicy: PermissionPolicyUi;
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
  onSetReasoningEffort(effort: ReasoningEffortUi): void;
  onSetPermissionPolicy(policy: PermissionPolicyUi): void;
  onRefreshAgentSessions(): void;
  onOpenAgentSession(id: string, title?: string): void;
  onDeleteLocalSession(id: string): void;
  onDeleteAgentSession(id: string): Promise<void>;
  onAbort(): void;
  onRemoveComment(id: string): void;
  onFocusComment(id: string): void;
  onRemoveEdit(id: string): void;
  onFocusEdit(id: string): void;
  onRemoveAttachment(id: string): void;
  onAnswerQuestion(blockId: string, answers: string[][]): void;
};

export function ChatPanel({
  transcript,
  sessionTitle,
  sessions,
  queueCount,
  attachments,
  draftNote,
  pendingComments,
  pendingEdits,
  agentTabs,
  providerGroups,
  selectedModelKey,
  reasoningEffort,
  showModelReasoning,
  permissionPolicy,
  agentBusy,
  agentOnline,
  agentSessions,
  onDraftNote,
  onApply,
  onClearQueue,
  onNewSession,
  onSelectSession,
  onSelectModel,
  onSetReasoningEffort,
  onSetPermissionPolicy,
  onRefreshAgentSessions,
  onOpenAgentSession,
  onDeleteLocalSession,
  onDeleteAgentSession,
  onAbort,
  onRemoveComment,
  onFocusComment,
  onRemoveEdit,
  onFocusEdit,
  onRemoveAttachment,
  onAnswerQuestion,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll "pegado al fondo": sigue el streaming dentro del mismo
  // bloque, pero se apaga si el usuario sube a leer.
  const stickToBottomRef = useRef(true);
  const [panelView, setPanelView] = useState<"chat" | "sessions">("chat");

  const showThinking = useMemo(() => {
    if (!agentBusy) return false;
    // Mientras el agente trabaja (razonamiento, herramientas o texto) siempre
    // se muestra el loader con su animación.
    const last = transcript[transcript.length - 1];
    return last == null || last.kind !== "agent" || last.status === "streaming";
  }, [agentBusy, transcript]);

  // La pregunta pendiente se muestra arriba del composer (no inline). Al
  // responder, desaparece y queda como bloque en el transcript.
  const pendingQuestion = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i -= 1) {
      const block = transcript[i];
      if (
        block != null &&
        block.kind === "question" &&
        block.status === "pending"
      ) {
        return block;
      }
    }
    return null;
  }, [transcript]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el == null) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript, showThinking, panelView]);

  function openSessionsView() {
    setPanelView("sessions");
    onRefreshAgentSessions();
  }

  if (panelView === "sessions") {
    return (
      <SessionsPanel
        sessions={sessions}
        agentSessions={agentSessions}
        agentOnline={agentOnline}
        onBack={() => setPanelView("chat")}
        onRefresh={onRefreshAgentSessions}
        onNewSession={() => {
          onNewSession();
          setPanelView("chat");
        }}
        onSelectLocal={(id) => {
          onSelectSession(id);
          setPanelView("chat");
        }}
        onDeleteLocal={onDeleteLocalSession}
        onOpenAgent={(id, title) => {
          onOpenAgentSession(id, title);
          setPanelView("chat");
        }}
        onDeleteAgent={onDeleteAgentSession}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-1)]">
      <div className="flex h-8 shrink-0 items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-1)] text-[var(--text-1)]">
          {sessionTitle ?? "Nueva sesión"}
        </span>
        <button
          type="button"
          onClick={openSessionsView}
          title="Sesiones del proyecto"
          className="flex size-5 items-center justify-center rounded-[var(--radius-s)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-3)]"
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

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
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
                    reasoning={block.reasoning ?? ""}
                    tools={block.tools}
                    status={block.status}
                  />
                );
              }
              if (block.kind === "question") {
                // La pendiente vive arriba del composer; acá solo queda la
                // respuesta ya dada, como mensaje del usuario.
                if (block.status === "pending") return null;
                return (
                  <div
                    key={block.id}
                    className="w-fit max-w-full rounded-[var(--radius-m)] bg-[var(--bg-2)] px-3 py-2"
                  >
                    <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
                      {block.prompt}
                    </p>
                    <p className="mt-1 text-[length:var(--fs-2)] text-[var(--text-0)]">
                      {block.answer}
                    </p>
                  </div>
                );
              }
              return <IntentBatchCard key={block.id} payload={block.payload} />;
            })}
            {showThinking ? <AgentThinkingIndicator /> : null}
          </div>
        )}
      </div>

      {/* Sin border-t: la columna chat no lleva línea superior sobre el composer. */}
      <div className="relative shrink-0 px-3 pt-2 pb-3">
        <PendingEdits
          edits={pendingEdits}
          onFocus={onFocusEdit}
          onRemove={onRemoveEdit}
        />
        <PendingComments
          comments={pendingComments}
          onFocus={onFocusComment}
          onRemove={onRemoveComment}
        />

        {pendingQuestion != null ? (
          <div className="mb-2">
            <QuestionCard
              prompt={pendingQuestion.prompt}
              questions={pendingQuestion.questions}
              options={pendingQuestion.options}
              status={pendingQuestion.status}
              answer={pendingQuestion.answer}
              error={pendingQuestion.error}
              onSubmit={(answers) =>
                onAnswerQuestion(pendingQuestion.id, answers)
              }
            />
          </div>
        ) : null}

        <Composer
          value={draftNote}
          onChange={onDraftNote}
          onSubmit={onApply}
          onAbort={onAbort}
          agentBusy={agentBusy}
          canSend={
            (queueCount > 0 || attachments.length > 0 || draftNote.trim() !== "") &&
            agentOnline
          }
          sendHint={
            agentBusy
              ? "Detener respuesta del agente"
              : pendingEdits.length > 0 && pendingComments.length > 0
                ? `Enviar ${pendingEdits.length} edición${pendingEdits.length === 1 ? "" : "es"} y ${pendingComments.length} comentario${pendingComments.length === 1 ? "" : "s"} (⌘Enter)`
                : pendingEdits.length > 0
                  ? `Enviar ${pendingEdits.length} edición${pendingEdits.length === 1 ? "" : "es"} al agente (⌘Enter)`
                  : pendingComments.length > 0
                    ? `Enviar ${pendingComments.length} comentario${pendingComments.length === 1 ? "" : "s"} al agente (⌘Enter)`
                    : attachments.length > 0
                      ? "Enviar captura al agente (⌘Enter)"
                      : "Enviar al agente (⌘Enter)"
          }
          attachments={attachments}
          onRemoveAttachment={onRemoveAttachment}
          agentTabs={agentTabs}
          providerGroups={providerGroups}
          selectedModelKey={selectedModelKey}
          reasoningEffort={reasoningEffort}
          showModelReasoning={showModelReasoning}
          onSelectModel={onSelectModel}
          onSetReasoningEffort={onSetReasoningEffort}
          permissionPolicy={permissionPolicy}
          onSetPermissionPolicy={onSetPermissionPolicy}
          agentOnline={agentOnline}
        />
      </div>
    </div>
  );
}

const TWEAK_PROP_LABELS: Partial<Record<TweakProp, string>> = {
  fontSize: "Tamaño",
  fontWeight: "Peso",
  lineHeight: "Interlineado",
  letterSpacing: "Tracking",
  color: "Color",
  backgroundColor: "Fondo",
  textAlign: "Alineación",
  width: "Ancho",
  height: "Alto",
  padding: "Padding",
  margin: "Margen",
  gap: "Gap",
  flexDirection: "Dirección",
  flexWrap: "Wrap",
  justifyContent: "Justify",
  alignItems: "Align",
  maxWidth: "Max ancho",
  objectFit: "Object fit",
  fontStyle: "Estilo",
  textDecoration: "Decoración",
  borderRadius: "Radio",
  opacity: "Opacidad",
};

export function tweakEditLabel(prop: TweakProp, to: string): string {
  const name = TWEAK_PROP_LABELS[prop] ?? prop;
  return `${name} · ${to}`;
}

/**
 * Ediciones de diseño pendientes (tweaks).
 * Mismo patrón que comentarios pero color accent (azul).
 */
function PendingEdits({
  edits,
  onFocus,
  onRemove,
}: {
  edits: PendingEditView[];
  onFocus(id: string): void;
  onRemove(id: string): void;
}) {
  const [open, setOpen] = useState(false);

  if (edits.length === 0) return null;

  if (edits.length > 2) {
    return (
      <div className="relative mb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent-dim)] px-2.5 py-1 text-[length:var(--fs-0)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--accent)]/20"
        >
          <SlidersHorizontal size={11} strokeWidth={1.75} className="text-[var(--accent)]" />
          {edits.length} ediciones
          <ChevronDown
            size={11}
            strokeWidth={1.75}
            className={`text-[var(--text-2)] transition-transform duration-120 ${open ? "" : "-rotate-90"}`}
          />
        </button>
        {open ? (
          <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-full min-w-[220px] overflow-y-auto rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)] py-1 shadow-lg">
            {edits.map((e) => (
              <div
                key={e.id}
                className="group flex items-start gap-1.5 px-2.5 py-1.5 hover:bg-[var(--bg-2)]"
              >
                <button
                  type="button"
                  onClick={() => onFocus(e.id)}
                  title={`${e.label} (${e.from} → ${e.to})`}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="font-mono text-[var(--accent)]">{e.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(e.id)}
                  title="Eliminar edición"
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
      {edits.map((e) => (
        <span
          key={e.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--accent)]/40 bg-[var(--accent-dim)] py-0.5 pr-1 pl-2 text-[length:var(--fs-0)] text-[var(--text-0)]"
        >
          <button
            type="button"
            onClick={() => onFocus(e.id)}
            title={`${e.label} (${e.from} → ${e.to})`}
            className="min-w-0 max-w-[180px] truncate text-left hover:text-[var(--accent)]"
          >
            <SlidersHorizontal
              size={10}
              strokeWidth={1.75}
              className="mr-0.5 inline text-[var(--accent)]"
            />
            <span className="font-mono text-[var(--accent)]">{e.label}</span>
          </button>
          <button
            type="button"
            onClick={() => onRemove(e.id)}
            title="Quitar edición"
            className="flex size-4 shrink-0 items-center justify-center rounded-full text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--danger)]"
          >
            <X size={10} strokeWidth={2} />
          </button>
        </span>
      ))}
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

function SessionsPanel({
  sessions,
  agentSessions,
  agentOnline,
  onBack,
  onRefresh,
  onNewSession,
  onSelectLocal,
  onDeleteLocal,
  onOpenAgent,
  onDeleteAgent,
}: {
  sessions: SessionView[];
  agentSessions: AgentSessionItemView[];
  agentOnline: boolean;
  onBack(): void;
  onRefresh(): void;
  onNewSession(): void;
  onSelectLocal(id: string): void;
  onDeleteLocal(id: string): void;
  onOpenAgent(id: string, title?: string): void;
  onDeleteAgent(id: string): Promise<void>;
}) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const localSorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt);
  const agentSorted = [...agentSessions].sort((a, b) => b.createdAt - a.createdAt);

  async function handleDeleteAgent(id: string) {
    setDeleteError(null);
    setDeletingId(id);
    try {
      await onDeleteAgent(id);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "No pude eliminar la sesión.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-1)]">
      <header className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--line)] px-2">
        <button
          type="button"
          onClick={onBack}
          title="Volver al chat"
          className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-s)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-3)]"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-[length:var(--fs-1)] font-medium text-[var(--text-0)]">
          Sesiones
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          title="Actualizar sesiones OpenCode"
          className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-s)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-3)]"
        >
          <ChevronUp size={13} strokeWidth={1.75} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {deleteError ? (
          <p
            role="alert"
            className="mb-3 rounded-[var(--radius-s)] bg-[var(--danger)]/10 px-3 py-2 text-[length:var(--fs-1)] text-[var(--danger)]"
          >
            {deleteError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onNewSession}
          className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-m)] border border-dashed border-[var(--line)] bg-[var(--bg-0)] px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-1)] transition-colors duration-120 hover:border-[var(--accent)] hover:text-[var(--text-0)]"
        >
          <Plus size={13} strokeWidth={1.75} />
          Nueva conversación
        </button>

        <SessionSection title="Conversaciones en Steer">
          {localSorted.length === 0 ? (
            <EmptySessionsCopy text="Aún no hay conversaciones." />
          ) : (
            <ul className="flex flex-col gap-1">
              {localSorted.map((s) => (
                <SessionRow
                  key={s.id}
                  title={s.title ?? "Nueva sesión"}
                  meta={`${s.blockCount} mensaje${s.blockCount === 1 ? "" : "s"}`}
                  date={s.createdAt}
                  active={s.active}
                  onOpen={() => onSelectLocal(s.id)}
                  onDelete={() => onDeleteLocal(s.id)}
                  deleteHint="Se pierde el historial."
                  deleting={deletingId === s.id}
                />
              ))}
            </ul>
          )}
        </SessionSection>

        <SessionSection title="OpenCode" className="mt-5">
          {!agentOnline ? (
            <EmptySessionsCopy text="OpenCode no responde. Arranca opencode serve para ver sesiones del proyecto." />
          ) : agentSorted.length === 0 ? (
            <EmptySessionsCopy text="Sin sesiones de OpenCode para este proyecto." />
          ) : (
            <ul className="flex flex-col gap-1">
              {agentSorted.map((s) => (
                <SessionRow
                  key={s.id}
                  title={s.title}
                  meta={s.bound ? "activa" : undefined}
                  date={s.createdAt}
                  active={s.bound}
                  icon={<Bot size={12} strokeWidth={1.75} />}
                  onOpen={() => onOpenAgent(s.id, s.title)}
                  onDelete={() => void handleDeleteAgent(s.id)}
                  deleteHint="Se eliminará la sesión del agente."
                  deleting={deletingId === s.id}
                />
              ))}
            </ul>
          )}
        </SessionSection>
      </div>
    </div>
  );
}

function SessionSection({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <h3 className="mb-2 font-mono text-[length:var(--fs-0)] tracking-wide text-[var(--text-2)] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function EmptySessionsCopy({ text }: { text: string }) {
  return (
    <p className="rounded-[var(--radius-s)] bg-[var(--bg-0)] px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-2)]">
      {text}
    </p>
  );
}

function SessionRow({
  title,
  meta,
  date,
  active,
  icon,
  deleteHint,
  deleting = false,
  onOpen,
  onDelete,
}: {
  title: string;
  meta?: string;
  date: number;
  active: boolean;
  icon?: ReactNode;
  deleteHint: string;
  deleting?: boolean;
  onOpen(): void;
  onDelete(): void;
}) {
  const [confirming, setConfirming] = useState(false);

  const cardClass = confirming
    ? "border-[var(--danger)]/50 bg-[var(--bg-0)]"
    : active
      ? "border-[var(--accent)]/40 bg-[var(--accent-dim)]"
      : "border-[var(--line)] bg-[var(--bg-0)] hover:bg-[var(--bg-2)]";

  return (
    <li
      className={`flex items-center gap-2 rounded-[var(--radius-m)] border px-2.5 py-2 transition-colors duration-120 ${cardClass}`}
    >
      {icon != null && !confirming ? (
        <span className="shrink-0 text-[var(--text-2)]">{icon}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        {confirming ? (
          <p className="text-[length:var(--fs-1)] text-[var(--text-1)]">
            {deleteHint}
          </p>
        ) : (
          <>
            <span className="block truncate text-[length:var(--fs-1)] text-[var(--text-0)]">
              {title}
            </span>
            <span className="mt-0.5 flex items-center gap-2 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
              {meta != null ? <span>{meta}</span> : null}
              {date > 0 ? (
                <span>{new Date(date).toLocaleDateString()}</span>
              ) : null}
            </span>
          </>
        )}
      </div>
      {confirming ? (
        <>
          <button
            type="button"
            disabled={deleting}
            onClick={() => setConfirming(false)}
            className="shrink-0 rounded-[var(--radius-s)] px-2 py-1 text-[length:var(--fs-0)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-3)] disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={deleting}
            title={deleting ? "Eliminando…" : "Eliminar"}
            onClick={() => {
              onDelete();
              setConfirming(false);
            }}
            className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-s)] bg-[var(--danger)] text-white transition-colors duration-120 hover:opacity-90 disabled:opacity-40"
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onOpen}
            className="shrink-0 rounded-[var(--radius-s)] px-2 py-1 text-[length:var(--fs-0)] text-[var(--accent)] transition-colors duration-120 hover:bg-[var(--bg-3)]"
          >
            Abrir
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            title="Eliminar"
            className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-s)] text-[var(--text-2)] transition-colors duration-120 hover:bg-[var(--bg-3)] hover:text-[var(--danger)]"
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        </>
      )}
    </li>
  );
}

// Los bloques ya cerrados conservan identidad en el store; `memo` evita
// re-renderizarlos (y re-parsear markdown) en cada delta del turno activo.
const UserBlock = memo(function UserBlock({ text }: { text: string }) {
  return (
    <div className="w-fit max-w-full rounded-[var(--radius-m)] bg-[var(--bg-2)] px-3 py-2 text-[length:var(--fs-2)] text-[var(--text-0)]">
      {text}
    </div>
  );
});

// UI.md §6.2: card con header "N intents · scope(s)" + lista de intents.
// Colapsado muestra solo el header.
const IntentBatchCard = memo(function IntentBatchCard({
  payload,
}: {
  payload: ApplyPayload;
}) {
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
});

const IntentRow = memo(function IntentRow({ intent }: { intent: Intent }) {
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
});

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

const MarkdownBody = memo(function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="steer-markdown text-[length:var(--fs-2)] text-[var(--text-1)] [&_a]:text-[var(--accent)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--line)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--text-2)] [&_code]:rounded-[var(--radius-s)] [&_code]:bg-[var(--bg-2)] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[length:var(--fs-1)] [&_h1]:mb-2 [&_h1]:text-[length:var(--fs-4)] [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:text-[length:var(--fs-3)] [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[var(--radius-s)] [&_pre]:bg-[var(--bg-2)] [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:my-1.5 [&_ul]:list-disc">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
});

const THINKING_PHRASES = [
  "Pensando…",
  "Analizando el proyecto…",
  "Revisando archivos…",
  "Buscando la mejor solución…",
  "Preparando respuesta…",
];

function AgentThinkingIndicator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % THINKING_PHRASES.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <LoadingState label={THINKING_PHRASES[index] ?? THINKING_PHRASES[0]} />
  );
}

const ReasoningPanel = memo(function ReasoningPanel({
  text,
  active,
  streaming,
}: {
  text: string;
  active?: boolean;
  streaming?: boolean;
}) {
  return (
    <details
      className="group rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--bg-1)]"
    >
      <summary className="cursor-pointer list-none px-2 py-1 font-mono text-[length:var(--fs-0)] text-[var(--text-2)] marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1">
          <ChevronDown
            size={12}
            className="transition group-open:rotate-180"
            aria-hidden
          />
          <span className={active ? "steer-shimmer" : undefined}>
            Razonamiento
          </span>
        </span>
      </summary>
      <div className="border-t border-[var(--line)] px-2 py-1.5">
        {/* Mientras llega el stream mostramos texto plano; el markdown
            (costoso) se parsea una sola vez al cerrar el turno. */}
        {streaming ? (
          <p className="whitespace-pre-wrap font-mono text-[length:var(--fs-1)] text-[var(--text-2)]">
            {text}
          </p>
        ) : (
          <MarkdownBody text={text} />
        )}
      </div>
    </details>
  );
});

const ToolsSummaryPanel = memo(function ToolsSummaryPanel({
  tools,
  runningCount,
  active,
}: {
  tools: TranscriptToolView[];
  runningCount: number;
  active?: boolean;
}) {
  return (
    <details
      className="group rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--bg-1)]"
    >
      <summary className="cursor-pointer list-none px-2 py-1 font-mono text-[length:var(--fs-0)] text-[var(--text-2)] marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1">
          <ChevronDown
            size={12}
            className="transition group-open:rotate-180"
            aria-hidden
          />
          <span className={active ? "steer-shimmer" : undefined}>
            Herramientas ({tools.length})
          </span>
          {runningCount > 0 ? (
            <span className="text-[var(--warn)]">· {runningCount} en curso</span>
          ) : null}
        </span>
      </summary>
      <ul className="space-y-0.5 border-t border-[var(--line)] px-2 py-1.5">
        {tools.map((t, i) => (
          <li
            key={t.id ?? `${t.name}-${i}`}
            className="font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
          >
            <span
              className={
                t.status === "start" ? "text-[var(--warn)]" : "text-[var(--ok)]"
              }
            >
              {t.status === "start" ? "·" : "✓"}
            </span>{" "}
            <span className="text-[var(--text-1)]">{t.name}</span>
            {t.detail ? (
              <span className="block truncate pl-3 text-[var(--text-2)]">
                {t.detail}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
});

/** Solo la respuesta final del agente va en globo (markdown). */
const AgentTextBubble = memo(function AgentTextBubble({
  text,
  status,
}: {
  text: string;
  status: "streaming" | "done" | "error";
}) {
  const border =
    status === "error"
      ? "border-[var(--danger)]"
      : status === "done"
        ? "border-[var(--ok)]/35"
        : "border-[var(--accent)]/45";
  return (
    <div
      className={`w-fit max-w-full rounded-[var(--radius-m)] border ${border} bg-[var(--bg-0)] px-3 py-2`}
    >
      <MarkdownBody text={text} />
    </div>
  );
});

// Turno del agente: reasoning/tools sueltos; respuesta en globo aparte.
const AgentBlock = memo(function AgentBlock({
  text,
  reasoning,
  tools,
  status,
}: {
  text: string;
  reasoning: string;
  tools: TranscriptToolView[];
  status: "streaming" | "done" | "error";
}) {
  const streaming = status === "streaming";
  const runningTools = tools.filter((t) => t.status === "start").length;
  const reasoningActive =
    streaming && reasoning !== "" && runningTools === 0 && text === "";
  const toolsActive = streaming && runningTools > 0;
  return (
    <div className="flex flex-col gap-1.5">
      {reasoning !== "" ? (
        <ReasoningPanel
          text={reasoning}
          active={reasoningActive}
          streaming={streaming}
        />
      ) : null}

      {tools.length > 0 ? (
        <ToolsSummaryPanel
          tools={tools}
          runningCount={runningTools}
          active={toolsActive}
        />
      ) : null}

      {text !== "" ? (
        <AgentTextBubble text={text} status={status} />
      ) : status === "error" ? (
        <AgentTextBubble text="Error en el turno del agente." status={status} />
      ) : null}
    </div>
  );
});

// Composer: textarea alto con fila inferior DENTRO del campo:
// [modo agent] [select modelo] [enviar]
function Composer({
  value,
  onChange,
  onSubmit,
  onAbort,
  agentBusy,
  canSend,
  sendHint,
  attachments,
  onRemoveAttachment,
  agentTabs,
  providerGroups,
  selectedModelKey,
  reasoningEffort,
  showModelReasoning,
  onSelectModel,
  onSetReasoningEffort,
  permissionPolicy,
  onSetPermissionPolicy,
  agentOnline,
}: {
  value: string;
  onChange(text: string): void;
  onSubmit(): void;
  onAbort(): void;
  agentBusy: boolean;
  canSend: boolean;
  sendHint?: string;
  attachments: ChatAttachmentView[];
  onRemoveAttachment(id: string): void;
  agentTabs: AgentAdapterView[];
  providerGroups: ProviderGroupView[];
  selectedModelKey: string | null;
  reasoningEffort: ReasoningEffortUi;
  showModelReasoning: boolean;
  onSelectModel(key: string): void;
  onSetReasoningEffort(effort: ReasoningEffortUi): void;
  permissionPolicy: PermissionPolicyUi;
  onSetPermissionPolicy(policy: PermissionPolicyUi): void;
  agentOnline: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [modeOpen, setModeOpen] = useState(false);

  useEffect(() => {
    if (value === "") {
      const el = ref.current;
      if (el) el.style.height = "auto";
    }
  }, [value]);

  function autoGrow() {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
  }

  return (
    <div className="relative rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)] focus-within:border-[var(--accent)]">
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
        data-steer-composer=""
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
            if (agentBusy) onAbort();
            else if (canSend) onSubmit();
          }
        }}
        className="max-h-[140px] min-h-[96px] w-full resize-none rounded-t-[var(--radius-m)] bg-transparent px-3 pt-2.5 pb-10 text-[length:var(--fs-2)] text-[var(--text-0)] outline-none placeholder:text-[var(--text-2)]"
      />

      {/* Controles: modelo, luego candado de permisos, enviar. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 px-2 pb-2">
        <ModelSelector
          agents={agentTabs}
          providerGroups={providerGroups}
          selectedModelKey={selectedModelKey}
          reasoningEffort={reasoningEffort}
          showReasoning={showModelReasoning}
          agentOnline={agentOnline}
          onSelectModel={onSelectModel}
          onSetReasoningEffort={onSetReasoningEffort}
        />

        <div className="relative pointer-events-auto">
          <button
            type="button"
            onClick={() => setModeOpen((v) => !v)}
            title={
              permissionPolicy === "always"
                ? "Permisos: always approved"
                : "Permisos: default"
            }
            className={`flex size-6 items-center justify-center rounded-[var(--radius-s)] bg-[var(--bg-3)] transition-colors duration-120 hover:text-[var(--text-0)] ${
              permissionPolicy === "always"
                ? "text-[var(--accent)]"
                : "text-[var(--text-1)]"
            }`}
          >
            <Lock size={12} strokeWidth={1.75} />
          </button>
          {modeOpen ? (
            <>
              <button
                type="button"
                aria-label="Cerrar"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setModeOpen(false)}
              />
              <div className="absolute right-0 bottom-full z-20 mb-1 w-48 rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)] py-1 shadow-lg">
                {PERMISSION_POLICIES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSetPermissionPolicy(m.id);
                      setModeOpen(false);
                    }}
                    className={`flex w-full flex-col items-start px-2.5 py-1.5 text-left transition-colors duration-120 ${
                      permissionPolicy === m.id
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

        <button
          type="button"
          onClick={() => {
            if (agentBusy) onAbort();
            else if (canSend) onSubmit();
          }}
          disabled={!agentBusy && !canSend}
          title={sendHint ?? "Enviar al agente (⌘Enter)"}
          className={`pointer-events-auto ml-auto flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-120 disabled:opacity-40 ${
            agentBusy
              ? "bg-[var(--danger)] text-white hover:bg-[#e85d5d]"
              : "bg-white text-[var(--bg-0)] hover:bg-[#e6e6e6]"
          }`}
        >
          {agentBusy ? (
            <Square size={11} strokeWidth={2} className="fill-current" />
          ) : (
            <SendHorizontal size={13} fill="currentColor" strokeWidth={0} />
          )}
        </button>
      </div>
    </div>
  );
}
