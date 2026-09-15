import { useState } from "react";

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
  const [drafts, setDrafts] = useState<string[]>(() => items.map(() => ""));
  const [picked, setPicked] = useState<Array<string | null>>(() =>
    items.map(() => null),
  );

  if (status === "answered" && answer != null && answer !== "") {
    return (
      <div className="rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-0)] px-3 py-2">
        <p className="text-[length:var(--fs-1)] text-[var(--text-2)]">
          Pregunta del agente
        </p>
        <p className="mt-1 text-[length:var(--fs-2)] text-[var(--text-0)]">
          {prompt}
        </p>
        <p className="mt-2 text-[length:var(--fs-1)] text-[var(--ok)]">
          Respondiste: {answer}
        </p>
      </div>
    );
  }

  function collectAnswers(): string[][] {
    return items.map((item, index) => {
      const opts = item.options ?? [];
      if (opts.length > 0) {
        const choice = picked[index];
        return choice != null && choice !== "" ? [choice] : [];
      }
      const text = drafts[index]?.trim() ?? "";
      return text !== "" ? [text] : [];
    });
  }

  const canSubmit =
    !disabled && collectAnswers().every((row) => row.length > 0);

  return (
    <div className="rounded-[var(--radius-m)] border border-[var(--accent)]/40 bg-[var(--bg-0)] px-3 py-2">
      <p className="text-[length:var(--fs-1)] font-medium text-[var(--accent)]">
        El agente necesita tu respuesta
      </p>
      <div className="mt-2 flex flex-col gap-3">
        {items.map((item, index) => {
          const opts = item.options ?? [];
          return (
            <div key={`${index}-${item.prompt}`}>
              <p className="text-[length:var(--fs-2)] text-[var(--text-0)]">
                {items.length > 1 ? `${index + 1}. ` : ""}
                {item.prompt}
              </p>
              {opts.length > 0 ? (
                <div className="mt-2 flex flex-col gap-1">
                  {opts.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        setPicked((prev) => {
                          const next = [...prev];
                          next[index] = opt;
                          return next;
                        })
                      }
                      className={`rounded-[var(--radius-s)] px-2.5 py-1.5 text-left text-[length:var(--fs-1)] transition-colors duration-120 ${
                        picked[index] === opt
                          ? "bg-[var(--accent-dim)] text-[var(--text-0)]"
                          : "bg-[var(--bg-2)] text-[var(--text-1)] hover:bg-[var(--bg-3)]"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="text"
                  value={drafts[index] ?? ""}
                  disabled={disabled}
                  placeholder="Tu respuesta…"
                  onChange={(e) =>
                    setDrafts((prev) => {
                      const next = [...prev];
                      next[index] = e.target.value;
                      return next;
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmit) {
                      onSubmit(collectAnswers());
                    }
                  }}
                  className="mt-2 w-full rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--bg-1)] px-2.5 py-1.5 text-[length:var(--fs-1)] text-[var(--text-0)] outline-none focus:border-[var(--accent)]"
                />
              )}
            </div>
          );
        })}
      </div>
      {error != null && error !== "" ? (
        <p className="mt-2 text-[length:var(--fs-1)] text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(collectAnswers())}
          className="rounded-[var(--radius-s)] bg-[var(--accent)] px-2.5 py-1 text-[length:var(--fs-1)] font-medium text-white transition-colors duration-120 hover:bg-[#6c99ff] disabled:opacity-40"
        >
          Enviar respuesta
        </button>
      </div>
    </div>
  );
}
