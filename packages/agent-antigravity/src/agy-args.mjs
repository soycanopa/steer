// Flags de sesión `agy`. El CLI ignora el cwd del proceso: hay que
// registrar el proyecto con --add-dir.

import path from "node:path";

export function buildAgySessionArgs(opts) {
  const cwd =
    typeof opts.cwd === "string" && opts.cwd !== ""
      ? path.resolve(opts.cwd)
      : "";
  const args = [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
  ];
  if (cwd !== "") {
    args.push("--add-dir", cwd);
  }
  if (typeof opts.modelId === "string" && opts.modelId !== "") {
    args.push("--model", opts.modelId);
  }
  if (typeof opts.effort === "string" && opts.effort !== "") {
    args.push("--effort", opts.effort);
  }
  return { args, cwd };
}

function isScratch(dir) {
  return /antigravity-cli[/\\]scratch/i.test(dir);
}

/** null = ok; string = error en español. */
export function workspaceMismatch(initCwd, requested) {
  if (typeof requested !== "string" || requested.trim() === "") {
    return "directory requerido";
  }
  const want = path.resolve(requested);
  const gotRaw = typeof initCwd === "string" ? initCwd.trim() : "";
  if (gotRaw === "") {
    return "Antigravity no reportó cwd. El turno no arranca sin el proyecto abierto.";
  }
  const got = path.resolve(gotRaw);
  if (isScratch(got) && path.resolve(got) !== want) {
    return `Antigravity usaría ${got} (scratch) en vez del proyecto abierto ${want}.`;
  }
  const a = want.toLowerCase();
  const b = got.toLowerCase();
  const sep = path.sep;
  if (a === b || b.startsWith(a + sep) || a.startsWith(b + sep)) {
    return null;
  }
  return `Antigravity cwd ${got} no coincide con el proyecto abierto ${want}.`;
}
