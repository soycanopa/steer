// ModelSelector — tab del adapter (OpenCode) + modelos por proveedor conectado.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { OpencodeIcon } from "./icons/OpencodeIcon";
import { CursorIcon } from "./icons/CursorIcon";
import { GrokIcon } from "./icons/GrokIcon";
import { AntigravityIcon } from "./icons/AntigravityIcon";

type PopoverLayout = {
  left: number;
  bottom: number;
  width: number;
  maxHeight: number;
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
    maxHeight: Math.max(240, rect.top - margin),
  };
}

export type ModelParamView = {
  id: string;
  label: string;
  values: Array<{ value: string; label: string }>;
};

export type ModelOptionView = {
  key: string;
  label: string;
  reasoning: boolean;
  /** Vacío = todas las opciones si reasoning. */
  efforts: ReasoningEffortUi[];
  adapterId: string;
  params: ModelParamView[];
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
  modelParamValues: Record<string, string>;
  showReasoning: boolean;
  agentOnline: boolean;
  onSelectModel(key: string): void;
  onSetReasoningEffort(effort: ReasoningEffortUi): void;
  onSetModelParam(id: string, value: string): void;
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
  modelParamValues,
  showReasoning,
  agentOnline,
  onSelectModel,
  onSetReasoningEffort,
  onSetModelParam,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<PopoverLayout | null>(null);
  /** Modelo activo en el popover (sincroniza antes que el store del padre). */
  const [popoverModelKey, setPopoverModelKey] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const activeAgent =
    agents.find((a) => a.id === (activeAgentId ?? agents[0]?.id)) ??
    agents[0] ??
    null;
  const totalModels = providerGroups.reduce((n, g) => n + g.models.length, 0);

  const tabGroups = useMemo(() => {
    if (activeAgent == null || agents.length <= 1) return providerGroups;
    return providerGroups
      .map((g) => ({
        ...g,
        models: g.models.filter((m) => m.adapterId === activeAgent.id),
      }))
      .filter((g) => g.models.length > 0);
  }, [providerGroups, activeAgent, agents.length]);

  const effectiveModelKey = open
    ? (popoverModelKey ?? selectedModelKey)
    : selectedModelKey;
  const tabModel =
    findModel(tabGroups, effectiveModelKey) ??
    (!open ? findModel(providerGroups, selectedModelKey) : null);
  const effectiveModel = tabModel;
  // Antigravity: el effort ya va en el slug del modelo; no hay picker.
  const reasoningPanel =
    effectiveModel != null &&
    effectiveModel.adapterId !== "antigravity" &&
    (effectiveModel.reasoning === true ||
      (showReasoning && effectiveModel.key === selectedModelKey));
  const paramPanel = (effectiveModel?.params.length ?? 0) > 0;
  const sidePanel = reasoningPanel || paramPanel;
  const effortOptions =
    effectiveModel != null && effectiveModel.efforts.length > 0
      ? ALL_EFFORTS.filter((e) => effectiveModel.efforts.includes(e))
      : ALL_EFFORTS;

  const popoverWidth = sidePanel ? 328 : 228;

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return tabGroups;
    return tabGroups
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
  }, [tabGroups, search]);

  const selectedLabel = useMemo(() => {
    if (selectedModelKey == null) {
      return agentOnline ? "Modelo" : "Agente off";
    }
    const m = findModel(providerGroups, selectedModelKey);
    if (m == null) return "Modelo";
    const name =
      m.label.length > 14 ? `${m.label.slice(0, 12)}…` : m.label;
    if (m.reasoning && m.adapterId !== "antigravity") {
      return `${name} · ${EFFORT_LABELS[reasoningEffort]}`;
    }
    const paramBits: string[] = [];
    for (const param of m.params) {
      const value = modelParamValues[param.id];
      const opt = param.values.find((v) => v.value === value);
      if (opt != null && opt.value !== param.values[0]?.value) {
        paramBits.push(opt.label);
      }
    }
    if (paramBits.length > 0) {
      return `${name} · ${paramBits.join(" · ")}`;
    }
    return name;
  }, [
    providerGroups,
    selectedModelKey,
    agentOnline,
    reasoningEffort,
    modelParamValues,
  ]);

  const disabled = totalModels === 0;

  useEffect(() => {
    if (open) {
      setPopoverModelKey(selectedModelKey);
      const selected = findModel(providerGroups, selectedModelKey);
      if (selected != null) setActiveAgentId(selected.adapterId);
    } else {
      setPopoverModelKey(null);
    }
  }, [open, selectedModelKey, providerGroups]);

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
  }, [open, popoverWidth, sidePanel]);

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
              className="fixed z-[201] flex min-h-0 overflow-hidden rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-1)] shadow-xl"
              style={{
                left: layout.left,
                bottom: layout.bottom,
                width: layout.width,
                height: Math.min(layout.maxHeight, 328),
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Adapter registrado en composition */}
              <div className="flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[var(--line)] bg-[var(--bg-0)] py-2 min-h-0">
                {agents.map((agent) => {
                  const selected = agent.id === activeAgent?.id;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      title={agent.label}
                      onClick={() => setActiveAgentId(agent.id)}
                      className={`flex size-7 items-center justify-center rounded-[6px] bg-[var(--bg-3)] ${
                        selected
                          ? "ring-2 ring-[var(--text-0)]"
                          : "ring-1 ring-[var(--line)]"
                      }`}
                    >
                      {agent.id === "opencode" ? (
                        <OpencodeIcon className="size-3.5" title={agent.label} />
                      ) : agent.id === "cursor" ? (
                        <CursorIcon className="size-3.5" title={agent.label} />
                      ) : agent.id === "grok" ? (
                        <GrokIcon className="size-3.5" title={agent.label} />
                      ) : agent.id === "antigravity" ? (
                        <AntigravityIcon className="size-3.5" title={agent.label} />
                      ) : (
                        <span className="font-mono text-[length:var(--fs-0)] text-[var(--text-0)]">
                          {agent.label.slice(0, 1)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Modelos por proveedor conectado */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                <div className="min-h-0 flex-1 overflow-y-auto py-1">
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
                                    if (!m.reasoning && m.params.length === 0) {
                                      setOpen(false);
                                    }
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
              {sidePanel ? (
                <div className="flex w-[92px] min-h-0 shrink-0 flex-col overflow-y-auto border-l border-[var(--line)]">
                  {reasoningPanel ? (
                    <>
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
                    </>
                  ) : null}
                  {(effectiveModel?.params ?? []).map((param) => (
                    <div key={param.id}>
                      <div className="border-b border-[var(--line)] px-2.5 py-2">
                        <span className="text-[length:var(--fs-1)] text-[var(--text-2)]">
                          {param.label}
                        </span>
                      </div>
                      <ul className="py-1">
                        {param.values.map((opt) => {
                          const selected =
                            (modelParamValues[param.id] ??
                              param.values[0]?.value) === opt.value;
                          return (
                            <li key={opt.value}>
                              <button
                                type="button"
                                onClick={() =>
                                  onSetModelParam(param.id, opt.value)
                                }
                                className={`flex w-full items-center justify-between gap-1 px-2.5 py-1.5 text-left transition-colors duration-120 ${
                                  selected
                                    ? "bg-[var(--bg-3)] text-[var(--text-0)]"
                                    : "text-[var(--text-1)] hover:bg-[var(--bg-2)]"
                                }`}
                              >
                                <span className="text-[length:var(--fs-1)]">
                                  {opt.label}
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
                  ))}
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
            ? "Ningún agente responde — no hay modelos"
            : selectedLabel
        }
        className="flex h-6 max-w-[128px] min-w-0 items-center gap-1 rounded-[var(--radius-s)] bg-[var(--bg-3)] px-1.5 font-mono text-[length:var(--fs-0)] text-[var(--text-1)] transition-colors duration-120 enabled:hover:bg-[var(--bg-2)] disabled:opacity-40"
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
    adapterId?: string;
    modelId: string;
    label: string;
    capabilities: {
      reasoning: boolean;
      reasoningVariants?: ReasoningEffortUi[];
      params?: ModelParamView[];
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
    const adapterId = m.adapterId ?? m.providerId;
    const antigravity = adapterId === "antigravity";
    group.models.push({
      key: `${m.providerId}/${m.modelId}`,
      label: m.label,
      reasoning: antigravity ? false : m.capabilities.reasoning,
      efforts: antigravity ? [] : (m.capabilities.reasoningVariants ?? []),
      adapterId,
      params: m.capabilities.params ?? [],
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
  if (id === "cursor") return "Cursor";
  if (id === "grok" || id === "grok-build") return "Grok";
  if (id === "antigravity") return "Antigravity";
  return id.charAt(0).toUpperCase() + id.slice(1);
}
