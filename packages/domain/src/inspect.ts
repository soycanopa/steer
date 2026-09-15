// Kind del inspector según el nodo seleccionado (UI.md §5.2).
// Texto / caja / imagen muestran conjuntos distintos de tweaks.

import type { Selection } from "./intent";

export type InspectKind = "text" | "image" | "box";

const TEXT_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "a",
  "label",
  "li",
  "em",
  "strong",
  "small",
  "code",
  "blockquote",
  "figcaption",
  "time",
  "i",
  "b",
  "u",
  "button",
]);

const IMAGE_TAGS = new Set(["img", "picture", "svg", "video", "canvas"]);

export function inspectKind(selection: Pick<Selection, "tag">): InspectKind {
  const tag = selection.tag.toLowerCase();
  if (IMAGE_TAGS.has(tag)) return "image";
  if (TEXT_TAGS.has(tag)) return "text";
  return "box";
}

export function isFlexOrGrid(computed: Record<string, string>): boolean {
  const d = (computed.display ?? "").toLowerCase();
  return d.includes("flex") || d.includes("grid");
}
