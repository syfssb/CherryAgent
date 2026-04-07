/**
 * SessionSummary — Sidebar 专用的轻量会话摘要类型
 *
 * 设计目的：将 Sidebar 的 Zustand 订阅与 messages/observableEvents 等
 * 高频变化的大字段脱钩，避免每条 stream message 触发 Sidebar 重渲染。
 *
 * 配合 shallowEqualSessionSummaries 做自定义 equality 比较，
 * 只在摘要字段实际变化时才触发组件更新。
 */

/** Sidebar 只需要的会话摘要字段 */
export type SessionSummary = {
  id: string;
  title: string;
  status: string;
  cwd?: string;
  createdAt?: number;
  updatedAt?: number;
  isPinned?: boolean;
  isArchived?: boolean;
  tags?: Array<{ id: string; name: string; color: string; createdAt: number }>;
  hasUnreadCompletion?: boolean;
};

/**
 * 浅比较两个 SessionSummary Record，忽略 messages/observableEvents 等大字段。
 *
 * 对 tags 使用引用比较（tags 数组通常整体替换，不会 in-place 修改），
 * 其余标量字段逐一 === 比较。
 */
export function shallowEqualSessionSummaries(
  a: Record<string, SessionSummary>,
  b: Record<string, SessionSummary>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    const sa = a[key];
    const sb = b[key];
    if (!sb) return false;
    if (
      sa.id !== sb.id ||
      sa.title !== sb.title ||
      sa.status !== sb.status ||
      sa.cwd !== sb.cwd ||
      sa.createdAt !== sb.createdAt ||
      sa.updatedAt !== sb.updatedAt ||
      sa.isPinned !== sb.isPinned ||
      sa.isArchived !== sb.isArchived ||
      sa.tags !== sb.tags ||
      sa.hasUnreadCompletion !== sb.hasUnreadCompletion
    ) {
      return false;
    }
  }
  return true;
}
