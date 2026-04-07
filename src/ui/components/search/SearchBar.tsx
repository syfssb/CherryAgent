import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Input } from "../ui/input";
import { useAppStore } from "../../store/useAppStore";
import { useTranslation } from "react-i18next";
import { getLocaleFromLanguage } from "@/ui/i18n/config";

interface SearchResult {
  type: "session" | "message";
  sessionId: string;
  sessionTitle: string;
  content?: string;
  snippet?: string;
  messageId?: string;
  rank?: number;
  createdAt?: number;
}

type FullSearchSession = {
  id: string;
  title: string;
  lastPrompt?: string;
  updatedAt?: number;
};

type FullSearchMessage = {
  sessionId: string;
  sessionTitle: string;
  content?: string;
  snippet?: string;
  messageId?: string;
  rank?: number;
  createdAt?: number;
};

type FullSearchResponse = {
  success: boolean;
  data?: {
    sessions: FullSearchSession[];
    messages: FullSearchMessage[];
  };
  error?: string;
};

interface SearchBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSession?: (sessionId: string) => boolean | void;
}

export function SearchBar({ open, onOpenChange, onSelectSession }: SearchBarProps) {
  const { t, i18n } = useTranslation();
  const locale = getLocaleFromLanguage(i18n.language);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);

  // 自动聚焦输入框
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // 重置状态
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setIsSearching(false);
    }
  }, [open]);

  // 执行搜索
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.trim().length === 0) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await window.electron.session.fullSearch(searchQuery, {
        includeArchived: false,
        messageLimit: 20,
        messageOffset: 0
      }) as FullSearchResponse;

      if (response.success && response.data) {
        const { sessions, messages } = response.data;

        // 合并会话和消息结果
        const combined: SearchResult[] = [
          ...sessions.map((session) => ({
            type: "session" as const,
            sessionId: session.id,
            sessionTitle: session.title,
            content: session.lastPrompt || "",
            createdAt: session.updatedAt
          })),
          ...messages.map((msg) => ({
            type: "message" as const,
            sessionId: msg.sessionId,
            sessionTitle: msg.sessionTitle,
            content: msg.content,
            snippet: msg.snippet,
            messageId: msg.messageId,
            rank: msg.rank,
            createdAt: msg.createdAt
          }))
        ];

        setResults(combined);
        setSelectedIndex(0);
      } else {
        console.error("[SearchBar] Search failed:", response.error);
        setResults([]);
      }
    } catch (error) {
      console.error("[SearchBar] Search error:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 处理搜索输入（防抖）
  const handleSearchChange = useCallback(
    (value: string) => {
      setQuery(value);
      setIsSearching(true);

      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }

      searchTimerRef.current = window.setTimeout(() => {
        performSearch(value);
      }, 300);
    },
    [performSearch]
  );

  // 选择搜索结果
  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      if (onSelectSession) {
        const didSelect = onSelectSession(result.sessionId);
        if (didSelect !== false) {
          onOpenChange(false);
        }
        return;
      }
      setActiveSessionId(result.sessionId);
      onOpenChange(false);
    },
    [onSelectSession, setActiveSessionId, onOpenChange]
  );

  // 处理键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        handleSelectResult(results[selectedIndex]);
      }
    },
    [handleSelectResult, results, selectedIndex]
  );

  // 自动滚动到选中项
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth"
        });
      }
    }
  }, [selectedIndex]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  // 高亮关键词
  const highlightText = useCallback(
    (text: string, isHtml: boolean = false) => {
      if (!query || !text) return text;

      if (isHtml && text.includes("<mark>")) {
        // 已经包含高亮标记（来自 FTS snippet）
        return text;
      }

      const words = query.trim().split(/\s+/);
      let highlightedText = text;

      words.forEach((word) => {
        const regex = new RegExp(`(${word})`, "gi");
        highlightedText = highlightedText.replace(
          regex,
          '<mark class="bg-[#ae5630]/20 text-[#ae5630] dark:bg-[#ae5630]/30">$1</mark>'
        );
      });

      return highlightedText;
    },
    [query]
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[15%] z-50 w-full max-w-2xl -translate-x-1/2 rounded-2xl border border-ink-900/10 bg-white p-0 shadow-2xl dark:border-ink-400/20 dark:bg-surface"
          onKeyDown={handleKeyDown}
          onEscapeKeyDown={() => onOpenChange(false)}
        >
          {/* 搜索输入框 */}
          <div className="flex items-center gap-3 border-b border-ink-900/10 px-4 py-3 dark:border-ink-400/10">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 flex-shrink-0 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t("search.placeholder", "搜索会话和消息...")}
              className="border-0 bg-transparent px-0 text-base focus-visible:ring-0"
            />
            {isSearching && (
              <svg
                className="h-5 w-5 animate-spin text-muted"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
          </div>

          {/* 搜索结果列表 */}
          <div
            ref={resultsRef}
            className="max-h-[60vh] overflow-y-auto"
          >
            {query && results.length === 0 && !isSearching && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg
                  viewBox="0 0 24 24"
                  className="mb-3 h-12 w-12 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                  <path d="M11 8v6M8 11h6" />
                </svg>
                <p className="text-sm text-muted">
                  {t("search.noResults", "未找到匹配的结果")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t("search.noResultsHint", "尝试使用不同的关键词搜索")}
                </p>
              </div>
            )}

            {!query && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg
                  viewBox="0 0 24 24"
                  className="mb-3 h-12 w-12 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <p className="text-sm text-muted">
                  {t("search.emptyTitle", "输入关键词搜索会话和消息")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t(
                    "search.emptyHint",
                    "支持搜索会话标题、最后提示和所有消息内容"
                  )}
                </p>
              </div>
            )}

            {results.map((result, index) => (
              <div
                key={`${result.type}-${result.sessionId}-${result.messageId || ""}`}
                className={`cursor-pointer border-b border-ink-900/5 px-4 py-3 transition-colors hover:bg-ink-900/5 dark:border-ink-400/10 dark:hover:bg-ink-400/5 ${
                  index === selectedIndex
                    ? "bg-accent-subtle"
                    : ""
                }`}
                onClick={() => handleSelectResult(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-start gap-3">
                  {/* 图标 */}
                  <div className="mt-0.5 flex-shrink-0">
                    {result.type === "session" ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5 text-accent"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5 text-info"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    )}
                  </div>

                  {/* 内容 */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink-800 dark:text-ink-800">
                        {result.sessionTitle}
                      </span>
                      <span className="flex-shrink-0 rounded-full bg-ink-900/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted dark:bg-ink-400/10">
                        {result.type === "session"
                          ? t("search.resultSession", "会话")
                          : t("search.resultMessage", "消息")}
                      </span>
                    </div>
                    <div
                      className="line-clamp-2 text-sm text-muted"
                      dangerouslySetInnerHTML={{
                        __html: highlightText(
                          result.snippet || result.content || "",
                          !!result.snippet
                        )
                      }}
                    />
                    {result.createdAt && (
                      <div className="mt-1 text-xs text-muted">
                        {new Date(result.createdAt).toLocaleString(locale, {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 底部提示 */}
          {results.length > 0 && (
            <div className="flex items-center justify-between border-t border-ink-900/10 px-4 py-2 dark:border-ink-400/10">
              <div className="flex items-center gap-4 text-xs text-muted">
                <div className="flex items-center gap-1.5">
                  <kbd className="rounded border border-ink-900/20 bg-ink-900/5 px-1.5 py-0.5 font-mono dark:border-ink-400/20 dark:bg-ink-400/10">
                    ↑↓
                  </kbd>
                  <span>{t("search.hint.navigate", "导航")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="rounded border border-ink-900/20 bg-ink-900/5 px-1.5 py-0.5 font-mono dark:border-ink-400/20 dark:bg-ink-400/10">
                    ↵
                  </kbd>
                  <span>{t("search.hint.select", "选择")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="rounded border border-ink-900/20 bg-ink-900/5 px-1.5 py-0.5 font-mono dark:border-ink-400/20 dark:bg-ink-400/10">
                    ESC
                  </kbd>
                  <span>{t("common.close", "关闭")}</span>
                </div>
              </div>
              <div className="text-xs text-muted">
                {t("search.resultCount", "共 {{count}} 个结果", {
                  count: results.length,
                })}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
