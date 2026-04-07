import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { PermissionRequest } from "./PermissionDialog";

interface QuestionOption {
  label: string;
  description?: string;
}

interface QuestionItem {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

interface InlineUserQuestionProps {
  request: PermissionRequest;
  onResult: (toolUseId: string, result: PermissionResult) => void;
}

function parseQuestions(input: unknown): QuestionItem[] {
  if (!input || typeof input !== "object") return [];
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.questions)) return [];
  return obj.questions.filter(
    (q: unknown): q is QuestionItem =>
      typeof q === "object" &&
      q !== null &&
      typeof (q as QuestionItem).question === "string" &&
      Array.isArray((q as QuestionItem).options) &&
      (q as QuestionItem).options.every(
        (opt: unknown) =>
          typeof opt === "object" &&
          opt !== null &&
          typeof (opt as QuestionOption).label === "string"
      )
  );
}

export function InlineUserQuestion({ request, onResult }: InlineUserQuestionProps) {
  const { t } = useTranslation();

  const questions = useMemo(
    () => parseQuestions(request.input),
    [request.input]
  );

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [showCustom, setShowCustom] = useState<Record<string, boolean>>({});

  const isSingleImmediateSelect =
    questions.length === 1 && !(questions[0]?.multiSelect ?? false);

  const handleSelectOption = useCallback(
    (questionKey: string, label: string, multiSelect: boolean) => {
      setSelections((prev) => {
        const current = prev[questionKey] ?? [];
        if (multiSelect) {
          const isSelected = current.includes(label);
          return {
            ...prev,
            [questionKey]: isSelected
              ? current.filter((l) => l !== label)
              : [...current, label],
          };
        }
        const isSelected = current.includes(label);
        return { ...prev, [questionKey]: isSelected ? [] : [label] };
      });
      setShowCustom((prev) => ({ ...prev, [questionKey]: false }));
    },
    []
  );

  const handleToggleCustom = useCallback(
    (questionKey: string) => {
      const willBeCustom = !(showCustom[questionKey] ?? false);
      setShowCustom((prev) => ({ ...prev, [questionKey]: willBeCustom }));
      if (willBeCustom) {
        setSelections((prev) => ({ ...prev, [questionKey]: [] }));
      }
    },
    [showCustom]
  );

  const handleCustomInputChange = useCallback(
    (questionKey: string, value: string) => {
      setCustomInputs((prev) => ({ ...prev, [questionKey]: value }));
    },
    []
  );

  const buildAnswersAndSubmit = useCallback(
    (overrideSelections?: Record<string, string[]>) => {
      const answers: Record<string, string> = {};
      const sel = overrideSelections ?? selections;
      for (const q of questions) {
        const key = q.question;
        if (showCustom[key] && customInputs[key]?.trim()) {
          answers[key] = customInputs[key].trim();
        } else if (sel[key]?.length) {
          answers[key] = sel[key].join(", ");
        }
      }
      const originalInput =
        typeof request.input === "object" && request.input !== null
          ? request.input
          : {};
      onResult(request.toolUseId, {
        behavior: "allow",
        updatedInput: { ...originalInput, answers },
      });
    },
    [questions, selections, customInputs, showCustom, request, onResult]
  );

  const handleSubmit = useCallback(() => {
    buildAnswersAndSubmit();
  }, [buildAnswersAndSubmit]);

  const handleDismiss = useCallback(() => {
    onResult(request.toolUseId, {
      behavior: "deny",
      message: t("userQuestion.dismissed", "User dismissed the question"),
    });
  }, [request, onResult, t]);

  const handleImmediateSelect = useCallback(
    (questionKey: string, label: string) => {
      const newSelections = { ...selections, [questionKey]: [label] };
      buildAnswersAndSubmit(newSelections);
    },
    [selections, buildAnswersAndSubmit]
  );

  const hasAnyAnswer = questions.some(
    (q) =>
      (selections[q.question]?.length ?? 0) > 0 ||
      (showCustom[q.question] &&
        (customInputs[q.question]?.trim().length ?? 0) > 0)
  );

  // ── Shared header ──────────────────────────────────────────────────────────
  const CardHeader = (
    <div className="flex items-center gap-1.5">
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 flex-shrink-0 text-[#ae5630]/60"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span className="text-[11px] font-medium tracking-wide text-[#87867f]">
        {t("userQuestion.title", "Claude 有问题想问你")}
      </span>
    </div>
  );

  // ── Fallback (parse failure) ───────────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#1414131a] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] dark:border-[#faf9f51a] dark:bg-[#2b2a27]">
        <div className="h-[2px] bg-gradient-to-r from-[#ae5630]/50 to-transparent" />
        <div className="space-y-3 px-5 py-4">
          {CardHeader}
          <pre className="max-h-40 overflow-auto rounded-xl border border-[#1414131a] bg-[#faf9f5] p-3 font-mono text-[11px] leading-relaxed text-[#6b6a68] [overflow-wrap:anywhere] dark:border-[#faf9f51a] dark:bg-[#1f1e1b] dark:text-[#9a9893]">
            {JSON.stringify(request.input, null, 2)}
          </pre>
          <button
            onClick={handleDismiss}
            className="text-[12px] text-[#b0aea5] transition-colors hover:text-[#87867f]"
          >
            {t("userQuestion.skip", "跳过")}
          </button>
        </div>
      </div>
    );
  }

  // ── Main card ──────────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-2xl border border-[#1414131a] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] dark:border-[#faf9f51a] dark:bg-[#2b2a27]">
      {/* top accent gradient bar */}
      <div className="h-[2px] bg-gradient-to-r from-[#ae5630]/50 to-transparent" />

      <div className="space-y-4 px-5 py-4">
        {CardHeader}

        {questions.map((q) => {
          const questionKey = q.question;
          const isCustomActive = showCustom[questionKey] ?? false;
          const multiSelect = q.multiSelect ?? false;
          // ≤ 2 options + single-select → horizontal pill row
          const useHorizontal = q.options.length <= 2 && !multiSelect;

          return (
            <div key={questionKey} className="space-y-2.5">
              {/* Question title + header badge */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {q.header && (
                  <span className="inline-flex items-center rounded-md bg-[#ae5630]/[0.08] px-2 py-0.5 text-[11px] font-semibold text-[#ae5630]">
                    {q.header}
                  </span>
                )}
                <span className="text-[14px] font-semibold leading-snug text-[#141413] dark:text-[#faf9f5]">
                  {q.question}
                </span>
              </div>

              {/* ── Horizontal pill layout (≤2 options, single-select) ── */}
              {useHorizontal ? (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt) => {
                    const isSelected =
                      selections[questionKey]?.includes(opt.label) ?? false;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() =>
                          isSingleImmediateSelect
                            ? handleImmediateSelect(questionKey, opt.label)
                            : handleSelectOption(questionKey, opt.label, false)
                        }
                        className={[
                          "rounded-full border px-4 py-1.5 text-[13px] font-medium transition-all duration-150",
                          isSelected
                            ? "border-[#ae5630]/25 bg-[#ae5630]/[0.08] text-[#ae5630]"
                            : "border-[#1414131a] bg-transparent text-[#141413] hover:bg-[#1414130d] dark:border-[#faf9f51a] dark:text-[#faf9f5] dark:hover:bg-[#faf9f50d]",
                        ].join(" ")}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  {/* "其他" pill */}
                  <button
                    type="button"
                    onClick={() => handleToggleCustom(questionKey)}
                    className={[
                      "rounded-full border px-4 py-1.5 text-[13px] font-medium transition-all duration-150",
                      isCustomActive
                        ? "border-[#ae5630]/25 bg-[#ae5630]/[0.08] text-[#ae5630]"
                        : "border-[#1414131a] bg-transparent text-[#87867f] hover:bg-[#1414130d] dark:border-[#faf9f51a] dark:hover:bg-[#faf9f50d]",
                    ].join(" ")}
                  >
                    {t("userQuestion.other", "其他...")}
                  </button>
                </div>
              ) : (
                /* ── Flat list layout (>2 options or multi-select) ── */
                <div className="-mx-2 space-y-px">
                  {q.options.map((opt) => {
                    const isSelected =
                      (selections[questionKey]?.includes(opt.label) ?? false) &&
                      !isCustomActive;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() =>
                          isSingleImmediateSelect
                            ? handleImmediateSelect(questionKey, opt.label)
                            : handleSelectOption(
                                questionKey,
                                opt.label,
                                multiSelect
                              )
                        }
                        className={[
                          "relative w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
                          isSelected
                            ? "bg-[#ae5630]/[0.06] dark:bg-[#ae5630]/[0.08]"
                            : "hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]",
                        ].join(" ")}
                      >
                        {/* left accent bar — selected only */}
                        {isSelected && (
                          <span className="absolute left-1 top-1/2 h-[55%] w-[3px] -translate-y-1/2 rounded-full bg-[#ae5630]" />
                        )}
                        <div className="pl-2">
                          <div
                            className={[
                              "text-[13px] font-medium leading-snug",
                              isSelected
                                ? "text-[#ae5630]"
                                : "text-[#141413] dark:text-[#faf9f5]",
                            ].join(" ")}
                          >
                            {opt.label}
                          </div>
                          {opt.description && (
                            <div className="mt-0.5 text-[11px] leading-relaxed text-[#87867f] dark:text-[#9a9893]">
                              {opt.description}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* "其他" row */}
                  <button
                    type="button"
                    onClick={() => handleToggleCustom(questionKey)}
                    className={[
                      "relative w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
                      isCustomActive
                        ? "bg-[#ae5630]/[0.06] dark:bg-[#ae5630]/[0.08]"
                        : "hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]",
                    ].join(" ")}
                  >
                    {isCustomActive && (
                      <span className="absolute left-1 top-1/2 h-[55%] w-[3px] -translate-y-1/2 rounded-full bg-[#ae5630]" />
                    )}
                    <span
                      className={[
                        "pl-2 text-[13px] font-medium",
                        isCustomActive
                          ? "text-[#ae5630]"
                          : "text-[#87867f]",
                      ].join(" ")}
                    >
                      {t("userQuestion.other", "其他...")}
                    </span>
                  </button>
                </div>
              )}

              {/* Custom text input */}
              {isCustomActive && (
                <input
                  type="text"
                  value={customInputs[questionKey] ?? ""}
                  onChange={(e) =>
                    handleCustomInputChange(questionKey, e.target.value)
                  }
                  placeholder={t(
                    "userQuestion.customPlaceholder",
                    "请输入你的回答..."
                  )}
                  className="w-full rounded-xl border border-[#1414131a] bg-[#faf9f5] px-3 py-2 text-[13px] text-[#141413] placeholder:text-[#b0aea5] transition-colors focus:border-[#ae5630]/40 focus:outline-none focus:ring-1 focus:ring-[#ae5630]/20 dark:border-[#faf9f51a] dark:bg-[#1f1e1b] dark:text-[#faf9f5] dark:placeholder:text-[#5e5d59]"
                  autoFocus
                />
              )}
            </div>
          );
        })}

        {/* Bottom action bar */}
        <div className="flex items-center justify-between pt-0.5">
          <button
            onClick={handleDismiss}
            className="text-[12px] text-[#b0aea5] transition-colors hover:text-[#87867f]"
          >
            {t("userQuestion.skip", "跳过")}
          </button>

          {(!isSingleImmediateSelect ||
            showCustom[questions[0]?.question ?? ""]) && (
            <button
              onClick={handleSubmit}
              disabled={!hasAnyAnswer}
              className="rounded-full bg-[#ae5630] px-4 py-1.5 text-[12px] font-medium text-white transition-all duration-200 hover:bg-[#c4633a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("userQuestion.confirm", "确认")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
