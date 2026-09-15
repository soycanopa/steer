// CreateProjectDialog — UX §5.1: carpeta padre + nombre del proyecto.

import { useEffect, useRef, useState } from "react";

export type CreateProjectProgress = {
  percent: number;
  message: string;
};

export type CreateProjectDialogProps = {
  open: boolean;
  parentDir: string | null;
  creating?: boolean;
  progress?: CreateProjectProgress | null;
  error?: string | null;
  onClose(): void;
  onPickParentDir(): void;
  onSubmit(name: string): void;
};

export function CreateProjectDialog({
  open,
  parentDir,
  creating = false,
  progress = null,
  error = null,
  onClose,
  onPickParentDir,
  onSubmit,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const trimmed = name.trim();
  const normalized = normalizeProjectName(trimmed);
  const nameError =
    trimmed.length > 0 && normalized.length === 0
      ? "Usa letras, números o guiones."
      : trimmed.length > 0 && !/^[a-z]/.test(normalized)
        ? "Debe empezar con una letra minúscula."
        : null;
  const canSubmit =
    !creating &&
    parentDir != null &&
    parentDir !== "" &&
    normalized.length > 0 &&
    nameError == null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !creating) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        className="flex w-full max-w-[420px] flex-col gap-4 rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-1)] p-4 shadow-2xl"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="create-project-title"
            className="text-[length:var(--fs-2)] font-semibold text-[var(--text-0)]"
          >
            Crear proyecto TanStack Start
          </h2>
          <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
            Steer ejecutará el CLI de TanStack con pnpm. Puede tardar unos
            minutos.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--fs-1)] text-[var(--text-1)]">
            Nombre
          </span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            disabled={creating}
            placeholder="mi-app"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) onSubmit(normalized);
              if (e.key === "Escape" && !creating) onClose();
            }}
            className="rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--bg-0)] px-2.5 py-1.5 font-mono text-[length:var(--fs-1)] text-[var(--text-0)] outline-none focus:border-[var(--accent)]"
          />
          <span className="text-[length:var(--fs-0)] text-[var(--text-2)]">
            Minúsculas, números y guiones. Ej: mi-app
          </span>
          {normalized !== "" && trimmed !== normalized ? (
            <span className="font-mono text-[length:var(--fs-0)] text-[var(--text-1)]">
              Se creará como: {normalized}
            </span>
          ) : null}
          {nameError ? (
            <span className="text-[length:var(--fs-0)] text-[var(--danger)]">
              {nameError}
            </span>
          ) : null}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[length:var(--fs-1)] text-[var(--text-1)]">
            Ubicación
          </span>
          <div className="flex items-center gap-2">
            <span
              className="min-w-0 flex-1 truncate rounded-[var(--radius-s)] bg-[var(--bg-0)] px-2.5 py-1.5 font-mono text-[length:var(--fs-0)] text-[var(--text-2)]"
              title={parentDir ?? undefined}
            >
              {parentDir ?? "Elige una carpeta padre"}
            </span>
            <button
              type="button"
              disabled={creating}
              onClick={onPickParentDir}
              className="shrink-0 rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2.5 py-1.5 text-[length:var(--fs-1)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-3)] disabled:opacity-40"
            >
              Elegir…
            </button>
          </div>
        </div>

        {creating ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 text-[length:var(--fs-0)] text-[var(--text-2)]">
              <span className="min-w-0 truncate">
                {progress?.message ?? "Creando proyecto…"}
              </span>
              <span className="shrink-0 tabular-nums">
                {progress?.percent ?? 0}%
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-0)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress?.percent ?? 0}
            >
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200 ease-out"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="whitespace-pre-wrap text-[length:var(--fs-1)] text-[var(--danger)]"
          >
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={creating}
            onClick={onClose}
            className="rounded-[var(--radius-s)] px-3 py-1.5 text-[length:var(--fs-1)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-2)] disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit(normalized)}
            className="rounded-[var(--radius-s)] bg-[var(--accent)] px-3 py-1.5 text-[length:var(--fs-1)] font-medium text-white transition-colors duration-120 hover:bg-[#6c99ff] disabled:opacity-40"
          >
            {creating ? "Creando…" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeProjectName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
