// Primitivas de menú estilo shadcn (DropdownMenu) portadas a los tokens de
// Steer: contenido = .steer-popover con inset, filas con hover y check de
// selección. El anclaje lo aporta useAnchoredPopover; acá solo vive el look.

import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";

export function MenuContent({
  children,
  className = "",
  style,
  onMouseDown,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onMouseDown?(e: React.MouseEvent): void;
}) {
  return (
    <div
      className={`steer-popover z-[201] p-1 ${className}`}
      style={style}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  selected = false,
  label,
  hint,
  title,
  onClick,
}: {
  selected?: boolean;
  label: ReactNode;
  /** Segunda línea muted (descripción corta del item). */
  hint?: ReactNode;
  title?: string;
  onClick?(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex w-full items-start gap-2 rounded-[var(--radius-s)] px-2 py-1.5 text-left transition-colors duration-120 ${
        selected
          ? "bg-[var(--bg-3)]"
          : "hover:bg-[var(--bg-2)]"
      }`}
    >
      <span className="flex size-3.5 shrink-0 translate-y-[1px] items-center justify-center">
        {selected ? (
          <Check size={12} strokeWidth={2.5} className="text-[var(--text-0)]" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--fs-1)] text-[var(--text-0)]">
          {label}
        </span>
        {hint != null ? (
          <span className="block truncate font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
            {hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}
