/**
 * useAutoTitle Hook
 * 管理会话标题的自动生成和更新状态
 */
import { useCallback } from "react";
import { useAppStore } from "../store/useAppStore";

export type TitleState = {
  /** 当前标题 */
  title: string;
  /** 是否正在生成标题 */
  isGenerating: boolean;
};

/**
 * 使用自动标题功能
 * @param sessionId - 会话 ID
 * @returns 标题状态和操作方法
 */
export function useAutoTitle(sessionId: string | null) {
  const sessions = useAppStore((s) => s.sessions);
  const titleStates = useAppStore((s) => s.titleStates);

  // 获取当前会话的标题状态
  const session = sessionId ? sessions[sessionId] : undefined;
  const titleState = sessionId ? titleStates[sessionId] : undefined;

  const currentTitle = session?.title ?? "";
  const isGenerating = titleState?.isGenerating ?? false;

  /**
   * 手动触发标题生成
   */
  const generateTitle = useCallback(async () => {
    if (!sessionId) return;

    try {
      await window.electron.session.generateTitle(sessionId);
    } catch (error) {
      console.error("[useAutoTitle] Failed to generate title:", error);
    }
  }, [sessionId]);

  /**
   * 手动更新标题
   */
  const updateTitle = useCallback(async (newTitle: string) => {
    if (!sessionId) return;

    try {
      await window.electron.session.updateTitle(sessionId, newTitle);
    } catch (error) {
      console.error("[useAutoTitle] Failed to update title:", error);
    }
  }, [sessionId]);

  return {
    title: currentTitle,
    isGenerating,
    generateTitle,
    updateTitle,
  };
}

/**
 * 显示标题（带加载状态）
 */
export function getTitleDisplay(title: string, isGenerating: boolean): string {
  if (isGenerating) {
    return "正在生成标题...";
  }
  return title || "新对话";
}
