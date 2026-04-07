import type React from "react";
import { clampScrollTop, scrollContainerToBottom } from "./scroll";

export interface ForegroundRealignTarget {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  shouldAutoScrollRef: React.MutableRefObject<boolean>;
  handleScroll: () => void;
}

export function realignChatViewportForForeground(target: ForegroundRealignTarget): void {
  const container = target.scrollContainerRef.current;
  if (!container) return;

  // 读布局触发一次重排，修复 Electron 前后台切换偶发空白
  container.getBoundingClientRect();

  // 钳位 scrollTop：前后台切换后可能超出合法范围
  clampScrollTop(container);

  target.handleScroll();

  if (target.shouldAutoScrollRef.current) {
    scrollContainerToBottom(container, "auto");
  }
}
