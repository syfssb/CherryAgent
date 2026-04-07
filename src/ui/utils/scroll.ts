/** 滚动判定阈值（px） */
export const SCROLL_THRESHOLD = 50;

/**
 * 将 scrollTop 钳位到合法范围 [0, scrollHeight - clientHeight]
 * 防止 scrollTop 超出范围导致空白区域
 */
export function clampScrollTop(container: HTMLElement): void {
  const maxScrollTop = container.scrollHeight - container.clientHeight;
  if (maxScrollTop <= 0) return;
  if (container.scrollTop > maxScrollTop) {
    container.scrollTop = maxScrollTop;
  }
}

/**
 * 直接使用 scrollTo 滚动到底部，比 scrollIntoView 更可控
 * scrollIntoView 在 Radix ScrollArea 内嵌套时行为不可预测
 */
export function scrollContainerToBottom(container: HTMLElement, behavior: ScrollBehavior = "auto"): void {
  const maxScrollTop = container.scrollHeight - container.clientHeight;
  if (maxScrollTop <= 0) return;
  container.scrollTo({ top: maxScrollTop, behavior });
}

/**
 * 判断容器是否接近底部
 */
export function isNearBottom(container: HTMLElement, threshold = SCROLL_THRESHOLD): boolean {
  const { scrollTop, scrollHeight, clientHeight } = container;
  return scrollTop + clientHeight >= scrollHeight - threshold;
}
