// CodeBlock — bloque de código y diff unificado para el chat (patrón demo
// portado a los tokens de Steer). Dos vistas:
//   · Code — listing con números de línea y syntax coloring ligero.
//   · Diff — gutters old/new, barra + tinte por fila y highlights a nivel
//     de palabra (LCS sobre el par -/+).
// El contenido viene del propio markdown del agente: fences ```diff los
// parsea parseDiffRows; cualquier otro fence entra como vista Code.

import { useCallback, useState, type ReactNode } from "react";
import { t } from "./i18n";

/* Pieza de código dentro de una fila de diff; `change` la tiñe add/del. */
export type CodePiece = { text: string; change?: "add" | "del" };
/* Fila de diff unificado: números old/new, tipo y piezas. */
export type DiffRow = {
  old: number | null;
  cur: number | null;
  type: "ctx" | "add" | "del";
  pieces: CodePiece[];
};

const MAX_LINES = 400;

/**
 * Parsea un diff unificado (el ```diff que escriben los agentes) a filas.
 * Devuelve null si no huele a diff: el caller cae a un bloque de código.
 * Cuando un `-` va seguido de un `+`, separa los cambios a nivel palabra.
 */
export function parseDiffRows(raw: string): {
  filename: string | null;
  rows: DiffRow[];
} | null {
  const lines = raw.replace(/\n$/, "").split("\n");
  if (lines.length === 0 || lines.length > MAX_LINES) return null;
  const rows: DiffRow[] = [];
  let filename: string | null = null;
  let old = 1;
  let cur = 1;
  let sawDiffLine = false;

  for (const line of lines) {
    if (line.startsWith("+++ ")) {
      filename = line.slice(4).trim().replace(/^b\//, "") || filename || null;
      continue;
    }
    if (line.startsWith("--- ")) {
      filename = (filename ?? line.slice(4).trim().replace(/^a\//, "")) || null;
      continue;
    }
    if (line.startsWith("@@")) {
      const oldMatch = /-(\d+)/.exec(line);
      const curMatch = /\+(\d+)/.exec(line);
      old = oldMatch != null ? Number.parseInt(oldMatch[1] ?? "1", 10) : old;
      cur = curMatch != null ? Number.parseInt(curMatch[1] ?? "1", 10) : cur;
      sawDiffLine = true;
      continue;
    }
    if (line.startsWith("\\")) continue; // "\ No newline at end of file"
    if (line.startsWith("+")) {
      rows.push({ old: null, cur, type: "add", pieces: [{ text: line.slice(1), change: "add" }] });
      cur += 1;
      sawDiffLine = true;
      continue;
    }
    if (line.startsWith("-")) {
      rows.push({ old, cur: null, type: "del", pieces: [{ text: line.slice(1), change: "del" }] });
      old += 1;
      sawDiffLine = true;
      continue;
    }
    if (line.startsWith(" ") || line === "") {
      rows.push({ old, cur, type: "ctx", pieces: [{ text: line.slice(1) }] });
      old += 1;
      cur += 1;
      continue;
    }
    return null; // línea que no es diff: el fence no era un diff
  }

  if (!sawDiffLine || rows.length === 0) return null;

  // Word-level: del inmediatamente seguido de add => partir por palabras.
  for (let i = 0; i < rows.length - 1; i += 1) {
    const a = rows[i];
    const b = rows[i + 1];
    if (a == null || b == null || a.type !== "del" || b.type !== "add") continue;
    const aText = a.pieces[0]?.text ?? "";
    const bText = b.pieces[0]?.text ?? "";
    const { oldPieces, newPieces } = wordDiff(aText, bText);
    rows[i] = { ...a, pieces: oldPieces };
    rows[i + 1] = { ...b, pieces: newPieces };
    i += 1;
  }

  return { filename, rows };
}

/** LCS de tokens (palabras + espacios) para marcar solo lo que cambió. */
function wordDiff(
  oldText: string,
  newText: string,
): { oldPieces: CodePiece[]; newPieces: CodePiece[] } {
  const a = oldText.split(/(\s+)/).filter((s) => s !== "");
  const b = newText.split(/(\s+)/).filter((s) => s !== "");
  const n = a.length;
  const m = b.length;
  if (n * m > 40_000) {
    return {
      oldPieces: [{ text: oldText, change: "del" }],
      newPieces: [{ text: newText, change: "add" }],
    };
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const ai = a[i];
      const bj = b[j];
      const row = dp[i];
      if (row == null) continue;
        ai === bj
          ? (dp[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(dp[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const oldPieces: CodePiece[] = [];
  const newPieces: CodePiece[] = [];
  let i = 0;
  let j = 0;
  const push = (list: CodePiece[], text: string, change: "add" | "del") => {
    const last = list[list.length - 1];
    if (last != null && last.change === change) last.text += text;
    else list.push({ text, change });
  };
  while (i < n && j < m) {
    const ai = a[i];
    const bj = b[j];
    if (ai === bj) {
      oldPieces.push({ text: ai ?? "" });
      newPieces.push({ text: bj ?? "" });
      i += 1;
      j += 1;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      push(oldPieces, ai ?? "", "del");
      i += 1;
    } else {
      push(newPieces, bj ?? "", "add");
      j += 1;
    }
  }
  while (i < n) {
    push(oldPieces, a[i] ?? "", "del");
    i += 1;
  }
  while (j < m) {
    push(newPieces, b[j] ?? "", "add");
    j += 1;
  }
  return { oldPieces, newPieces };
}

/* syntax coloring ligero: keywords, strings/números y calls */
const KEYWORDS = new Set([
  "import", "from", "export", "default", "async", "function", "const", "let",
  "var", "await", "return", "if", "else", "for", "while", "new", "throw",
  "try", "catch", "null", "true", "false", "undefined",
]);
const TOKEN =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\b\d+(?:\.\d+)?\b|\b(?:import|from|export|default|async|function|const|let|var|await|return|if|else|for|while|new|throw|try|catch|null|true|false|undefined)\b|[A-Za-z_$][\w$]*(?=\s*\())/g;

function highlight(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const match of text.matchAll(TOKEN)) {
    const idx = match.index ?? 0;
    const token = match[0];
    if (idx > last) nodes.push(<span key={k++}>{text.slice(last, idx)}</span>);
    let color: string;
    let weight: number | undefined;
    if (/^["'`]/.test(token) || /^\d/.test(token)) color = "var(--pin)";
    else if (KEYWORDS.has(token)) color = "var(--accent)";
    else {
      color = "var(--text-0)";
      weight = 500;
    }
    nodes.push(
      <span key={k++} style={{ color, fontWeight: weight }}>
        {token}
      </span>,
    );
    last = idx + token.length;
  }
  if (last < text.length) nodes.push(<span key={k++}>{text.slice(last)}</span>);
  return nodes;
}

function Pieces({ pieces }: { pieces: CodePiece[] }) {
  return (
    <>
      {pieces.map((piece, i) => {
        if (piece.change != null) {
          const add = piece.change === "add";
          return (
            <span
              key={i}
              className="rounded-[3px]"
              style={{
                background: `color-mix(in srgb, var(--${add ? "ok" : "danger"}) 16%, transparent)`,
                padding: "0 2px",
                margin: "0 -1px",
                boxDecorationBreak: "clone",
                WebkitBoxDecorationBreak: "clone",
              }}
            >
              {highlight(piece.text)}
            </span>
          );
        }
        return <span key={i}>{highlight(piece.text)}</span>;
      })}
    </>
  );
}

export function CodeBlock({
  lines,
  code,
  diff,
  filename,
}: {
  /** Líneas de la vista Code. Requeridas solo si no hay diff. */
  lines?: string[];
  /** Texto que copia el botón (default: lines unidas). */
  code?: string;
  /** Filas de diff (vista Diff si viene). */
  diff?: DiffRow[];
  /** Nombre de archivo en el header. */
  filename?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const isDiff = diff != null;
  const raw = code ?? (lines ?? []).join("\n");

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [raw]);

  const added = (diff ?? []).filter((r) => r.type === "add").length;
  const removed = (diff ?? []).filter((r) => r.type === "del").length;

  return (
    <div className="w-full overflow-hidden rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-1)]">
      <div className="flex h-9 items-center gap-2 border-b border-[var(--line)] px-3 text-[length:var(--fs-1)]">
        <span className="inline-flex min-w-0 items-center gap-[6px]">
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--text-2)]">
            <path d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
          </svg>
          <span className="truncate font-mono leading-none text-[var(--text-0)]">
            {filename ?? "code"}
          </span>
        </span>
        {isDiff ? (
          <span className="ml-auto inline-flex items-center gap-2 font-mono text-[length:var(--fs-1)] leading-none tabular-nums">
            <span className="text-[var(--ok)]">+{added}</span>
            <span className="text-[var(--danger)]">-{removed}</span>
          </span>
        ) : null}
        <button
          type="button"
          aria-label={copied ? t.chat.copied : t.chat.copy}
          title={copied ? t.chat.copied : t.chat.copy}
          onClick={copy}
          className={`ml-auto flex h-6 shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[length:var(--fs-0)] font-medium transition-colors duration-100 hover:bg-[var(--bg-3)] ${
            isDiff ? "ml-2" : ""
          } ${copied ? "text-[var(--ok)]" : "text-[var(--text-2)] hover:text-[var(--text-0)]"}`}
        >
          {copied ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
          {copied ? t.chat.copied : t.chat.copy}
        </button>
      </div>

      <div className="py-3 font-mono text-[12.5px] leading-[1.65] text-[var(--text-1)]">
        {isDiff ? (
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-5 w-px bg-[var(--line)]" />
            {(diff ?? []).map((row, i) => {
              const add = row.type === "add";
              const del = row.type === "del";
              const num = del ? row.old : row.cur;
              return (
                <div
                  key={i}
                  className={`relative grid grid-cols-[20px_minmax(0,1fr)] items-start ${
                    add
                      ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]"
                      : del
                        ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                        : ""
                  }`}
                >
                  {add || del ? (
                    <span
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{
                        background: add
                          ? "var(--ok)"
                          : "repeating-linear-gradient(45deg, var(--danger) 0, var(--danger) 1.5px, transparent 1.5px, transparent 3px)",
                      }}
                    />
                  ) : null}
                  <span
                    className={`select-none text-center text-[11px] ${
                      add
                        ? "text-[var(--ok)]"
                        : del
                          ? "text-[var(--danger)]"
                          : "text-[var(--text-2)]"
                    }`}
                  >
                    {num ?? ""}
                  </span>
                  <code className="break-words whitespace-pre-wrap pl-1 pr-3">
                    <Pieces pieces={row.pieces} />
                  </code>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-5 w-px bg-[var(--line)]" />
            {(lines ?? []).map((line, i) => (
              <div key={i} className="grid grid-cols-[20px_minmax(0,1fr)] items-start">
                <span className="select-none text-center text-[11px] text-[var(--text-2)]">
                  {i + 1}
                </span>
                <code className="break-words whitespace-pre-wrap pl-1 pr-3">
                  {highlight(line)}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
