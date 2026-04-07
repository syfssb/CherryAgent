import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/ui/components/ui/dialog";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Badge } from "@/ui/components/ui/badge";
import { ScrollArea } from "@/ui/components/ui/scroll-area";
import { useSessionStore, type Tag } from "@/ui/store/useSessionStore";

/**
 * 预设颜色列表
 */
const PRESET_COLORS = [
  "#EF4444", // red
  "#F97316", // orange
  "#F59E0B", // amber
  "#EAB308", // yellow
  "#84CC16", // lime
  "#22C55E", // green
  "#10B981", // emerald
  "#14B8A6", // teal
  "#06B6D4", // cyan
  "#0EA5E9", // sky
  "#3B82F6", // blue
  "#6366F1", // indigo
  "#8B5CF6", // violet
  "#A855F7", // purple
  "#D946EF", // fuchsia
  "#EC4899", // pink
  "#F43F5E", // rose
  "#64748B"  // slate
];

interface TagManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 标签管理组件
 * 支持创建、编辑、删除标签
 */
export function TagManager({ open, onOpenChange }: TagManagerProps) {
  const { t } = useTranslation();
  const tags = useSessionStore((s) => s.tags);
  const createTag = useSessionStore((s) => s.createTag);
  const updateTag = useSessionStore((s) => s.updateTag);
  const deleteTag = useSessionStore((s) => s.deleteTag);

  // 编辑状态
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // 表单状态
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  // 删除确认
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

  // 加载状态
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 重置表单
  const resetForm = useCallback(() => {
    setName("");
    setColor(PRESET_COLORS[0]);
    setEditingTag(null);
    setIsCreating(false);
    setError(null);
  }, []);

  // 开始创建
  const startCreating = useCallback(() => {
    resetForm();
    setIsCreating(true);
  }, [resetForm]);

  // 开始编辑
  const startEditing = useCallback((tag: Tag) => {
    setName(tag.name);
    setColor(tag.color);
    setEditingTag(tag);
    setIsCreating(false);
    setError(null);
  }, []);

  // 取消编辑/创建
  const cancelEdit = useCallback(() => {
    resetForm();
  }, [resetForm]);

  // 提交表单
  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setError(t("tagManager.errors.nameRequired", "标签名称不能为空"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingTag) {
        // 更新标签
        const result = await updateTag(editingTag.id, { name: name.trim(), color });
        if (!result) {
          setError(
            t(
              "tagManager.errors.updateConflict",
              "更新标签失败，标签名称可能已存在"
            )
          );
          return;
        }
      } else {
        // 创建标签
        const result = await createTag(name.trim(), color);
        if (!result) {
          setError(
            t(
              "tagManager.errors.createConflict",
              "创建标签失败，标签名称可能已存在"
            )
          );
          return;
        }
      }
      resetForm();
    } catch {
      setError(
        editingTag
          ? t("tagManager.errors.updateFailed", "更新标签失败")
          : t("tagManager.errors.createFailed", "创建标签失败")
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [name, color, editingTag, updateTag, createTag, resetForm, t]);

  // 确认删除
  const confirmDelete = useCallback(async () => {
    if (!tagToDelete) return;

    setIsSubmitting(true);
    try {
      await deleteTag(tagToDelete.id);
      setTagToDelete(null);
    } catch {
      setError(t("tagManager.errors.deleteFailed", "删除标签失败"));
    } finally {
      setIsSubmitting(false);
    }
  }, [tagToDelete, deleteTag, t]);

  // 关闭对话框时重置
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetForm();
        setTagToDelete(null);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetForm]
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tagManager.title", "标签管理")}</DialogTitle>
            <DialogDescription>
              {t("tagManager.description", "创建和管理会话标签")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 标签列表 */}
            <ScrollArea className="h-[200px] rounded-lg border border-ink-400/20 p-2">
              {tags.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted">
                  {t("tagManager.empty", "暂无标签，点击下方按钮创建")}
                </div>
              ) : (
                <div className="space-y-2">
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between rounded-lg p-2 hover:bg-surface-secondary"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm font-medium text-ink-900">{tag.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {t("tagManager.usageCount", "{{count}} 个会话", {
                            count: tag.usageCount ?? 0,
                          })}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="rounded p-1 text-ink-500 hover:bg-ink-900/10 hover:text-ink-700"
                          onClick={() => startEditing(tag)}
                          aria-label={t("tagManager.editTag", "编辑标签")}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className="rounded p-1 text-ink-500 hover:bg-error/10 hover:text-error"
                          onClick={() => setTagToDelete(tag)}
                          aria-label={t("tagManager.deleteTag", "删除标签")}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path d="M3 6h18" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* 创建/编辑表单 */}
            {(isCreating || editingTag) && (
              <div className="space-y-3 rounded-lg border border-ink-400/20 p-3">
                <div className="text-sm font-medium text-ink-900">
                  {editingTag
                    ? t("tagManager.editTitle", "编辑标签")
                    : t("tagManager.createTitle", "创建新标签")}
                </div>

                {/* 名称输入 */}
                <div>
                  <label className="mb-1.5 block text-xs text-muted">
                    {t("tagManager.nameLabel", "标签名称")}
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("tagManager.namePlaceholder", "输入标签名称")}
                    className="h-9"
                    maxLength={20}
                  />
                </div>

                {/* 颜色选择 */}
                <div>
                  <label className="mb-1.5 block text-xs text-muted">
                    {t("tagManager.colorLabel", "选择颜色")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((presetColor) => (
                      <button
                        key={presetColor}
                        className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                          color === presetColor ? "ring-2 ring-accent ring-offset-2" : ""
                        }`}
                        style={{ backgroundColor: presetColor }}
                        onClick={() => setColor(presetColor)}
                        aria-label={t("tagManager.selectColor", "选择颜色 {{color}}", {
                          color: presetColor,
                        })}
                      />
                    ))}
                  </div>
                </div>

                {/* 错误提示 */}
                {error && <div className="text-xs text-error">{error}</div>}

                {/* 操作按钮 */}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={cancelEdit}>
                    {t("common.cancel", "取消")}
                  </Button>
                  <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting
                      ? t("common.saving", "保存中...")
                      : t("common.save", "保存")}
                  </Button>
                </div>
              </div>
            )}

            {/* 创建按钮 */}
            {!isCreating && !editingTag && (
              <Button variant="outline" className="w-full" onClick={startCreating}>
                <svg
                  viewBox="0 0 24 24"
                  className="mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t("tagManager.createButton", "创建新标签")}
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t("common.close", "关闭")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={!!tagToDelete} onOpenChange={(open) => !open && setTagToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("tagManager.deleteTitle", "确认删除")}</DialogTitle>
            <DialogDescription>
              {t("tagManager.deleteDescription", "确定要删除标签 \"{{name}}\" 吗？此操作无法撤销。", {
                name: tagToDelete?.name ?? "",
              })}
              {(tagToDelete?.usageCount ?? 0) > 0 && (
                <span className="mt-2 block text-warning">
                  {t(
                    "tagManager.deleteInUse",
                    "该标签已被 {{count}} 个会话使用，删除后将从这些会话中移除。",
                    { count: tagToDelete?.usageCount ?? 0 }
                  )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagToDelete(null)}>
              {t("common.cancel", "取消")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isSubmitting}>
              {isSubmitting
                ? t("common.deleting", "删除中...")
                : t("common.delete", "删除")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
