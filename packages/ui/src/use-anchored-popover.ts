// useAnchoredPopover — popover anclado a un botón, montado en portal sobre
// document.body. Escapa de los contenedores con overflow-hidden (columnas
// del workspace) que recortaban los menús absolutos. `align` define a qué
// borde del ancla se alinea y `direction` si abre hacia arriba o abajo.

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export function useAnchoredPopover(
  open: boolean,
  width: number,
  align: "left" | "right" = "left",
  direction: "above" | "below" = "above",
) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (el == null) return;
      const r = el.getBoundingClientRect();
      const raw = align === "right" ? r.right - width : r.left;
      const left = Math.min(
        Math.max(8, raw),
        Math.max(8, window.innerWidth - width - 8),
      );
      setStyle(
        direction === "below"
          ? { left, top: r.bottom + 6 }
          : { left, bottom: window.innerHeight - r.top + 6 },
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, width, align, direction]);

  return { anchorRef, style };
}
