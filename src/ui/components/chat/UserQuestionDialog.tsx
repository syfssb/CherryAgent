import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { PermissionRequest } from "./PermissionDialog";

/**
 * AskUserQuestion 的单个问题结构
 */
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

interface UserQuestionDialogProps {
  request: PermissionRequest;
  onResult: (toolUseId: string, result: PermissionResult) => void;
  sessionTitle?: string;
  queueCount?: number;
  onJumpToSession?: () => void;
  provider?: "claude" | "codex";
}

/**
 * 解析 AskUserQuestion 的 input 中的 questions 数组
 */
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

/**
 * AskUserQuestion 专用问答对话框
 * 替代 PermissionDialog，提供友好的问答 UI
 */
export function UserQuestionDialog({
  request,
  onResult,
  sessionTitle,
  queueCount,
  onJumpToSession,
  provider = "claude",
}: UserQuestionDialogProps) {
  const { t } = useTranslation();
  const questions = useMemo(
    () => parseQuestions(request.input),
    [request.input]
  );

  // 每个问题的选中状态: questionKey -> selected label(s)
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  // 每个问题的自定义输入
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  // 是否选择了 "Other" 选项
  const [showCustom, setShowCustom] = useState<Record<string, boolean>>({});

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
        // 单选：再次点击可取消
        const isSelected = current.includes(label);
        return { ...prev, [questionKey]: isSelected ? [] : [label] };
      });
      // 取消 custom 模式
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

  const handleSubmit = useCallback(() => {
    // 构建 answers: Record<string, string>
    const answers: Record<string, string> = {};

    for (const q of questions) {
      const key = q.question;
      if (showCustom[key] && customInputs[key]?.trim()) {
        answers[key] = customInputs[key].trim();
      } else if (selections[key]?.length) {
        answers[key] = selections[key].join(", ");
      }
      // 未回答的问题不添加到 answers
    }

    // 返回 allow + 带 answers 的 updatedInput
    const originalInput =
      typeof request.input === "object" && request.input !== null
        ? request.input
        : {};
    onResult(request.toolUseId, {
      behavior: "allow",
      updatedInput: { ...originalInput, answers },
    });
  }, [questions, selections, customInputs, showCustom, request, onResult]);

  const handleDismiss = useCallback(() => {
    onResult(request.toolUseId, {
      behavior: "deny",
      message: t("userQuestion.dismissed", "User dismissed the question"),
    });
  }, [request, onResult, t]);

  // 检查是否至少回答了一个问题
  const hasAnyAnswer = questions.some(
    (q) =>
      (selections[q.question]?.length ?? 0) > 0 ||
      (showCustom[q.question] && (customInputs[q.question]?.trim().length ?? 0) > 0)
  );

  // 如果解析失败，退回到显示原始 JSON，只保留跳过按钮
  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 backdrop-blur-sm px-4">
        <div className="w-full max-w-lg rounded-2xl border border-ink-900/10 bg-surface shadow-elevated overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-900/10 bg-surface-secondary">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl border text-[#ae5630] bg-[#ae5630]/10 border-[#ae5630]/20">
              <QuestionIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-ink-800">
                {t("userQuestion.title", "AI 有问题想问你")}
              </h3>
            </div>
          </div>
          <div className="px-5 py-4">
            <pre className="text-xs text-ink-700 whitespace-pre-wrap break-all font-mono bg-surface-secondary rounded-xl border border-ink-900/10 p-3 max-h-60 overflow-auto">
              {JSON.stringify(request.input, null, 2)}
            </pre>
          </div>
          <div className="flex items-center gap-3 px-5 py-4 border-t border-ink-900/10 bg-surface-secondary">
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2.5 rounded-full border border-ink-900/10 bg-surface text-sm font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
            >
              {t("userQuestion.skip", "跳过")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 backdrop-blur-sm px-4">
      <div className="w-full max-w-xl rounded-2xl border border-ink-900/10 bg-surface shadow-elevated overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-900/10 bg-surface-secondary">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl border text-[#ae5630] bg-[#ae5630]/10 border-[#ae5630]/20">
            <QuestionIcon />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-ink-800">
              {t("permission.questionFrom", "来自 {{agent}} 的问题", {
                agent: provider === "codex" ? "Codex" : "Claude",
              })}
            </h3>
            {sessionTitle && (
              <p className="mt-0.5 text-xs text-muted">
                {t("permission.sessionSource", "来自会话：{{title}}", {
                  title: sessionTitle,
                })}
              </p>
            )}
          </div>
          {typeof queueCount === "number" && queueCount > 1 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-ink-900/10 px-2 py-0.5 text-[10px] font-medium text-ink-600">
              {t("permission.queueCount", "队列 {{count}}", {
                count: queueCount,
              })}
            </span>
          )}
        </div>

        {/* 问题列表 */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-5">
          {questions.map((q) => {
            const questionKey = q.question;
            const isCustomActive = showCustom[questionKey] ?? false;

            return (
              <div key={questionKey}>
                {/* 问题标题 */}
                <div className="flex items-center gap-2 mb-2">
                  {q.header && (
                    <span className="inline-flex items-center rounded-md bg-[#ae5630]/10 px-2 py-0.5 text-[11px] font-semibold text-[#ae5630]">
                      {q.header}
                    </span>
                  )}
                  <span className="text-sm font-medium text-ink-800">
                    {q.question}
                  </span>
                </div>

                {/* 选项列表 */}
                <div className="space-y-2">
                  {q.options.map((opt) => {
                    const isSelected =
                      selections[questionKey]?.includes(opt.label) ?? false;

                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() =>
                          handleSelectOption(
                            questionKey,
                            opt.label,
                            q.multiSelect ?? false
                          )
                        }
                        className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                          isSelected && !isCustomActive
                            ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                            : "border-ink-900/10 bg-surface hover:border-ink-900/20 hover:bg-surface-secondary"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* 选中指示器 */}
                          <div
                            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                              isSelected && !isCustomActive
                                ? "border-accent bg-accent"
                                : "border-ink-900/20 bg-surface"
                            }`}
                          >
                            {isSelected && !isCustomActive && (
                              <svg
                                viewBox="0 0 24 24"
                                className="h-3 w-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-ink-800">
                              {opt.label}
                            </div>
                            {opt.description && (
                              <div className="mt-0.5 text-xs text-muted leading-relaxed">
                                {opt.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {/* "其他" 自定义输入选项 */}
                  <button
                    type="button"
                    onClick={() => handleToggleCustom(questionKey)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                      isCustomActive
                        ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                        : "border-ink-900/10 bg-surface hover:border-ink-900/20 hover:bg-surface-secondary"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          isCustomActive
                            ? "border-accent bg-accent"
                            : "border-ink-900/20 bg-surface"
                        }`}
                      >
                        {isCustomActive && (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3 w-3 text-white"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink-700">
                          {t("userQuestion.other", "其他")}
                        </div>
                      </div>
                    </div>
                  </button>

                  {isCustomActive && (
                    <div className="ml-8">
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
                        className="w-full rounded-lg border border-ink-900/15 bg-surface px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/30"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-ink-900/10 bg-surface-secondary">
          {onJumpToSession && (
            <button
              onClick={onJumpToSession}
              className="px-3 py-2 rounded-full border border-ink-900/10 bg-surface text-xs text-ink-700 hover:bg-surface-tertiary transition-colors"
            >
              {t("permission.jumpToSession", "前往会话")}
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="flex-1 px-4 py-2.5 rounded-full border border-ink-900/10 bg-surface text-sm font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
          >
            {t("userQuestion.skip", "跳过")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!hasAnyAnswer}
            className={`flex-1 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
              hasAnyAnswer
                ? "bg-accent text-white hover:bg-accent-hover"
                : "bg-ink-900/10 text-ink-400 cursor-not-allowed"
            }`}
          >
            {t("userQuestion.confirm", "确认")}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
