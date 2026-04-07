import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/utils";

const STORAGE_MARKER_START = "<!--MEMORY_DATA";
const STORAGE_MARKER_END = "MEMORY_DATA-->";
const MAX_CHARS = 10000;
const AUTO_SAVE_DELAY = 800;
const TAG_COLOR_CLASSES = [
  "bg-rose-500/15 text-rose-700 border-rose-400/30",
  "bg-orange-500/15 text-orange-700 border-orange-400/30",
  "bg-amber-500/15 text-amber-700 border-amber-400/30",
  "bg-emerald-500/15 text-emerald-700 border-emerald-400/30",
  "bg-teal-500/15 text-teal-700 border-teal-400/30",
  "bg-cyan-500/15 text-cyan-700 border-cyan-400/30",
  "bg-sky-500/15 text-sky-700 border-sky-400/30",
  "bg-indigo-500/15 text-indigo-700 border-indigo-400/30",
  "bg-violet-500/15 text-violet-700 border-violet-400/30",
  "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-400/30",
  "bg-pink-500/15 text-pink-700 border-pink-400/30",
  "bg-lime-500/15 text-lime-700 border-lime-400/30",
];

export type MemoryEditorProps = {
  className?: string;
};

type MemoryCard = {
  id: string;
  name: string;
  content: string;
  tags: string[];
};

type MemorySnapshot = {
  version: 1;
  cards: MemoryCard[];
};

type ViewMode = "cards" | "list";

function parseSnapshot(raw: string): MemorySnapshot | null {
  const startIndex = raw.indexOf(STORAGE_MARKER_START);
  const endIndex = raw.indexOf(STORAGE_MARKER_END);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return null;
  const jsonBlock = raw
    .slice(startIndex + STORAGE_MARKER_START.length, endIndex)
    .trim();
  if (!jsonBlock) return null;
  try {
    const parsed = JSON.parse(jsonBlock) as MemorySnapshot;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.cards)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeCards(cards: MemoryCard[]): MemoryCard[] {
  return cards.map((card) => ({
    id: card.id || crypto.randomUUID(),
    name: typeof (card as any).name === "string" ? (card as any).name : ((card as any).title ?? ""),
    content: typeof card.content === "string" ? card.content : "",
    tags: Array.isArray(card.tags) ? card.tags.filter((tag) => typeof tag === "string") : [],
  }));
}

function serializeSnapshot(cards: MemoryCard[]): string {
  const snapshot: MemorySnapshot = { version: 1, cards: normalizeCards(cards) };
  const marker = `${STORAGE_MARKER_START}\n${JSON.stringify(snapshot)}\n${STORAGE_MARKER_END}`;
  const markdown = buildMarkdown(snapshot.cards);
  return `${marker}\n\n${markdown}`.trim();
}

function buildMarkdown(cards: MemoryCard[]): string {
  const sections = cards
    .filter((card) => card.name.trim() || card.content.trim())
    .map((card) => {
      const tagsLine = card.tags.length > 0 ? `标签：${card.tags.join("、")}` : "";
      const parts = [
        `## ${card.name || "未命名"}`,
        tagsLine,
        card.content.trim(),
      ].filter(Boolean);
      return parts.join("\n");
    });

  if (sections.length === 0) {
    return "# 用户记忆\n\n(暂无内容)";
  }

  return [`# 用户记忆`, ...sections].join("\n\n");
}

function createCard(partial?: Partial<MemoryCard>): MemoryCard {
  return {
    id: crypto.randomUUID(),
    name: partial?.name ?? "",
    content: partial?.content ?? "",
    tags: partial?.tags ?? [],
  };
}

function normalizeTags(value: string): string[] {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hashTag(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash << 5) - hash + tag.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTagClass(tag: string): string {
  if (!tag) return "bg-ink-900/10 text-ink-700 border-ink-900/20";
  const index = hashTag(tag) % TAG_COLOR_CLASSES.length;
  return TAG_COLOR_CLASSES[index];
}

function isCardEmpty(card: MemoryCard): boolean {
  return !card.name.trim() && !card.content.trim() && card.tags.length === 0;
}

export function MemoryEditor({ className }: MemoryEditorProps) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [tagFilter, setTagFilter] = useState("");

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const card of cards) {
      card.tags.forEach((tag) => tags.add(tag));
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const filteredCards = useMemo(() => {
    if (!tagFilter.trim()) return cards;
    const normalized = tagFilter.trim();
    return cards.filter((card) => card.tags.includes(normalized));
  }, [cards, tagFilter]);

  const rawMarkdown = useMemo(() => buildMarkdown(cards), [cards]);
  const charCount = rawMarkdown.length;
  const charPercent = Math.min((charCount / MAX_CHARS) * 100, 100);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await window.electron.memory.get();
        if (!mounted) return;

        if (result?.success) {
          const loaded = result.data?.content ?? "";
          const snapshot = parseSnapshot(loaded);
          if (snapshot) {
            const normalized = normalizeCards(snapshot.cards);
            setCards(normalized);
            setSavedContent(serializeSnapshot(normalized));
          } else if (loaded.trim().length > 0) {
            const fallbackCard = createCard({ name: "已有记忆", content: loaded });
            setCards([fallbackCard]);
            setSavedContent(serializeSnapshot([fallbackCard]));
          } else {
            setCards([]);
            setSavedContent(serializeSnapshot([]));
          }
        } else {
          setError(result?.error ?? t("memory.loadFailed", "记忆加载失败"));
          setCards([]);
          setSavedContent(serializeSnapshot([]));
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : t("memory.loadFailed", "记忆加载失败"));
        setCards([]);
        setSavedContent(serializeSnapshot([]));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [t]);

  useEffect(() => {
    if (loading) return;
    const filtered = cards.filter((card) => !isCardEmpty(card));
    const payload = serializeSnapshot(filtered);
    if (payload === savedContent) return;

    setSaving(true);
    const timer = setTimeout(async () => {
      try {
        const result = await window.electron.memory.set(payload);
        if (!result?.success) {
          setError(result?.error ?? t("memory.saveFailed", "记忆保存失败"));
        } else {
          setSavedContent(payload);
          if (filtered.length !== cards.length) {
            setCards(filtered);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("memory.saveFailed", "记忆保存失败"));
      } finally {
        setSaving(false);
      }
    }, AUTO_SAVE_DELAY);

    return () => clearTimeout(timer);
  }, [cards, loading, savedContent, t]);

  const handleAddCard = useCallback(() => {
    setCards((prev) => [...prev, createCard()]);
  }, []);

  const handleRemoveCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
  }, []);

  const handleCardUpdate = useCallback((id: string, next: Partial<MemoryCard>) => {
    setCards((prev) => prev.map((card) => (card.id === id ? { ...card, ...next } : card)));
  }, []);

  const handleCardBlur = useCallback((id: string) => {
    setCards((prev) => {
      const next = prev.filter((card) => {
        if (card.id !== id) return true;
        return !isCardEmpty(card);
      });
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className={cn("flex h-64 items-center justify-center text-sm text-muted", className)}>
        {t("memory.loading", "加载中...")}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-900">
            {t("memory.title", "用户记忆")}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t("memory.pageSubtitle", "把稳定信息写在这里，AI 会在每次对话中自动参考。")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-ink-900/10 bg-surface-secondary p-1">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                viewMode === "cards"
                  ? "bg-accent text-white"
                  : "text-ink-700 hover:bg-ink-900/10"
              )}
            >
              {t("memory.view.cards", "卡片")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                viewMode === "list"
                  ? "bg-accent text-white"
                  : "text-ink-700 hover:bg-ink-900/10"
              )}
            >
              {t("memory.view.list", "列表")}
            </button>
          </div>
          <Button variant="outline" onClick={handleAddCard}>
            {t("memory.addCard", "新增记忆")}
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-ink-900/10 bg-surface-secondary p-4">
        <div className="text-sm font-medium text-ink-900">
          {t("memory.quickGuideTitle", "新手上手：这样写最有效")}
        </div>
        <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
          <div className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2">
            <span className="font-medium text-ink-800">1.</span>{" "}
            {t("memory.quickGuideStep1", "先写长期不变的信息，例如身份、项目背景、常用偏好。")}
          </div>
          <div className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2">
            <span className="font-medium text-ink-800">2.</span>{" "}
            {t("memory.quickGuideStep2", "每条记忆尽量短一点，标题清晰，AI 更容易稳定使用。")}
          </div>
          <div className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2">
            <span className="font-medium text-ink-800">3.</span>{" "}
            {t("memory.quickGuideStep3", "加上标签便于筛选；保存后新对话会自动带入这些信息。")}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-error/30 bg-error/10 px-4 py-2 text-sm text-error">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-ink-900/10">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                charPercent > 90 ? "bg-error" : charPercent > 70 ? "bg-warning" : "bg-success"
              )}
              style={{ width: `${charPercent}%` }}
            />
          </div>
          <span>
            {charCount} / {MAX_CHARS}
          </span>
        </div>
        <div className="text-xs text-muted">
          {saving ? t("memory.autoSaving", "自动保存中...") : t("memory.autoSaved", "已自动保存")}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-ink-900/10 bg-surface-secondary p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs text-muted">{t("memory.filter", "按标签筛选")}</div>
          {allTags.length === 0 && (
            <span className="text-xs text-muted">{t("memory.noTags", "暂无标签")}</span>
          )}
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tag)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                tagFilter === tag
                  ? "bg-accent text-white border-accent"
                  : `${getTagClass(tag)} hover:border-ink-900/40`
              )}
            >
              #{tag}
            </button>
          ))}
          {tagFilter && (
            <button
              type="button"
              onClick={() => setTagFilter("")}
              className="rounded-full border border-ink-900/10 px-3 py-1 text-xs text-muted hover:text-ink-900"
            >
              {t("memory.clearFilter", "清除筛选")}
            </button>
          )}
          <input
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value.trim())}
            className="ml-auto min-w-[160px] rounded-full border border-ink-900/10 bg-surface px-3 py-1 text-xs text-ink-700 outline-none"
            placeholder={t("memory.filterPlaceholder", "输入标签")}
          />
        </div>
      </div>

      {filteredCards.length === 0 ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-900/10 bg-surface-secondary p-10 text-center">
          <div className="text-base font-medium text-ink-900">
            {tagFilter ? t("memory.emptyFiltered", "没有符合该标签的记忆") : t("memory.empty", "还没有任何记忆")}
          </div>
          <div className="mt-2 text-sm text-muted">
            {t("memory.emptyHint", "新增一条记忆，AI 会在对话中使用它")}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={handleAddCard}>{t("memory.addCard", "新增记忆")}</Button>
          </div>
        </div>
      ) : (
        <div className={cn("mt-6 grid gap-4", viewMode === "cards" ? "lg:grid-cols-2" : "grid-cols-1")}>
          {filteredCards.map((card) => (
            <div
              key={card.id}
              className={cn(
                "flex h-full flex-col rounded-2xl border border-ink-900/10 bg-surface-secondary p-4 shadow-sm",
                viewMode === "list" &&
                  "rounded-lg border-ink-900/5 bg-surface p-3 shadow-none lg:flex-row lg:items-start lg:gap-4"
              )}
            >
              <div className={cn("flex-1", viewMode === "list" && "lg:max-w-[220px]")}>
                <label className="text-xs text-muted">{t("memory.cardName", "名称")}</label>
                <input
                  value={card.name}
                  onChange={(event) => handleCardUpdate(card.id, { name: event.target.value })}
                  onBlur={() => handleCardBlur(card.id)}
                  className={cn(
                    "mt-1 w-full rounded-lg border border-ink-900/15 bg-surface px-3 py-2 text-sm font-semibold text-ink-900 outline-none transition",
                    "focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                  )}
                  placeholder={t("memory.cardNamePlaceholder", "给这条记忆起个名字")}
                />
              </div>

              <div className="mt-3 flex flex-1 flex-col">
                <label className="text-xs text-muted">{t("memory.cardContent", "内容")}</label>
                <textarea
                  value={card.content}
                  onChange={(event) => handleCardUpdate(card.id, { content: event.target.value })}
                  onBlur={() => handleCardBlur(card.id)}
                  className={cn(
                    "mt-1 flex-1 resize-none rounded-xl border border-ink-900/10 bg-surface p-3 text-sm text-ink-900 outline-none transition",
                    viewMode === "list" ? "min-h-[72px]" : "min-h-[120px]",
                    "focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                  )}
                  placeholder={t("memory.cardPlaceholder", "这部分内容会给 AI 看")}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {card.tags.map((tag) => (
                    <span
                      key={`${card.id}-${tag}`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                        getTagClass(tag)
                      )}
                    >
                      #{tag}
                      <button
                        type="button"
                        className="text-ink-500 hover:text-error"
                        onClick={() =>
                          handleCardUpdate(card.id, {
                            tags: card.tags.filter((item) => item !== tag),
                          })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className={cn(
                      "min-w-[140px] flex-1 rounded-full border border-ink-900/15 bg-surface px-3 py-1 text-xs text-ink-700 outline-none transition",
                      "placeholder:text-ink-500 focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                    )}
                    placeholder={t("memory.tags", "输入标签，逗号分隔")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const nextTags = normalizeTags((event.target as HTMLInputElement).value);
                        if (nextTags.length > 0) {
                          handleCardUpdate(card.id, { tags: Array.from(new Set([...card.tags, ...nextTags])) });
                          (event.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                    onBlur={(event) => {
                      const nextTags = normalizeTags(event.target.value);
                      if (nextTags.length > 0) {
                        handleCardUpdate(card.id, { tags: Array.from(new Set([...card.tags, ...nextTags])) });
                        event.target.value = "";
                      }
                      handleCardBlur(card.id);
                    }}
                  />
                </div>
              </div>

              <div className={cn("mt-3 flex items-start justify-end", viewMode === "list" && "lg:mt-6")}
              >
                <button
                  type="button"
                  onClick={() => handleRemoveCard(card.id)}
                  className="rounded-full border border-ink-900/10 px-2 py-1 text-xs text-muted transition hover:border-error/50 hover:text-error"
                >
                  {t("memory.remove", "移除")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-xs text-muted">
        {t("memory.hint", "内容会在每次对话开始时注入到系统提示中。")}
      </div>
    </div>
  );
}
