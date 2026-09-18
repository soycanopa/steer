// QuestionCard — human-in-the-loop del agente. Una pregunta a la vez: el
// stack se desliza al avanzar (la altura anima), el contador rueda tipo
// odómetro y el footer navega + envía. Opción única (radio) + respuesta
// custom. Portado a los tokens de Steer.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { t } from "./i18n";

export type QuestionItemView = {
  prompt: string;
  options?: string[];
};

export type QuestionCardProps = {
  prompt: string;
  questions?: QuestionItemView[];
  options?: string[];
  status: "pending" | "answered";
  answer?: string;
  error?: string;
  disabled?: boolean;
  onSubmit(answers: string[][]): void;
};

const ROLL_MS = 400;
const SLIDE = "360ms cubic-bezier(0.22, 1, 0.36, 1)";

/** Dígitos que ruedan (odómetro) cuando cambia el valor. */
function RollingDigits({ value }: { value: string }) {
  const prevRef = useRef(value);
  const [oldVal, setOldVal] = useState(value);
  const [newVal, setNewVal] = useState(value);
  const [rolling, setRolling] = useState(false);
  const [shifted, setShifted] = useState(false);
  const [dir, setDir] = useState<"up" | "down">("up");

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    prevRef.current = value;
    const fromN = parseInt(from, 10);
    const toN = parseInt(value, 10);
    setDir(
      Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN
        ? "down"
        : "up",
    );
    setOldVal(from);
    setNewVal(value);
    setRolling(true);
    setShifted(false);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShifted(true));
    });
    const done = setTimeout(() => {
      setRolling(false);
      setOldVal(value);
      setShifted(false);
    }, ROLL_MS);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(done);
    };
  }, [value]);

  const chars = rolling ? newVal : oldVal;

  return (
    <>
      {Array.from({ length: chars.length }, (_, i) => {
        const o = oldVal[i] ?? "";
        const n = chars[i] ?? "";
        if (!rolling || o === n) {
          return <span key={`${i}-${n}`}>{n}</span>;
        }
        const top = dir === "down" ? n : o;
        const bottom = dir === "down" ? o : n;
        const restY = dir === "down" ? "0" : "-1em";
        const startY = dir === "down" ? "-1em" : "0";
        return (
          <span
            key={`${i}-${o}-${n}-${dir}`}
            className="relative inline-block h-[1em] overflow-hidden align-[-0.05em] leading-none"
          >
            <span
              className="flex flex-col"
              style={{
                transition: "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)",
                transform: `translateY(${shifted ? restY : startY})`,
              }}
            >
              <span className="h-[1em] leading-none">{top}</span>
              <span className="h-[1em] leading-none">{bottom}</span>
            </span>
          </span>
        );
      })}
    </>
  );
}

function Ico({
  path,
  size = 14,
  sw = 2,
}: {
  path: ReactNode;
  size?: number;
  sw?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {path}
    </svg>
  );
}

export function QuestionCard({
  prompt,
  questions,
  options,
  status,
  answer,
  error,
  disabled = false,
  onSubmit,
}: QuestionCardProps) {
  const items =
    questions != null && questions.length > 0
      ? questions
      : [{ prompt, options }];

  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<Record<number, number[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(false);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customRef = useRef(custom);
  customRef.current = custom;
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const measured = useRef(false);
  const [viewportH, setViewportH] = useState<number | undefined>(undefined);
  const [trackY, setTrackY] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [ready, setReady] = useState(false);

  const last = qi === items.length - 1;
  const selected = picked[qi] ?? [];
  const hasAnswer = selected.length > 0 || Boolean(custom[qi]?.trim());
  const answered =
    status === "answered" && answer != null && answer !== "";

  const currentAnswered = (idx: number): boolean =>
    (picked[idx]?.length ?? 0) > 0 || Boolean(custom[idx]?.trim());

  const collect = (): string[][] =>
    items.map((item, index) => {
      const text = custom[index]?.trim();
      if (text) return [text];
      const opts = item.options ?? [];
      return (picked[index] ?? [])
        .map((i) => opts[i])
        .filter((v): v is string => v != null && v !== "");
    });

  const canSubmit = collect().every((row) => row.length > 0);

  const sync = (withAnim: boolean): void => {
    const item = questionRefs.current[qi];
    if (!item) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setViewportH(item.offsetHeight);
    setTrackY(item.offsetTop);
    setAnimate(withAnim && !reduce);
  };

  useLayoutEffect(() => {
    const withAnim = measured.current;
    measured.current = true;
    sync(withAnim);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi, picked, custom]);

  useEffect(() => {
    const id = requestAnimationFrame(() => sync(measured.current));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi]);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  const goTo = (next: number): void => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setQi(Math.min(Math.max(next, 0), items.length - 1));
  };

  const send = (): void => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (!canSubmit) return;
    setSent(true);
    onSubmit(collect());
  };

  const advance = (): void => {
    if (last) send();
    else goTo(qi + 1);
  };

  const toggle = (index: number): void => {
    if (disabled || answered) return;
    setPicked((current) => ({ ...current, [qi]: [index] }));
    setCustom((current) => ({ ...current, [qi]: "" }));
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      if (last) {
        setPicked((current) => {
          const next = { ...current, [qi]: [index] };
          const customNow = customRef.current;
          const allOk = items.every(
            (_, i) =>
              (next[i]?.length ?? 0) > 0 || Boolean(customNow[i]?.trim()),
          );
          if (allOk) {
            setSent(true);
            onSubmit(
              items.map((item, ii) => {
                const text = customNow[ii]?.trim();
                if (text) return [text];
                const opts = item.options ?? [];
                return (next[ii] ?? [])
                  .map((j) => opts[j])
                  .filter((v): v is string => v != null && v !== "");
              }),
            );
          }
          return next;
        });
      } else {
        setQi((current) => Math.min(items.length - 1, current + 1));
      }
    }, 480);
  };

  if (answered) {
    return (
      <div className="rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)] px-3 py-2">
        <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
          {t.question.answeredTitle}
        </p>
        <p className="mt-1 text-[length:var(--fs-2)] text-[var(--text-0)]">
          {prompt}
        </p>
        <p className="mt-2 text-[length:var(--fs-1)] text-[var(--ok)]">
          {t.question.answeredPrefix}{answer}
        </p>
      </div>
    );
  }

  const interactionDisabled = disabled || sent;

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-[var(--radius-m)] border border-[var(--accent)]/40 bg-[var(--bg-0)] shadow-lg">
        <div className="px-3 pt-3 pb-2">
          <p className="text-[length:var(--fs-1)] font-medium text-[var(--accent)]">
            {t.question.needsAnswer}
          </p>
          <div
            className="mt-2 overflow-hidden"
            style={{
              height: viewportH,
              transition: animate ? `height ${SLIDE}` : undefined,
            }}
            aria-live="polite"
          >
            <div
              className="flex flex-col gap-6"
              style={{
                transform: `translate3d(0, ${-trackY}px, 0)`,
                transition: animate ? `transform ${SLIDE}` : undefined,
                willChange: "transform",
              }}
            >
              {items.map((question, qIdx) => {
                const active = qIdx === qi;
                if (!ready && !active) return null;
                const opts = question.options ?? [];
                const pickedHere = picked[qIdx] ?? [];
                const qStyle: CSSProperties = {
                  opacity: active ? 1 : 0,
                  transition: animate ? `opacity ${SLIDE}` : undefined,
                  pointerEvents: active ? undefined : "none",
                };
                return (
                  <div
                    key={`${qIdx}-${question.prompt}`}
                    ref={(el) => {
                      questionRefs.current[qIdx] = el;
                    }}
                    aria-hidden={active ? undefined : true}
                    style={qStyle}
                  >
                    <div className="text-[length:var(--fs-2)] font-medium text-[var(--text-0)]">
                      {items.length > 1 ? `${qIdx + 1}. ` : ""}
                      {question.prompt}
                    </div>
                    <div className="mt-2 flex flex-col gap-1">
                      {opts.map((option, i) => {
                        const on = pickedHere.includes(i);
                        return (
                          <button
                            key={option}
                            type="button"
                            disabled={interactionDisabled}
                            tabIndex={active ? 0 : -1}
                            onClick={() => {
                              if (active) toggle(i);
                            }}
                            className={`flex items-center gap-2 rounded-[var(--radius-s)] px-1.5 py-1 text-left transition-colors duration-120 disabled:opacity-50 ${
                              on
                                ? "bg-[var(--accent-dim)] text-[var(--text-0)]"
                                : "text-[var(--text-1)] hover:bg-[var(--bg-2)]"
                            }`}
                          >
                            <span
                              className={`flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
                                on
                                  ? "bg-[var(--text-0)] text-[var(--bg-0)]"
                                  : "shadow-[inset_0_0_0_1.5px_var(--line)]"
                              }`}
                            >
                              <span
                                className="size-1.5 rounded-full bg-[var(--bg-0)] transition-transform duration-200"
                                style={{ transform: on ? "scale(1)" : "scale(0)" }}
                              />
                            </span>
                            <span className="text-[length:var(--fs-1)] leading-none">
                              {option}
                            </span>
                          </button>
                        );
                      })}
                      <label className="flex items-center gap-2 rounded-[var(--radius-s)] px-1.5 py-1">
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1.5px_var(--line)]">
                          <span className="size-1.5 rounded-full bg-[var(--text-0)] opacity-0" />
                        </span>
                        <input
                          value={custom[qIdx] ?? ""}
                          disabled={interactionDisabled}
                          tabIndex={active ? 0 : -1}
                          onChange={(event) => {
                            if (!active) return;
                            const value = event.target.value;
                            setCustom((current) => ({
                              ...current,
                              [qIdx]: value,
                            }));
                            if (value !== "") {
                              setPicked((current) => ({
                                ...current,
                                [qIdx]: [],
                              }));
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && hasAnswer) {
                              event.preventDefault();
                              advance();
                            }
                          }}
                          placeholder={t.question.customPlaceholder}
                          aria-label={t.question.customAria}
                          className="min-w-0 flex-1 bg-transparent text-[length:var(--fs-1)] text-[var(--text-0)] outline-none placeholder:text-[var(--text-2)]"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {error != null && error !== "" ? (
          <p className="px-3 pb-1 text-[length:var(--fs-0)] text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-3 py-2">
          <div className="flex items-center gap-1 text-[var(--text-2)]">
            <button
              type="button"
              aria-label={t.question.prevQuestion}
              disabled={qi <= 0 || interactionDisabled}
              onClick={() => goTo(qi - 1)}
              className="flex size-[18px] items-center justify-center rounded-[var(--radius-s)] transition-colors duration-120 enabled:hover:text-[var(--text-0)] disabled:opacity-30"
            >
              <Ico size={14} path={<path d="M18 15l-6-6-6 6" />} />
            </button>
            <span className="inline-flex items-center text-[length:var(--fs-1)] font-medium tabular-nums">
              <RollingDigits value={`${qi + 1} / ${items.length}`} />
            </span>
            <button
              type="button"
              aria-label={t.question.nextQuestion}
              disabled={last || interactionDisabled}
              onClick={() => goTo(qi + 1)}
              className="flex size-[18px] items-center justify-center rounded-[var(--radius-s)] transition-colors duration-120 enabled:hover:text-[var(--text-0)] disabled:opacity-30"
            >
              <Ico size={14} path={<path d="M6 9l6 6 6-6" />} />
            </button>
          </div>

          <button
            type="button"
            disabled={!hasAnswer || interactionDisabled}
            onClick={advance}
            title={last ? t.question.sendAnswers : t.common.next}
            className="rounded-[var(--radius-s)] bg-white px-2.5 py-1 text-[length:var(--fs-1)] font-medium text-[var(--bg-0)] transition-colors duration-120 hover:bg-[#e6e6e6] disabled:opacity-40"
          >
            {last ? t.common.send : t.common.continue}
          </button>
        </div>
      </div>
    </div>
  );
}
