// ChatPanel — UI.md §6. Transcript (abajo = último), IntentBatchCard y
// composer. Sin provider: el chat no habla con agentes (Fase F conecta
// el stream); ⌘Enter aplica la cola.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Pin, SendHorizontal } from "lucide-react";
import type { ApplyPayload, Intent } from "@steer/domain";

export type TranscriptBlockView =
  | { kind: "user"; id: string; text: string }
  | { kind: "batch"; id: string; payload: ApplyPayload };

export type ChatPanelProps = {
  transcript: TranscriptBlockView[];
  queueCount: number;
  draftNote: string;
  onDraftNote(text: string): void;
  onApply(): void;
  onClearQueue(): void;
};

export function ChatPanel({
  transcript,
  queueCount,
  draftNote,
  onDraftNote,
  onApply,
  onClearQueue,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Transcript: scroll inverso — abajo = último (UI.md §6).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-1)]">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {transcript.length === 0 ? (
          <p className="mt-6 text-center text-[length:var(--fs-1)] text-[var(--text-2)]">
            Los tweaks y pins que encoles aparecen acá como un lote.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {transcript.map((block) =>
              block.kind === "user" ? (
                <UserBlock key={block.id} text={block.text} />
              ) : (
                <IntentBatchCard key={block.id} payload={block.payload} />
              ),
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] px-3 py-2">
        <ApplyBar
          queueCount={queueCount}
          onApply={onApply}
          onClearQueue={onClearQueue}
        />
        <Composer
          value={draftNote}
          onChange={onDraftNote}
          onSubmit={onApply}
          canSend={queueCount > 0}
        />
      </div>
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

// UI.md §5.4: primary "Aplicar n intents" + ghost "Vaciar cola".
function ApplyBar({
  queueCount,
  onApply,
  onClearQueue,
}: {
  queueCount: number;
  onApply(): void;
  onClearQueue(): void;
}) {
  const disabled = queueCount === 0;
  return (
    <div className="mb-2 flex items-center gap-2">
      <button
        type="button"
        onClick={onApply}
        disabled={disabled}
        className="flex-1 rounded-[var(--radius-m)] bg-[var(--accent)] px-3 py-1.5 text-[length:var(--fs-1)] font-medium text-white transition-colors duration-120 hover:bg-[#6c99ff] disabled:opacity-40"
      >
        Aplicar {queueCount} intent{queueCount === 1 ? "" : "s"}
      </button>
      <button
        type="button"
        onClick={onClearQueue}
        disabled={disabled}
        className="rounded-[var(--radius-m)] bg-[var(--bg-2)] px-3 py-1.5 text-[length:var(--fs-1)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-3)] disabled:opacity-40"
      >
        Vaciar cola
      </button>
    </div>
  );
}

// UI.md §6: composer auto-grow 1–6 filas, botón modelo a la izquierda.
// El popover de modelo llega en Fase F.
function Composer({
  value,
  onChange,
  onSubmit,
  canSend,
}: {
  value: string;
  onChange(text: string): void;
  onSubmit(): void;
  canSend: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function autoGrow() {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 6 * 20)}px`;
    }
  }

  return (
    <div className="flex items-end gap-2">
      <button
        type="button"
        disabled
        title="Modelo — llega en la Fase F"
        className="h-7 shrink-0 rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 font-mono text-[length:var(--fs-0)] text-[var(--text-2)] opacity-40"
      >
        modelo —
      </button>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder="Añade una nota o deja que hablen los intents"
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
        className="max-h-[120px] min-h-[28px] flex-1 resize-none rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 py-1.5 text-[length:var(--fs-2)] text-[var(--text-0)] outline-none placeholder:text-[var(--text-2)] focus:ring-1 focus:ring-[var(--accent)]"
      />
      <button
        type="button"
        onClick={() => canSend && onSubmit()}
        disabled={!canSend}
        title="Aplicar (⌘Enter)"
        className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-s)] bg-[var(--accent)] text-white transition-colors duration-120 hover:bg-[#6c99ff] disabled:opacity-40"
      >
        <SendHorizontal size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
