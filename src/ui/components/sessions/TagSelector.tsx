import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/ui/components/ui/dropdown-menu";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Badge } from "@/ui/components/ui/badge";
import { useSessionStore, type Tag } from "@/ui/store/useSessionStore";

/**
 * 预设颜色列表（用于快速创建）
 */
const QUICK_COLORS = [
  "#3B82F6", // blue
  "#22C55E", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899"  // pink
];

interface TagSelectorProps {
  /** 会话 ID */
  sessionId: string;
  /** 当前会话的标签列表 */
  sessionTags?: Tag[];
  /** 触发器按钮样式类 */
  triggerClassName?: string;
  /** 是否显示紧凑模式（不显示标签文字） */
  compact?: boolean;
}

/**
 * 标签选择器组件
 * 支持为会话添加/移除标签，以及快速创建新标签
 */
export function TagSelector({
  sessionId,
  sessionTags = [],
  triggerClassName,
  compact = false
}: TagSelectorProps) {
  const { t } = useTranslation();
  const tags = useSessionStore((s) => s.tags);
  const createTag = useSessionStore((s) => s.createTag);
  const addTagToSession = useSessionStore((s) => s.addTagToSession);
  const removeTagFromSession = useSessionStore((s) => s.removeTagFromSession);

  // 快速创建状态
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(QUICK_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 当前会话的标签 ID 集合
  const sessionTagIds = useMemo(() => new Set(sessionTags.map((t) => t.id)), [sessionTags]);

  // 切换标签
  const toggleTag = useCallback(
    async (tagId: string) => {
      if (sessionTagIds.has(tagId)) {
        await removeTagFromSession(sessionId, tagId);
      } else {
        await addTagToSession(sessionId, tagId);
      }
    },
    [sessionId, sessionTagIds, addTagToSession, removeTagFromSession]
  );

  // 快速创建并添加标签
  const handleQuickCreate = useCallback(async () => {
    if (!newTagName.trim()) return;

    setIsSubmitting(true);
    try {
      const tag = await createTag(newTagName.trim(), selectedColor);
      if (tag) {
        // 自动将新标签添加到当前会话
        await addTagToSession(sessionId, tag.id);
        setNewTagName("");
        setIsCreating(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [newTagName, selectedColor, createTag, addTagToSession, sessionId]);

  // 取消创建
  const cancelCreate = useCallback(() => {
    setNewTagName("");
    setIsCreating(false);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={
            triggerClassName ||
            "flex items-center gap-1 rounded p-1 text-ink-500 hover:bg-ink-900/10 hover:text-ink-700"
          }
          aria-label={t("tagSelector.manageTags", "管理标签")}
        >
          {/* 标签图标 */}
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          {!compact && sessionTags.length > 0 && (
            <span className="text-xs">{sessionTags.length}</span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{t("tagSelector.selectTags", "选择标签")}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* 标签列表 */}
        {tags.length === 0 ? (
          <div className="px-2 py-3 text-center text-sm text-muted">
            {t("tagSelector.empty", "暂无标签")}
          </div>
        ) : (
          tags.map((tag) => (
            <DropdownMenuCheckboxItem
              key={tag.id}
              checked={sessionTagIds.has(tag.id)}
              onCheckedChange={() => toggleTag(tag.id)}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span>{tag.name}</span>
              </div>
            </DropdownMenuCheckboxItem>
          ))
        )}

        <DropdownMenuSeparator />

        {/* 快速创建 */}
        {isCreating ? (
          <div className="p-2 space-y-2">
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder={t("tagSelector.namePlaceholder", "标签名称")}
              className="h-8 text-sm"
              maxLength={20}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleQuickCreate();
                } else if (e.key === "Escape") {
                  cancelCreate();
                }
              }}
            />
            <div className="flex items-center gap-1">
              {QUICK_COLORS.map((color) => (
                <button
                  key={color}
                  className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${
                    selectedColor === color ? "ring-2 ring-accent ring-offset-1" : ""
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={cancelCreate} className="h-7 px-2">
                {t("common.cancel", "取消")}
              </Button>
              <Button
                size="sm"
                onClick={handleQuickCreate}
                disabled={!newTagName.trim() || isSubmitting}
                className="h-7 px-2"
              >
                {isSubmitting ? t("common.creating", "创建中...") : t("common.create", "创建")}
              </Button>
            </div>
          </div>
        ) : (
          <button
            className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-ink-700 hover:bg-surface-secondary"
            onClick={() => setIsCreating(true)}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t("tagSelector.createNew", "创建新标签")}
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 标签徽章组件
 * 用于在会话列表中显示标签
 */
interface TagBadgesProps {
  tags: Tag[];
  maxDisplay?: number;
  size?: "sm" | "default";
}

export function TagBadges({ tags, maxDisplay = 3, size = "sm" }: TagBadgesProps) {
  if (tags.length === 0) return null;

  const displayTags = tags.slice(0, maxDisplay);
  const remainingCount = tags.length - maxDisplay;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {displayTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className={`${size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"}`}
          style={{
            borderColor: tag.color,
            color: tag.color,
            backgroundColor: `${tag.color}10`
          }}
        >
          {tag.name}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge
          variant="secondary"
          className={`${size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"}`}
        >
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}
