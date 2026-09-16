// HomeComposer — input central del home: prompt + nombre/carpeta del proyecto.
// Al enviar crea el proyecto (scaffold TanStack Start) y el prompt queda como
// primer mensaje del chat del nuevo proyecto.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BorderBeam } from "border-beam";
import { Folder, FolderOpen, Loader2, Lock, SendHorizontal } from "lucide-react";
import {
  ModelSelector,
  type AgentAdapterView,
  type ProviderGroupView,
  type ReasoningEffortUi,
} from "./ModelSelector";

export type HomePermissionPolicy = "default" | "always";

const PERMISSION_POLICIES: Array<{
  id: HomePermissionPolicy;
  label: string;
  hint: string;
}> = [
  { id: "default", label: "Default", hint: "Pide permiso en cada tool" },
  { id: "always", label: "Always approved", hint: "Auto-aprueba las tools" },
];

export type HomeComposerProps = {
  creating?: boolean;
  progress?: { percent: number; message: string } | null;
  error?: string | null;
  parentDir: string | null;
  onPickParentDir(): void;
  onSubmit(name: string, prompt: string): void;
  agentTabs: AgentAdapterView[];
  providerGroups: ProviderGroupView[];
  selectedModelKey: string | null;
  reasoningEffort: ReasoningEffortUi;
  showModelReasoning: boolean;
  agentOnline: boolean;
  onSelectModel(key: string): void;
  onSetReasoningEffort(effort: ReasoningEffortUi): void;
  permissionPolicy: HomePermissionPolicy;
  onSetPermissionPolicy(policy: HomePermissionPolicy): void;
};

/** Popover anclado arriba de un botón, en portal (escapa el overflow del
 *  wrapper del BorderBeam que recortaba el popover). */
function useAnchoredPopover(open: boolean, width: number) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useState<{ left: number; bottom: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) {
      setLayout(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (el == null) return;
      const r = el.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, r.left),
        Math.max(8, window.innerWidth - width - 8),
      );
      setLayout({ left, bottom: window.innerHeight - r.top + 6 });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, width]);

  return { anchorRef, layout };
}

export function HomeComposer({
  creating = false,
  progress = null,
  error = null,
  parentDir,
  onPickParentDir,
  onSubmit,
  agentTabs,
  providerGroups,
  selectedModelKey,
  reasoningEffort,
  showModelReasoning,
  agentOnline,
  onSelectModel,
  onSetReasoningEffort,
  permissionPolicy,
  onSetPermissionPolicy,
}: HomeComposerProps) {
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const wasCreating = useRef(false);
  const folderMenu = useAnchoredPopover(folderOpen, 288);
  const lockMenu = useAnchoredPopover(lockOpen, 192);

  // Al crear con éxito, limpiamos prompt/nombre; si falla, se conserva.
  useEffect(() => {
    if (wasCreating.current && !creating && error == null) {
      setPrompt("");
      setName("");
    }
    wasCreating.current = creating;
  }, [creating, error]);

  function autoGrow() {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }

  const derivedName = slugify(prompt);
  const normalized = normalizeProjectName(name.trim() !== "" ? name : derivedName);
  const nameError =
    name.trim() !== "" && normalizeProjectName(name).length === 0
      ? "Usa letras, números o guiones."
      : normalized.length > 0 && !/^[a-z]/.test(normalized)
        ? "Debe empezar con una letra minúscula."
        : null;
  const locationOk = parentDir != null && parentDir !== "";
  const canSubmit =
    !creating &&
    locationOk &&
    normalized.length > 0 &&
    nameError == null &&
    prompt.trim() !== "";

  function submit() {
    if (!canSubmit) return;
    onSubmit(normalized, prompt.trim());
  }

  return (
    <BorderBeam
      size="md"
      colorVariant="colorful"
      strength={0.7}
      duration={4}
      theme="dark"
      borderRadius={16}
      style={{ boxShadow: "var(--shadow-input)" }}
    >
    <div className="relative rounded-[var(--radius-input)] border-[length:var(--beam-width)] border-[var(--border-input)] bg-[var(--bg-0)] focus-within:border-[var(--accent)]">
      {progress != null ? (
        <div className="flex flex-col gap-1.5 border-b border-[var(--line)] px-3 pt-2.5 pb-2">
          <div className="flex items-center justify-between gap-2 text-[length:var(--fs-0)] text-[var(--text-2)]">
            <span className="min-w-0 truncate">
              {progress.message || "Creando proyecto…"}
            </span>
            <span className="shrink-0 tabular-nums">{progress.percent}%</span>
          </div>
          <div
            className="h-1 overflow-hidden rounded-full bg-[var(--bg-2)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#5b8cff,#b06bff,#ff6bd6)] transition-[width] duration-200 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      ) : null}

      <textarea
        ref={ref}
        data-steer-composer=""
        rows={3}
        value={prompt}
        disabled={creating}
        placeholder="Describe lo que quieres construir…"
        onChange={(e) => {
          setPrompt(e.target.value);
          autoGrow();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        className="max-h-[160px] min-h-[96px] w-full resize-none rounded-t-[var(--radius-m)] bg-transparent px-3 pt-2.5 pb-10 text-[length:var(--fs-2)] text-[var(--text-0)] outline-none placeholder:text-[var(--text-2)] disabled:opacity-50"
      />

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

        {/* Carpeta + nombre del proyecto */}
        <div className="relative pointer-events-auto">
          <button
            ref={folderMenu.anchorRef}
            type="button"
            disabled={creating}
            onClick={() => setFolderOpen((v) => !v)}
            title="Proyecto y ubicación"
            className={`flex size-6 items-center justify-center rounded-[var(--radius-s)] bg-[var(--bg-3)] transition-colors duration-120 hover:text-[var(--text-0)] disabled:opacity-40 ${
              locationOk && normalized.length > 0
                ? "text-[var(--accent)]"
                : "text-[var(--text-1)]"
            }`}
          >
            <Folder size={12} strokeWidth={1.75} />
          </button>
          {folderOpen && folderMenu.layout != null
            ? createPortal(
                <div
                  className="fixed inset-0 z-[200]"
                  onMouseDown={() => setFolderOpen(false)}
                >
                  <div
                    role="dialog"
                    aria-label="Proyecto y ubicación"
                    onMouseDown={(e) => e.stopPropagation()}
                    className="fixed z-[201] w-72 rounded-[var(--radius-m)] border border-[var(--border-input)] bg-[var(--bg-0)] p-3 shadow-xl"
                    style={{
                      left: folderMenu.layout.left,
                      bottom: folderMenu.layout.bottom,
                    }}
                  >
                <label className="flex flex-col gap-1.5">
                  <span className="text-[length:var(--fs-1)] text-[var(--text-1)]">
                    Nombre del proyecto
                  </span>
                  <input
                    type="text"
                    value={name}
                    disabled={creating}
                    placeholder={derivedName !== "" ? derivedName : "mi-app"}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-[var(--radius-s)] bg-[var(--bg-3)] px-2 py-1 font-mono text-[length:var(--fs-1)] text-[var(--text-0)] outline-none placeholder:text-[var(--text-2)]"
                  />
                  {normalized !== "" && name.trim() !== normalized ? (
                    <span className="font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
                      Carpeta: {normalized}
                    </span>
                  ) : null}
                  {nameError ? (
                    <span className="text-[length:var(--fs-0)] text-[var(--danger)]">
                      {nameError}
                    </span>
                  ) : null}
                </label>

                <div className="mt-3 flex flex-col gap-1.5">
                  <span className="text-[length:var(--fs-1)] text-[var(--text-1)]">
                    Ubicación
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="min-w-0 flex-1 truncate rounded-[var(--radius-s)] bg-[var(--bg-3)] px-2 py-1 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
                      title={parentDir ?? undefined}
                    >
                      {parentDir ?? "Elige una carpeta"}
                    </span>
                    <button
                      type="button"
                      disabled={creating}
                      onClick={onPickParentDir}
                      title="Elegir carpeta"
                      className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-s)] bg-[var(--bg-3)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-2)] hover:text-[var(--text-0)] disabled:opacity-40"
                    >
                      <FolderOpen size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>

                {error ? (
                  <p className="mt-2 whitespace-pre-wrap text-[length:var(--fs-0)] text-[var(--danger)]">
                    {error}
                  </p>
                ) : null}
                  </div>
                </div>,
                document.body,
              )
            : null}
        </div>

        {/* Permisos */}
        <div className="relative pointer-events-auto">
          <button
            ref={lockMenu.anchorRef}
            type="button"
            onClick={() => setLockOpen((v) => !v)}
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
          {lockOpen && lockMenu.layout != null
            ? createPortal(
                <div
                  className="fixed inset-0 z-[200]"
                  onMouseDown={() => setLockOpen(false)}
                >
                  <div
                    role="dialog"
                    aria-label="Permisos"
                    onMouseDown={(e) => e.stopPropagation()}
                    className="fixed z-[201] w-48 rounded-[var(--radius-m)] border border-[var(--border-input)] bg-[var(--bg-0)] py-1 shadow-xl"
                    style={{
                      left: lockMenu.layout.left,
                      bottom: lockMenu.layout.bottom,
                    }}
                  >
                {PERMISSION_POLICIES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSetPermissionPolicy(m.id);
                      setLockOpen(false);
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
                </div>,
                document.body,
              )
            : null}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          title="Crear proyecto"
          className="pointer-events-auto ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-[var(--bg-0)] transition-colors duration-120 hover:bg-[#e6e6e6] disabled:opacity-40"
        >
          {creating ? (
            <Loader2 size={12} strokeWidth={2} className="animate-spin" />
          ) : (
            <SendHorizontal size={13} fill="currentColor" strokeWidth={0} />
          )}
        </button>
      </div>
    </div>
    </BorderBeam>
  );
}

export function normalizeProjectName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugify(text: string): string {
  const words = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  return normalizeProjectName(words.join("-"));
}
