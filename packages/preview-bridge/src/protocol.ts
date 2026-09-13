// protocol.ts — helper tipado del lado parent del protocolo steer:*
// (TRD §6). Los tipos del protocolo viven en @steer/ports; aquí vive el
// parser de data-tsd-source que comparten bridge y tests.

import type { SourceLoc } from "@steer/domain";

/** "src/components/Hero.tsx:42:6" → SourceLoc. Faltante → null.
 *  El bridge.js replica esta lógica en vanilla JS (no hay build step). */
export function parseSourceAttr(value: string | null): SourceLoc | null {
  if (value === null) return null;
  const m = /^(.+?):(\d+):(\d+)$/.exec(value.trim());
  if (m === null) return null;
  const line = Number(m[2]);
  const col = Number(m[3]);
  if (!Number.isFinite(line) || !Number.isFinite(col)) return null;
  return { file: m[1] ?? "", line, col };
}
