// Inspector — estilo de las refs (filas compactas, secciones Size /
// Layout / Typography / Styles). Padding+margin anidados tipo Webflow.
// Recibe datos y callbacks; no conoce stores ni adapters.

import { useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowRight,
  Bold,
  ChevronRight,
  Italic,
  LayoutGrid,
  Pin,
  Plus,
  RotateCcw,
  Square,
  StretchHorizontal,
  Underline,
  WrapText,
  X,
} from "lucide-react";
import type { Scope, Selection, TweakProp } from "@steer/domain";
import {
  alignFromComputed,
  boxToCss,
  colorToHex,
  inspectKind,
  isFlexOrGrid,
  lineHeightFromComputed,
  lineHeightValue,
  numFromPx,
  opacityFromComputed,
  parseBoxValues,
  pxValue,
  spacingFromComputed,
  weightFromComputed,
  weightValue,
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
  tweaks: TweakView[];
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

  const kind = inspectKind(selection);
  const flex = isFlexOrGrid(selection.computed);
  const val = (prop: TweakProp): string | undefined =>
    tweaks.find((t) => t.prop === prop)?.to ?? selection.computed[prop];
  const set = onSetTweak;

  return (
    <div className="flex h-full flex-col gap-4 px-3 py-3">
      <header className="flex flex-col gap-1.5">
        <p className="flex min-w-0 items-center text-[13px] text-[var(--text-1)]">
          {(selection.breadcrumb.length ? selection.breadcrumb : [selection.tag]).map(
            (part, i) => (
              <span key={`${part}-${i}`} className="flex min-w-0 items-center">
                {i > 0 ? (
                  <ChevronRight
                    size={12}
                    strokeWidth={1.75}
                    className="mx-0.5 shrink-0 text-[var(--text-2)]"
                  />
                ) : null}
                <span
                  className={
                    i === (selection.breadcrumb.length || 1) - 1
                      ? "truncate text-[var(--text-0)]"
                      : "truncate"
                  }
                >
                  {part}
                </span>
              </span>
            ),
          )}
        </p>
        <PathRow selection={selection} />
        <div className="flex justify-end">
          <Segmented<Scope>
            value={scope}
            onChange={onSetScope}
            options={[
              { value: "instance", label: "Instancia" },
              { value: "component", label: "Componente" },
            ]}
          />
        </div>
      </header>

      <Block title="Tamaño">
        <SizeField
          label="Ancho"
          computed={selection.computed.width}
          current={tweaks.find((t) => t.prop === "width")?.to}
          onSet={(v) => set("width", v)}
        />
        <SizeField
          label="Alto"
          computed={selection.computed.height}
          current={tweaks.find((t) => t.prop === "height")?.to}
          onSet={(v) => set("height", v)}
        />
        {kind === "box" ? (
          <Field label="Max W">
            <Num
              value={numFromPx(val("maxWidth")) ?? 0}
              unit="px"
              onChange={(n) => set("maxWidth", pxValue(n))}
            />
          </Field>
        ) : null}
      </Block>

      <Block title="Layout">
        <Field label={`Tipo (${flex ? (selection.computed.display?.includes("grid") ? "Grid" : "Flex") : "Default"})`}>
          <IconGroup>
            <Ico
              title="Default"
              active={!flex}
              icon={StretchHorizontal}
            />
            <Ico title="Flex" active={flex && !selection.computed.display?.includes("grid")} icon={Square} />
            <Ico
              title="Grid"
              active={!!selection.computed.display?.includes("grid")}
              icon={LayoutGrid}
            />
          </IconGroup>
        </Field>
        {flex ? (
          <>
            <Field label="Dirección">
              <IconGroup>
                <Ico
                  title="Fila"
                  active={(val("flexDirection") ?? "row").startsWith("row")}
                  icon={ArrowRight}
                  onClick={() => set("flexDirection", "row")}
                />
                <Ico
                  title="Columna"
                  active={(val("flexDirection") ?? "").startsWith("column")}
                  icon={ArrowDown}
                  onClick={() => set("flexDirection", "column")}
                />
              </IconGroup>
            </Field>
            <Field label="Wrap">
              <button
                type="button"
                title="Wrap"
                onClick={() =>
                  set(
                    "flexWrap",
                    (val("flexWrap") ?? "nowrap") === "wrap" ? "nowrap" : "wrap",
                  )
                }
                className={`flex size-7 items-center justify-center rounded-[6px] ${
                  (val("flexWrap") ?? "nowrap") === "wrap"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--bg-3)] text-[var(--text-1)]"
                }`}
              >
                <WrapText size={13} strokeWidth={1.75} />
              </button>
            </Field>
            <Field label="Distribuir">
              <JustifyBar
                value={val("justifyContent") ?? "flex-start"}
                onSet={(v) => set("justifyContent", v)}
              />
            </Field>
            <Field label="Alinear">
              <AlignItemsBar
                value={val("alignItems") ?? "stretch"}
                onSet={(v) => set("alignItems", v)}
              />
            </Field>
            <Field label="Gap">
              <Num
                value={numFromPx(val("gap")) ?? 0}
                unit="px"
                onChange={(n) => set("gap", pxValue(n))}
              />
            </Field>
          </>
        ) : null}
        <SpacingVisual
          selection={selection}
          marginTweak={tweaks.find((t) => t.prop === "margin")}
          paddingTweak={tweaks.find((t) => t.prop === "padding")}
          onSet={onSetTweak}
          onReset={onResetTweak}
        />
      </Block>

      {kind === "text" ? (
        <>
          {selection.textPreview ? (
            <Block title="Texto">
              <p className="rounded-[8px] bg-[var(--bg-2)] px-2.5 py-2 text-[13px] leading-snug text-[var(--text-0)]">
                {selection.textPreview}
              </p>
            </Block>
          ) : null}
          <Block title="Tipografía">
            <div className="flex gap-1">
              <div className="flex h-8 min-w-0 flex-1 items-center rounded-[8px] bg-[var(--bg-2)] px-2 text-[12px] text-[var(--text-0)]">
                <span className="truncate">
                  {selection.computed.fontFamily || "fuente"}
                </span>
              </div>
              <select
                aria-label="Peso"
                value={String(weightFromComputed(val("fontWeight")) ?? 400)}
                onChange={(e) => set("fontWeight", weightValue(Number(e.target.value)))}
                className="h-8 w-[72px] shrink-0 rounded-[8px] bg-[var(--bg-2)] px-1.5 font-mono text-[12px] text-[var(--text-0)] outline-none"
              >
                {[400, 500, 600, 700].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-1">
              <MiniNum
                label="Aa"
                value={numFromPx(val("fontSize")) ?? 16}
                onChange={(n) => set("fontSize", pxValue(n))}
              />
              <MiniNum
                label="↔"
                value={spacingFromComputed(val("letterSpacing")) ?? 0}
                onChange={(n) => set("letterSpacing", pxValue(n))}
              />
              <MiniNum
                label="↕"
                value={lineHeightFromComputed(val("lineHeight")) ?? 20}
                onChange={(n) =>
                  set("lineHeight", lineHeightValue(n, selection.computed.lineHeight))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <IconGroup>
                {(
                  [
                    ["left", AlignLeft],
                    ["center", AlignCenter],
                    ["right", AlignRight],
                    ["justify", AlignJustify],
                  ] as const
                ).map(([k, Icon]) => (
                  <Ico
                    key={k}
                    title={`Alinear ${k}`}
                    active={alignFromComputed(val("textAlign")) === k}
                    icon={Icon}
                    onClick={() => set("textAlign", k)}
                  />
                ))}
              </IconGroup>
              <IconGroup>
                <Ico
                  title="Subrayado"
                  active={(val("textDecoration") ?? "none").includes("underline")}
                  icon={Underline}
                  onClick={() =>
                    set(
                      "textDecoration",
                      (val("textDecoration") ?? "none").includes("underline")
                        ? "none"
                        : "underline",
                    )
                  }
                />
                <Ico
                  title="Negrita"
                  active={(weightFromComputed(val("fontWeight")) ?? 400) >= 600}
                  icon={Bold}
                  onClick={() =>
                    set(
                      "fontWeight",
                      (weightFromComputed(val("fontWeight")) ?? 400) >= 600
                        ? "400"
                        : "700",
                    )
                  }
                />
                <Ico
                  title="Cursiva"
                  active={(val("fontStyle") ?? "normal") === "italic"}
                  icon={Italic}
                  onClick={() =>
                    set(
                      "fontStyle",
                      (val("fontStyle") ?? "normal") === "italic" ? "normal" : "italic",
                    )
                  }
                />
              </IconGroup>
            </div>
            <Field label="Color">
              <ColorChip
                hex={colorToHex(val("color")) ?? "#ffffff"}
                onSet={(hex) => set("color", hex)}
              />
            </Field>
          </Block>
        </>
      ) : null}

      {kind === "image" ? (
        <Block title="Imagen">
          <Field label="Encaje">
            <select
              value={val("objectFit") ?? "fill"}
              onChange={(e) => set("objectFit", e.target.value)}
              className="h-7 rounded-[6px] bg-[var(--bg-3)] px-1.5 font-mono text-[11px] text-[var(--text-0)] outline-none"
            >
              <option value="cover">cover</option>
              <option value="contain">contain</option>
              <option value="fill">fill</option>
            </select>
          </Field>
        </Block>
      ) : null}

      <Block title="Estilos">
        <div className="flex gap-1">
          <Field label="Opacidad" className="flex-1">
            <Num
              value={opacityFromComputed(val("opacity")) ?? 100}
              unit="%"
              onChange={(n) => set("opacity", (n / 100).toFixed(2))}
            />
          </Field>
          <Field label="Radio" className="flex-1">
            <Num
              value={numFromPx(val("borderRadius")) ?? 0}
              unit=""
              onChange={(n) => set("borderRadius", pxValue(n))}
            />
            {tweaks.some((t) => t.prop === "borderRadius") ? (
              <button
                type="button"
                title="Reiniciar radio"
                onClick={() => onResetTweak("borderRadius")}
                className="text-[var(--text-2)] hover:text-[var(--text-0)]"
              >
                <RotateCcw size={11} strokeWidth={1.75} />
              </button>
            ) : null}
          </Field>
        </div>
        <AddRow
          label="Fondo"
          active={colorToHex(val("backgroundColor")) != null && val("backgroundColor") !== "rgba(0, 0, 0, 0)"}
          onAdd={() => set("backgroundColor", "#1e2127")}
        >
          {colorToHex(val("backgroundColor")) != null &&
          val("backgroundColor") !== "rgba(0, 0, 0, 0)" ? (
            <ColorChip
              hex={colorToHex(val("backgroundColor")) ?? "#1e2127"}
              onSet={(hex) => set("backgroundColor", hex)}
            />
          ) : null}
        </AddRow>
      </Block>

      <Block title="Pins">
        <PinSection pins={pins} onAdd={onAddPin} onRemove={onRemovePin} />
      </Block>

      {tweaks.length > 0 ? (
        <button
          type="button"
          onClick={onResetAll}
          className="flex items-center gap-1.5 text-[12px] text-[var(--text-2)] hover:text-[var(--text-0)]"
        >
          <RotateCcw size={11} strokeWidth={1.75} />
          Reiniciar preview
        </button>
      ) : null}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-[13px] font-medium text-[var(--text-0)]">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-8 min-w-0 items-center gap-2 rounded-[8px] bg-[var(--bg-2)] px-2.5 ${className}`}
    >
      <span className="shrink-0 text-[12px] text-[var(--text-1)]">{label}</span>
      <div className="ml-auto flex min-w-0 items-center gap-1">{children}</div>
    </div>
  );
}

function SizeField({
  label,
  computed,
  current,
  onSet,
}: {
  label: string;
  computed: string | undefined;
  current: string | undefined;
  onSet(v: string): void;
}) {
  const raw = current ?? computed ?? "";
  const fill = raw.includes("%");
  const n = fill
    ? Number(/([\d.]+)%/.exec(raw)?.[1] ?? 100)
    : (numFromPx(raw) ?? 0);
  return (
    <div className="flex h-8 items-center gap-1 rounded-[8px] bg-[var(--bg-2)] px-2.5">
      <span className="text-[12px] text-[var(--text-1)]">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "0"}
        onChange={(e) => {
          const v = Number(/(-?[\d.]+)/.exec(e.target.value)?.[1] ?? NaN);
          if (!Number.isFinite(v)) return;
          onSet(fill ? `${v}%` : pxValue(v));
        }}
        className="ml-auto w-14 bg-transparent text-right font-mono text-[12px] text-[var(--text-0)] outline-none"
      />
      <span className="w-5 text-[11px] text-[var(--text-2)]">{fill ? "%" : "px"}</span>
      <select
        value={fill ? "fill" : "fixed"}
        onChange={(e) => {
          if (e.target.value === "fill") onSet("100%");
          else onSet(pxValue(numFromPx(computed) ?? 100));
        }}
        className="h-6 rounded-[6px] bg-[var(--bg-3)] px-1 font-mono text-[11px] text-[var(--text-1)] outline-none"
      >
        <option value="fixed">Fixed</option>
        <option value="fill">Fill</option>
      </select>
    </div>
  );
}

function Num({
  value,
  unit,
  onChange,
}: {
  value: number;
  unit: string;
  onChange(n: number): void;
}) {
  return (
    <span className="flex items-center gap-0.5 font-mono text-[12px] text-[var(--text-0)]">
      <input
        type="text"
        inputMode="numeric"
        value={String(Math.round(value * 100) / 100)}
        onChange={(e) => {
          const n = Number(/(-?[\d.]+)/.exec(e.target.value)?.[1] ?? NaN);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-10 bg-transparent text-right outline-none"
      />
      {unit ? <span className="text-[var(--text-2)]">{unit}</span> : null}
    </span>
  );
}

function MiniNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(n: number): void;
}) {
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-[8px] bg-[var(--bg-2)] px-2">
      <span className="text-[10px] text-[var(--text-2)]">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={String(Math.round(value * 100) / 100)}
        onChange={(e) => {
          const n = Number(/(-?[\d.]+)/.exec(e.target.value)?.[1] ?? NaN);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="min-w-0 flex-1 bg-transparent text-right font-mono text-[12px] text-[var(--text-0)] outline-none"
      />
    </div>
  );
}

function ColorChip({ hex, onSet }: { hex: string; onSet(hex: string): void }) {
  const clean = hex.startsWith("#") ? hex : `#${hex}`;
  const shown = /^#[0-9a-fA-F]{6}$/.test(clean)
    ? clean.replace("#", "").toUpperCase()
    : hex.replace("#", "");
  return (
    <div className="flex items-center gap-1.5">
      <label className="relative size-4 shrink-0 cursor-pointer overflow-hidden rounded-[4px] border border-[var(--line)]">
        <span className="absolute inset-0" style={{ background: clean }} />
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(clean) ? clean : "#000000"}
          onChange={(e) => onSet(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        spellCheck={false}
        defaultValue={shown}
        key={shown}
        onChange={(e) => {
          const v = e.target.value.replace("#", "");
          if (/^[0-9a-fA-F]{6}$/.test(v)) onSet(`#${v.toLowerCase()}`);
        }}
        className="w-14 bg-transparent font-mono text-[11px] text-[var(--text-0)] outline-none"
      />
    </div>
  );
}

function AddRow({
  label,
  active,
  onAdd,
  children,
}: {
  label: string;
  active: boolean;
  onAdd(): void;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-8 items-center rounded-[8px] bg-[var(--bg-2)] px-2.5">
      <span className="text-[12px] text-[var(--text-1)]">{label}</span>
      <div className="ml-auto flex items-center gap-1">
        {active ? children : (
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1 text-[12px] text-[var(--text-2)] hover:text-[var(--text-0)]"
          >
            <Plus size={12} strokeWidth={1.75} />
            Add
          </button>
        )}
      </div>
    </div>
  );
}

function IconGroup({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Ico({
  title,
  active,
  icon: Icon,
  onClick,
}: {
  title: string;
  active: boolean;
  icon: typeof ArrowRight;
  onClick?(): void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded-[6px] ${
        active ? "bg-[var(--bg-3)] text-[var(--text-0)]" : "text-[var(--text-2)] hover:text-[var(--text-0)]"
      }`}
    >
      <Icon size={13} strokeWidth={1.75} />
    </button>
  );
}

const JUSTIFY = ["flex-start", "center", "flex-end", "space-between", "space-around"] as const;

function JustifyBar({ value, onSet }: { value: string; onSet(v: string): void }) {
  return (
    <IconGroup>
      {JUSTIFY.map((v) => (
        <button
          key={v}
          type="button"
          title={v}
          onClick={() => onSet(v)}
          className={`h-6 min-w-5 rounded-[4px] px-1 font-mono text-[9px] ${
            value === v ? "bg-[var(--accent)] text-white" : "text-[var(--text-2)] hover:text-[var(--text-0)]"
          }`}
        >
          {v === "flex-start" ? "|=" : v === "center" ? "=|=" : v === "flex-end" ? "=|" : v === "space-between" ? "| |" : "|·|"}
        </button>
      ))}
    </IconGroup>
  );
}

function AlignItemsBar({ value, onSet }: { value: string; onSet(v: string): void }) {
  const opts = ["flex-start", "center", "flex-end", "stretch"] as const;
  return (
    <IconGroup>
      {opts.map((v) => (
        <button
          key={v}
          type="button"
          title={v}
          onClick={() => onSet(v)}
          className={`h-6 min-w-5 rounded-[4px] px-1 font-mono text-[9px] ${
            value === v ? "bg-[var(--accent)] text-white" : "text-[var(--text-2)] hover:text-[var(--text-0)]"
          }`}
        >
          {v === "flex-start" ? "▴" : v === "center" ? "◆" : v === "flex-end" ? "▾" : "↕"}
        </button>
      ))}
    </IconGroup>
  );
}

function PathRow({ selection }: { selection: Selection }) {
  const [copied, setCopied] = useState(false);
  const path = selection.source.file
    ? `${selection.source.file}:${selection.source.line}`
    : null;
  if (path === null) {
    return (
      <p className="rounded-[6px] bg-[var(--warn)]/10 px-2 py-1 font-mono text-[11px] text-[var(--warn)]">
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
      className="w-fit font-mono text-[11px] text-[var(--text-2)] hover:text-[var(--text-0)]"
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
    <div className="flex overflow-hidden rounded-[6px] bg-[var(--bg-2)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2 py-0.5 text-[11px] ${
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

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[6px] bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-0)]">
      {children}
    </kbd>
  );
}

function SpacingVisual({
  selection,
  marginTweak,
  paddingTweak,
  onSet,
  onReset,
}: {
  selection: Selection;
  marginTweak: TweakView | undefined;
  paddingTweak: TweakView | undefined;
  onSet(prop: TweakProp, to: string): void;
  onReset(prop: TweakProp): void;
}) {
  const m = parseBoxValues(marginTweak ? marginTweak.to : selection.computed.margin);
  const p = parseBoxValues(paddingTweak ? paddingTweak.to : selection.computed.padding);
  const setBox = (
    prop: "margin" | "padding",
    vals: [number, number, number, number],
    i: 0 | 1 | 2 | 3,
    n: number,
  ) => {
    const next = [...vals] as [number, number, number, number];
    next[i] = n;
    onSet(prop, boxToCss(next));
  };

  return (
    <div className="relative mt-1 h-[108px] overflow-hidden rounded-[6px]">
      <div
        className="absolute inset-x-0 top-0 h-[20px] bg-[#3a3e45]"
        style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 28px) 100%, 28px 100%)" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[20px] bg-[#25282e]"
        style={{ clipPath: "polygon(28px 0, calc(100% - 28px) 0, 100% 100%, 0 100%)" }}
      />
      <div
        className="absolute inset-y-0 left-0 w-[28px] bg-[#32363c]"
        style={{ clipPath: "polygon(0 0, 100% 20px, 100% calc(100% - 20px), 0 100%)" }}
      />
      <div
        className="absolute inset-y-0 right-0 w-[28px] bg-[#2c3036]"
        style={{ clipPath: "polygon(0 20px, 100% 0, 100% 100%, 0 calc(100% - 20px))" }}
      />
      <span className="pointer-events-none absolute top-1 left-1.5 z-10 text-[8px] font-semibold tracking-[0.14em] text-[var(--text-2)]">
        MARGIN
      </span>
      {marginTweak ? (
        <button
          type="button"
          title="Reiniciar margin"
          onClick={() => onReset("margin")}
          className="absolute top-1 right-1 z-10 text-[var(--text-2)] hover:text-[var(--text-0)]"
        >
          <RotateCcw size={10} strokeWidth={1.75} />
        </button>
      ) : null}
      <SideNum aria="Margin top" value={m[0]} onChange={(n) => setBox("margin", m, 0, n)} className="absolute top-[3px] left-1/2 z-10 -translate-x-1/2" />
      <SideNum aria="Margin right" value={m[1]} onChange={(n) => setBox("margin", m, 1, n)} className="absolute top-1/2 right-[1px] z-10 -translate-y-1/2" />
      <SideNum aria="Margin bottom" value={m[2]} onChange={(n) => setBox("margin", m, 2, n)} className="absolute bottom-[3px] left-1/2 z-10 -translate-x-1/2" />
      <SideNum aria="Margin left" value={m[3]} onChange={(n) => setBox("margin", m, 3, n)} className="absolute top-1/2 left-[1px] z-10 -translate-y-1/2" />
      <div className="absolute inset-[20px_28px] rounded-[3px] bg-[#3a3e46]">
        <span className="pointer-events-none absolute top-0.5 left-1.5 z-10 text-[8px] font-semibold tracking-[0.14em] text-[var(--text-2)]">
          PADDING
        </span>
        {paddingTweak ? (
          <button
            type="button"
            title="Reiniciar padding"
            onClick={() => onReset("padding")}
            className="absolute top-0.5 right-1 z-10 text-[var(--text-2)] hover:text-[var(--text-0)]"
          >
            <RotateCcw size={10} strokeWidth={1.75} />
          </button>
        ) : null}
        <SideNum aria="Padding top" value={p[0]} onChange={(n) => setBox("padding", p, 0, n)} className="absolute top-0.5 left-1/2 z-10 -translate-x-1/2" />
        <SideNum aria="Padding right" value={p[1]} onChange={(n) => setBox("padding", p, 1, n)} className="absolute top-1/2 right-0.5 z-10 -translate-y-1/2" />
        <SideNum aria="Padding bottom" value={p[2]} onChange={(n) => setBox("padding", p, 2, n)} className="absolute bottom-0.5 left-1/2 z-10 -translate-x-1/2" />
        <SideNum aria="Padding left" value={p[3]} onChange={(n) => setBox("padding", p, 3, n)} className="absolute top-1/2 left-0.5 z-10 -translate-y-1/2" />
        <div
          className="absolute top-1/2 right-6 left-6 h-3 -translate-y-1/2 rounded-[2px] bg-[var(--bg-0)]"
          title={selection.tag}
        />
      </div>
    </div>
  );
}

function SideNum({
  value,
  aria,
  onChange,
  className,
}: {
  value: number;
  aria: string;
  onChange(n: number): void;
  className: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={aria}
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw === "") {
          onChange(0);
          return;
        }
        const n = Number(/(-?\d+(?:\.\d+)?)/.exec(raw)?.[1] ?? NaN);
        if (Number.isFinite(n)) onChange(n);
      }}
      className={`h-[18px] w-7 rounded-[3px] bg-transparent text-center font-mono text-[11px] text-[var(--text-1)] outline-none hover:text-[var(--text-0)] focus:bg-[var(--accent)] focus:text-white ${className}`}
    />
  );
}

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
              className="flex items-start gap-2 rounded-[8px] bg-[var(--bg-2)] px-2 py-1"
            >
              <span className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-[var(--pin)]">
                <Pin size={11} strokeWidth={1.75} />#{p.pin}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-[var(--text-1)]">{p.body}</span>
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                title="Borrar pin"
                className="text-[var(--text-2)] hover:text-[var(--danger)]"
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
        rows={2}
        value={text}
        placeholder="Comentario anclado… (Enter envía)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="resize-none rounded-[8px] bg-[var(--bg-2)] px-2 py-1.5 text-[12px] text-[var(--text-0)] outline-none placeholder:text-[var(--text-2)]"
      />
    </div>
  );
}
