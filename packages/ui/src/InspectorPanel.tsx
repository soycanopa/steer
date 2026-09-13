// InspectorPanel — UI.md §5 con look de herramienta de diseño
// (Webflow-like): secciones con aire, filas label|control, chip de valor
// editable, color en píldora (swatch+hex) y dirty state con from→to en
// línea propia. Recibe datos y callbacks; no conoce stores ni adapters.

import { useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Pin,
  RotateCcw,
  X,
} from "lucide-react";
import type { Scope, Selection, TweakProp } from "@steer/domain";
import {
  alignFromComputed,
  colorToHex,
  numFromPx,
  opacityFromComputed,
  pxValue,
  P0_TWEAK_PROPS,
} from "@steer/domain";

export type TweakView = {
  prop: TweakProp;
  from: string;
  to: string;
};

export type PinView = {
  id: string;
  pin: number;
  body: string;
};

export type InspectorPanelProps = {
  selection: Selection | null;
  scope: Scope;
  /** Drafts de la selección actual (App filtra por nodo+scope). */
  tweaks: TweakView[];
  /** Comments encolados de la selección actual (UI.md §5.3). */
  pins: PinView[];
  onSetScope(scope: Scope): void;
  onSetTweak(prop: TweakProp, to: string): void;
  onResetTweak(prop: TweakProp): void;
  onResetAll(): void;
  onAddPin(body: string): void;
  onRemovePin(id: string): void;
};

export function InspectorPanel({
  selection,
  scope,
  tweaks,
  pins,
  onSetScope,
  onSetTweak,
  onResetTweak,
  onResetAll,
  onAddPin,
  onRemovePin,
}: InspectorPanelProps) {
  if (selection === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[length:var(--fs-2)] text-[var(--text-1)]">
          Pulsa <Key>I</Key> y haz click
        </p>
        <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
          Un nodo del preview llena este panel.
        </p>
      </div>
    );
  }

  const tweakOf = (prop: TweakProp): TweakView | undefined =>
    tweaks.find((t) => t.prop === prop);

  return (
    <div className="flex h-full flex-col gap-4 px-4 py-4">
      <Section title="Selección">
        <div className="flex flex-col gap-2">
          <Breadcrumb selection={selection} />
          <PathRow selection={selection} />
          {selection.textPreview ? (
            <p className="line-clamp-2 text-[length:var(--fs-1)] leading-relaxed text-[var(--text-2)] italic">
              “{selection.textPreview}”
            </p>
          ) : null}
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[length:var(--fs-0)] text-[var(--text-2)]">
              Alcance
            </span>
            <Segmented<Scope>
              value={scope}
              onChange={onSetScope}
              options={[
                { value: "instance", label: "Instancia" },
                { value: "component", label: "Componente" },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="Tweaks">
        <div className="flex flex-col">
          {P0_TWEAK_PROPS.map((prop) => (
            <TweakRow
              key={prop}
              prop={prop}
              selection={selection}
              tweak={tweakOf(prop)}
              onSet={onSetTweak}
              onReset={onResetTweak}
            />
          ))}
        </div>
        {tweaks.length > 0 ? (
          <button
            type="button"
            onClick={onResetAll}
            className="mt-3 flex items-center gap-1.5 text-[length:var(--fs-1)] text-[var(--text-2)] transition-colors duration-120 hover:text-[var(--text-0)]"
          >
            <RotateCcw size={11} strokeWidth={1.75} />
            Reset preview
          </button>
        ) : null}
      </Section>

      <Section title="Pins">
        <PinSection pins={pins} onAdd={onAddPin} onRemove={onRemovePin} />
      </Section>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[var(--radius-s)] bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[length:var(--fs-0)] text-[var(--text-0)]">
      {children}
    </kbd>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 font-mono text-[length:var(--fs-0)] tracking-wider text-[var(--text-2)] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Breadcrumb({ selection }: { selection: Selection }) {
  const parts = selection.breadcrumb.length
    ? selection.breadcrumb
    : [selection.tag];
  return (
    <p className="text-[length:var(--fs-2)] font-medium text-[var(--text-0)]">
      {parts.map((part, i) => (
        <span key={`${part}-${i}`}>
          {i > 0 ? <span className="text-[var(--text-2)]"> / </span> : null}
          {part}
        </span>
      ))}
    </p>
  );
}

function PathRow({ selection }: { selection: Selection }) {
  const [copied, setCopied] = useState(false);
  const path = selection.source.file
    ? `${selection.source.file}:${selection.source.line}`
    : null;

  if (path === null) {
    return (
      <p className="rounded-[var(--radius-s)] bg-[var(--warn)]/10 px-2 py-1 font-mono text-[length:var(--fs-0)] text-[var(--warn)]">
        Sin data-tsd-source — activa TanStack Devtools source injection
      </p>
    );
  }

  return (
    <button
      type="button"
      title="Click para copiar"
      onClick={() => {
        void navigator.clipboard.writeText(path).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="w-fit rounded-[var(--radius-s)] bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[length:var(--fs-0)] text-[var(--text-1)] transition-colors duration-120 hover:bg-[var(--bg-3)] hover:text-[var(--text-0)]"
    >
      {copied ? "copiado ✓" : path}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange(v: T): void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex overflow-hidden rounded-[var(--radius-s)] bg-[var(--bg-2)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[length:var(--fs-0)] transition-colors duration-120 ${
            o.value === value
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--text-1)] hover:bg-[var(--bg-3)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Fila Webflow-like: [dot][label][control …chip] y, si está dirty, una
// segunda línea mono con from → to. Nada se monta: el valor computado
// solo aparece en la línea dirty, el chip muestra el valor activo.
function TweakRow({
  prop,
  selection,
  tweak,
  onSet,
  onReset,
}: {
  prop: TweakProp;
  selection: Selection;
  tweak: TweakView | undefined;
  onSet(prop: TweakProp, to: string): void;
  onReset(prop: TweakProp): void;
}) {
  const computed = selection.computed[prop];
  const dirty = tweak !== undefined;

  return (
    <div className="border-b border-[var(--line)] py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span
          className={`size-1.5 shrink-0 rounded-full ${dirty ? "bg-[var(--accent)]" : "bg-transparent"}`}
          aria-hidden
        />
        <span className="w-[68px] shrink-0 text-[length:var(--fs-1)] text-[var(--text-1)]">
          {LABELS[prop]}
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <Control
            prop={prop}
            computed={computed}
            tweak={tweak}
            onSet={onSet}
          />
        </div>
        {dirty ? (
          <button
            type="button"
            onClick={() => onReset(prop)}
            title="Reset de esta fila"
            className="shrink-0 text-[var(--text-2)] transition-colors duration-120 hover:text-[var(--text-0)]"
          >
            <RotateCcw size={11} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      {dirty ? (
        <p className="ml-[78px] mt-1 truncate font-mono text-[length:var(--fs-0)] text-[var(--text-2)]">
          {tweak.from} → <span className="text-[var(--accent)]">{tweak.to}</span>
        </p>
      ) : null}
    </div>
  );
}

const LABELS: Record<TweakProp, string> = {
  fontSize: "Font size",
  fontWeight: "Weight",
  color: "Color",
  backgroundColor: "Fondo",
  textAlign: "Align",
  padding: "Padding",
  gap: "Gap",
  borderRadius: "Radius",
  opacity: "Opacity",
};

function Control({
  prop,
  computed,
  tweak,
  onSet,
}: {
  prop: TweakProp;
  computed: string | undefined;
  tweak: TweakView | undefined;
  onSet(prop: TweakProp, to: string): void;
}) {
  switch (prop) {
    case "fontSize":
      return (
        <SliderControl
          min={10}
          max={72}
          initial={numFromPx(computed) ?? 16}
          current={tweak ? numFromPx(tweak.to) : null}
          unit="px"
          onValue={(n) => onSet(prop, pxValue(n))}
        />
      );
    case "padding":
      return (
        <SliderControl
          min={0}
          max={64}
          initial={numFromPx(computed) ?? 0}
          current={tweak ? numFromPx(tweak.to) : null}
          unit="px"
          onValue={(n) => onSet(prop, pxValue(n))}
        />
      );
    case "borderRadius":
      return (
        <SliderControl
          min={0}
          max={32}
          initial={numFromPx(computed) ?? 0}
          current={tweak ? numFromPx(tweak.to) : null}
          unit="px"
          onValue={(n) => onSet(prop, pxValue(n))}
        />
      );
    case "opacity":
      return (
        <SliderControl
          min={0}
          max={100}
          initial={opacityFromComputed(computed) ?? 100}
          current={tweak ? opacityFromComputed(tweak.to) : null}
          unit="%"
          onValue={(n) => onSet(prop, (n / 100).toFixed(2))}
        />
      );
    case "color":
      return (
        <ColorControl
          initial={colorToHex(computed) ?? "#000000"}
          current={tweak ? colorToHex(tweak.to) : null}
          onSet={(hex) => onSet(prop, hex)}
        />
      );
    case "textAlign":
      return (
        <AlignControl
          initial={alignFromComputed(computed)}
          current={tweak ? alignFromComputed(tweak.to) : null}
          onSet={(v) => onSet(prop, v)}
        />
      );
    default:
      // Weight / background / gap: fuera del P0 de la Fase D.
      return <span className="text-[length:var(--fs-0)] text-[var(--text-2)]">—</span>;
  }
}

// Slider + chip numérico editable (Webflow: el valor vive junto al
// slider, no en una columna aparte).
function SliderControl({
  min,
  max,
  initial,
  current,
  unit,
  onValue,
}: {
  min: number;
  max: number;
  initial: number;
  current: number | null;
  unit: string;
  onValue(n: number): void;
}) {
  const [text, setText] = useState<string | null>(null);
  const value = current ?? initial;
  const clamped = Math.min(max, Math.max(min, value));

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={clamped}
        onChange={(e) => onValue(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
      />
      <span className="relative shrink-0">
        <input
          type="text"
          inputMode="numeric"
          value={text ?? String(clamped)}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (Number.isFinite(n) && e.target.value.trim() !== "") {
              onValue(Math.min(max, Math.max(min, n)));
            }
          }}
          onBlur={() => setText(null)}
          className="w-12 rounded-[var(--radius-s)] bg-[var(--bg-2)] py-0.5 pr-1 pl-1.5 text-right font-mono text-[length:var(--fs-0)] text-[var(--text-0)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-[length:var(--fs-0)] text-[var(--text-2)]">
          {unit}
        </span>
      </span>
    </div>
  );
}

// Píldora única: [swatch color input][hex editable]. Sin columnas
// aparte: el hex ES el valor.
function ColorControl({
  initial,
  current,
  onSet,
}: {
  initial: string;
  current: string | null;
  onSet(hex: string): void;
}) {
  const value = current ?? initial;
  const [text, setText] = useState(value);
  if (text !== value && /^#[0-9a-fA-F]{6}$/.test(value)) {
    setText(value);
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <label className="relative size-5 shrink-0 cursor-pointer overflow-hidden rounded-[var(--radius-s)] border border-[var(--line)]">
        <span className="absolute inset-0" style={{ background: value }} />
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onSet(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        type="text"
        spellCheck={false}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onSet(v.toLowerCase());
        }}
        className="min-w-0 flex-1 rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 py-0.5 font-mono text-[length:var(--fs-0)] text-[var(--text-0)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />
    </div>
  );
}

const ALIGN_ICONS = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
} as const;

function AlignControl({
  initial,
  current,
  onSet,
}: {
  initial: string | null;
  current: string | null;
  onSet(v: string): void;
}) {
  const value = current ?? initial;
  return (
    <div className="flex gap-1">
      {(Object.keys(ALIGN_ICONS) as Array<keyof typeof ALIGN_ICONS>).map((k) => {
        const Icon = ALIGN_ICONS[k];
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSet(k)}
            title={`Align ${k}`}
            className={`flex size-6 items-center justify-center rounded-[var(--radius-s)] transition-colors duration-120 ${
              active
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-1)] hover:bg-[var(--bg-3)]"
            }`}
          >
            <Icon size={13} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

// UI.md §5.3 / UX §5.5: textarea 3 filas, Enter envía (Shift+Enter =
// nueva línea), pin vacío no se encola. Lista de pins de la selección.
function PinSection({
  pins,
  onAdd,
  onRemove,
}: {
  pins: PinView[];
  onAdd(body: string): void;
  onRemove(id: string): void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = text.trim();
    if (trimmed === "") return;
    onAdd(trimmed);
    setText("");
    requestAnimationFrame(() => ref.current?.focus());
  }

  return (
    <div className="flex flex-col gap-2">
      {pins.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {pins.map((p) => (
            <li
              key={p.id}
              className="flex items-start gap-2 rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 py-1"
            >
              <span className="mt-0.5 flex items-center gap-1 font-mono text-[length:var(--fs-0)] text-[var(--pin)]">
                <Pin size={11} strokeWidth={1.75} />#{p.pin}
              </span>
              <span className="min-w-0 flex-1 text-[length:var(--fs-1)] text-[var(--text-1)]">
                {p.body}
              </span>
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                title="Borrar pin"
                className="text-[var(--text-2)] transition-colors duration-120 hover:text-[var(--danger)]"
              >
                <X size={12} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        ref={ref}
        id="steer-pin-input"
        rows={3}
        value={text}
        placeholder="Comentario anclado al nodo… (Enter envía)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="resize-none rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 py-1.5 text-[length:var(--fs-1)] text-[var(--text-0)] outline-none placeholder:text-[var(--text-2)] focus:ring-1 focus:ring-[var(--accent)]"
      />
      <button
        type="button"
        onClick={submit}
        disabled={text.trim() === ""}
        className="w-fit rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 py-1 text-[length:var(--fs-1)] text-[var(--text-0)] transition-colors duration-120 hover:bg-[var(--bg-3)] disabled:opacity-40"
      >
        Añadir pin
      </button>
    </div>
  );
}
