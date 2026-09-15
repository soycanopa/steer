// ModelSelector — tab del adapter (OpenCode) + modelos por proveedor conectado.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { OpencodeIcon } from "./icons/OpencodeIcon";

type PopoverLayout = {
  left: number;
  bottom: number;
  width: number;
};

function measurePopover(anchor: HTMLElement, width: number): PopoverLayout {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  let left = rect.left;
  left = Math.min(left, window.innerWidth - width - margin);
  left = Math.max(margin, left);
  return {
    left,
    bottom: window.innerHeight - rect.top + 6,
    width,
  };
}

export type ModelOptionView = {
  key: string;
  label: string;
  reasoning: boolean;
  /** Vacío = todas las opciones si reasoning. */
  efforts: ReasoningEffortUi[];
};

/** Adapter de agente registrado en composition (hoy: solo OpenCode). */
export type AgentAdapterView = {
  id: string;
  label: string;
};

/** Proveedor conectado vía OpenCode (Anthropic, Google, Z.AI…). */
export type ProviderGroupView = {
  id: string;
  label: string;
  models: ModelOptionView[];
};

export type ReasoningEffortUi = "low" | "high" | "max";

const ALL_EFFORTS: ReasoningEffortUi[] = ["low", "high", "max"];

const EFFORT_LABELS: Record<ReasoningEffortUi, string> = {
  low: "Bajo",
  high: "Alto",
  max: "Máx",
};

export type ModelSelectorProps = {
  /** Tabs izquierda — P0: un solo adapter (OpenCode). */
  agents: AgentAdapterView[];
  /** Modelos agrupados por proveedor conectado al adapter activo. */
  providerGroups: ProviderGroupView[];
  selectedModelKey: string | null;
  reasoningEffort: ReasoningEffortUi;
  showReasoning: boolean;
  agentOnline: boolean;
  onSelectModel(key: string): void;
  onSetReasoningEffort(effort: ReasoningEffortUi): void;
};

function findModel(
  groups: ProviderGroupView[],
  key: string | null,
): ModelOptionView | null {
  if (key == null) return null;
  for (const g of groups) {
    const m = g.models.find((x) => x.key === key);
    if (m != null) return m;
  }
  return null;
}

export function ModelSelector({
  agents,
  providerGroups,
  selectedModelKey,
  reasoningEffort,
  showReasoning,
  agentOnline,
  onSelectModel,
  onSetReasoningEffort,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<PopoverLayout | null>(null);
  /** Modelo activo en el popover (sincroniza antes que el store del padre). */
  const [popoverModelKey, setPopoverModelKey] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const activeAgent = agents[0] ?? null;
  const totalModels = providerGroups.reduce((n, g) => n + g.models.length, 0);

  const effectiveModelKey = open
    ? (popoverModelKey ?? selectedModelKey)
    : selectedModelKey;
  const effectiveModel = findModel(providerGroups, effectiveModelKey);
  const reasoningPanel =
    effectiveModel?.reasoning === true ||
    (effectiveModel == null && showReasoning);
  const effortOptions =
    effectiveModel != null && effectiveModel.efforts.length > 0
      ? ALL_EFFORTS.filter((e) => effectiveModel.efforts.includes(e))
      : ALL_EFFORTS;

  const popoverWidth = reasoningPanel ? 328 : 228;

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return providerGroups;
    return providerGroups
      .map((g) => ({
        ...g,
        models: g.models.filter(
          (m) =>
            m.label.toLowerCase().includes(q) ||
            m.key.toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.models.length > 0);
  }, [providerGroups, search]);

  const selectedLabel = useMemo(() => {
    if (selectedModelKey == null) {
      return agentOnline ? "Modelo" : "OpenCode off";
    }
    const m = findModel(providerGroups, selectedModelKey);
    if (m == null) return "Modelo";
    const name =
      m.label.length > 18 ? `${m.label.slice(0, 16)}…` : m.label;
    if (m.reasoning) {
      return `${name} · ${EFFORT_LABELS[reasoningEffort]}`;
    }
    return name;
  }, [providerGroups, selectedModelKey, agentOnline, reasoningEffort]);

  const disabled = totalModels === 0;

  useEffect(() => {
    if (open) {
      setPopoverModelKey(selectedModelKey);
    } else {
      setPopoverModelKey(null);
    }
  }, [open, selectedModelKey]);

  useLayoutEffect(() => {
    if (!open || anchorRef.current == null) {
      setLayout(null);
      return;
    }
    const update = () => {
      if (anchorRef.current != null) {
        setLayout(measurePopover(anchorRef.current, popoverWidth));
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, popoverWidth, reasoningPanel]);

  const popover =
    open && !disabled && layout != null
      ? createPortal(
          <div
            className="fixed inset-0 z-[200]"
            onMouseDown={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-label="Selector de modelo"
              className="fixed z-[201] flex overflow-hidden rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-1)] shadow-xl"
              style={{
                left: layout.left,
                bottom: layout.bottom,
                width: layout.width,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Adapter (hoy: solo OpenCode) */}
              <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-[var(--line)] bg-[var(--bg-0)] py-2">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    title={agent.label}
                    className="flex size-7 items-center justify-center rounded-[6px] bg-[var(--bg-3)] ring-1 ring-[var(--line)]"
                  >
                    <OpencodeIcon className="size-3.5" title={agent.label} />
                  </div>
                ))}
              </div>

              {/* Modelos por proveedor conectado */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-2.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-[length:var(--fs-1)] text-[var(--text-2)]">
                    {activeAgent?.label ?? "OpenCode"}
                  </span>
                  <Search size={13} strokeWidth={1.75} className="shrink-0 text-[var(--text-2)]" />
                </div>
                <div className="shrink-0 border-b border-[var(--line)] px-2 pb-2">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar modelo…"
                    className="w-full rounded-[var(--radius-s)] bg-[var(--bg-2)] px-2 py-1 text-[length:var(--fs-1)] text-[var(--text-0)] outline-none placeholder:text-[var(--text-2)]"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto py-1">
                  {filteredGroups.length === 0 ? (
                    <p className="px-3 py-2 text-[length:var(--fs-1)] text-[var(--text-2)]">
                      Sin modelos
                    </p>
                  ) : (
                    filteredGroups.map((group) => (
                      <section key={group.id}>
                        <p className="px-3 pt-2 pb-0.5 font-mono text-[length:var(--fs-0)] tracking-wide text-[var(--text-2)] uppercase">
                          {group.label}
                        </p>
                        <ul>
                          {group.models.map((m) => {
                            const selected = m.key === effectiveModelKey;
                            return (
                              <li key={m.key}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPopoverModelKey(m.key);
                                    onSelectModel(m.key);
                                    if (!m.reasoning) setOpen(false);
                                  }}
                                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-120 ${
                                    selected
                                      ? "bg-[var(--bg-3)] text-[var(--text-0)]"
                                      : "text-[var(--text-1)] hover:bg-[var(--bg-2)]"
                                  }`}
                                >
                                  <span className="min-w-0 flex-1 truncate text-[length:var(--fs-1)]">
                                    {m.label}
                                  </span>
                                  {selected ? (
                                    <Check
                                      size={13}
                                      strokeWidth={2}
                                      className="shrink-0 text-[var(--text-0)]"
                                    />
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))
                  )}
                </div>
              </div>

              {/* Reasoning */}
              {reasoningPanel ? (
                <div className="flex w-[92px] shrink-0 flex-col border-l border-[var(--line)]">
                  <div className="border-b border-[var(--line)] px-2.5 py-2">
                    <span className="text-[length:var(--fs-1)] text-[var(--text-2)]">
                      Reasoning
                    </span>
                  </div>
                  <ul className="py-1">
                    {effortOptions.map((opt) => {
                      const selected = opt === reasoningEffort;
                      return (
                        <li key={opt}>
                          <button
                            type="button"
                            onClick={() => onSetReasoningEffort(opt)}
                            className={`flex w-full items-center justify-between gap-1 px-2.5 py-1.5 text-left transition-colors duration-120 ${
                              selected
                                ? "bg-[var(--bg-3)] text-[var(--text-0)]"
                                : "text-[var(--text-1)] hover:bg-[var(--bg-2)]"
                            }`}
                          >
                            <span className="text-[length:var(--fs-1)]">
                              {EFFORT_LABELS[opt]}
                            </span>
                            {selected ? (
                              <Check size={13} strokeWidth={2} className="shrink-0 text-[var(--text-0)]" />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative shrink-0 pointer-events-auto">
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((v) => !v);
            if (!open) setSearch("");
          }
        }}
        title={
          disabled
            ? "OpenCode no responde — no hay modelos"
            : selectedLabel
        }
        className="flex h-6 max-w-[168px] min-w-0 items-center gap-1 rounded-[var(--radius-s)] bg-[var(--bg-3)] px-1.5 font-mono text-[length:var(--fs-0)] text-[var(--text-1)] transition-colors duration-120 enabled:hover:bg-[var(--bg-2)] disabled:opacity-40"
      >
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
        <ChevronDown
          size={11}
          strokeWidth={1.75}
          className={`shrink-0 text-[var(--text-2)] transition-transform duration-120 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {popover}
    </div>
  );
}

/** Agrupa modelos OpenCode por proveedor conectado (Anthropic, Google…). */
export function groupModelsByProvider(
  models: Array<{
    providerId: string;
    modelId: string;
    label: string;
    capabilities: {
      reasoning: boolean;
      reasoningVariants?: ReasoningEffortUi[];
    };
  }>,
): ProviderGroupView[] {
  const map = new Map<string, ProviderGroupView>();
  for (const m of models) {
    let group = map.get(m.providerId);
    if (group == null) {
      group = {
        id: m.providerId,
        label: formatConnectedProviderLabel(m.providerId),
        models: [],
      };
      map.set(m.providerId, group);
    }
    group.models.push({
      key: `${m.providerId}/${m.modelId}`,
      label: m.label,
      reasoning: m.capabilities.reasoning,
      efforts: m.capabilities.reasoningVariants ?? [],
    });
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function formatConnectedProviderLabel(providerId: string): string {
  const id = providerId.replace(/^acp:/, "");
  if (id.includes("anthropic")) return "Anthropic";
  if (id.includes("openai")) return "OpenAI";
  if (id.includes("google") || id.includes("gemini")) return "Google";
  if (id.includes("minimax")) return "MiniMax";
  if (id.includes("zai")) return "Z.AI";
  if (id === "opencode") return "OpenCode";
  return id.charAt(0).toUpperCase() + id.slice(1);
}
