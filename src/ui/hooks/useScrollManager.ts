import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SCROLL_THRESHOLD, clampScrollTop, scrollContainerToBottom, isNearBottom } from "../utils/scroll";

export interface ScrollManagerRefs {
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  contentRootRef: React.RefObject<HTMLDivElement | null>;
  shouldAutoScrollRef: React.MutableRefObject<boolean>;
}

export interface ScrollManagerState {
  shouldAutoScroll: boolean;
  hasNewMessages: boolean;
  scrollToBottom: () => void;
  handleScroll: () => void;
  resetScrollState: () => void;
  setHasNewMessages: (value: boolean) => void;
}

export function useScrollManager(
  activeSessionId: string | null,
  messagesLength: number,
  partialMessage: string,
  resetToLatest: () => void,
  hasMoreHistory: boolean,
  isLoadingHistory: boolean,
  loadMoreMessages: () => void,
  visibleMessages: unknown[],
  isStreaming = false
): ScrollManagerState & ScrollManagerRefs {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const contentRootRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(messagesLength > 0);
  const prevMessagesLengthRef = useRef(0);
  const scrollHeightBeforeLoadRef = useRef(0);
  const scrollTopBeforeLoadRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);
  const prevSessionIdRef = useRef<string | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior>("auto");
  /**
   * 用户显式向上滚动锁定：一旦用户离开底部，在明确回到底部前禁止所有自动滚动。
   * 比 shouldAutoScrollRef 更强 — 即使 messagesLength 变化、ResizeObserver 触发、
   * foreground realign 等都不会把用户拉回底部。
   * 只在以下情况重置：用户手动滚回底部、点击"新消息"按钮、切换会话。
   */
  const userScrollLockedRef = useRef(false);
  /** 跟踪当前是否为空消息状态（欢迎页），供 ResizeObserver 读取 */
  const isEmptySessionRef = useRef(messagesLength === 0);

  const [shouldAutoScroll, setShouldAutoScroll] = useState(messagesLength > 0);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  /** 安全的 scrollToBottom：尊重用户滚动锁定 */
  const guardedScrollToBottom = useCallback(
    (behavior: ScrollBehavior, force = false) => {
      // 用户锁定时拒绝自动滚动（force=true 仅用于用户主动触发）
      if (userScrollLockedRef.current && !force) return;

      pendingScrollBehaviorRef.current = behavior;

      if (scrollRafRef.current !== null) {
        if (!force) return;
        cancelAnimationFrame(scrollRafRef.current);
      }

      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const container = scrollContainerRef.current;
        if (!container) return;
        scrollContainerToBottom(container, pendingScrollBehaviorRef.current);
      });
    },
    []
  );

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  /** 用户主动点击"滚到底部" / "新消息"按钮 */
  const scrollToBottom = useCallback(() => {
    userScrollLockedRef.current = false;
    shouldAutoScrollRef.current = true;
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    resetToLatest();
    guardedScrollToBottom("smooth", true);
  }, [resetToLatest, guardedScrollToBottom]);

  /** 滚动事件处理：检测用户是否在底部 */
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const atBottom = isNearBottom(container, SCROLL_THRESHOLD);

    if (atBottom) {
      // 用户回到底部 → 解锁
      userScrollLockedRef.current = false;
      shouldAutoScrollRef.current = true;
      setShouldAutoScroll(true);
      setHasNewMessages(false);
    } else {
      // 用户离开底部 → 锁定，直到回到底部
      userScrollLockedRef.current = true;
      shouldAutoScrollRef.current = false;
      setShouldAutoScroll(false);
    }
  }, []);

  const resetScrollState = useCallback(() => {
    setHasNewMessages(false);
    prevMessagesLengthRef.current = 0;
    shouldRestoreScrollRef.current = false;
    scrollHeightBeforeLoadRef.current = 0;
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      if (!activeSessionId || messagesLength === 0) {
        userScrollLockedRef.current = false;
        shouldAutoScrollRef.current = false;
        setShouldAutoScroll(false);
        container.scrollTo({ top: 0, behavior: "auto" });
        return;
      }
      // 切换会话时解锁并滚到底部
      userScrollLockedRef.current = false;
      shouldAutoScrollRef.current = true;
      setShouldAutoScroll(true);
      scrollContainerToBottom(container, "auto");
    });
  }, [activeSessionId, messagesLength]);

  // 会话切换：重置状态并滚到底部
  useEffect(() => {
    if (!activeSessionId) return;
    if (prevSessionIdRef.current !== activeSessionId) {
      prevSessionIdRef.current = activeSessionId;
      userScrollLockedRef.current = false;
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        if (messagesLength === 0) {
          shouldAutoScrollRef.current = false;
          setShouldAutoScroll(false);
          container.scrollTo({ top: 0, behavior: "auto" });
        } else {
          shouldAutoScrollRef.current = true;
          setShouldAutoScroll(true);
          guardedScrollToBottom("auto", true);
        }
      });
    }
  }, [activeSessionId, messagesLength, guardedScrollToBottom]);

  // IntersectionObserver：顶部哨兵可见时加载更多历史
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMoreHistory && !isLoadingHistory) {
          scrollHeightBeforeLoadRef.current = container.scrollHeight;
          scrollTopBeforeLoadRef.current = container.scrollTop;
          shouldRestoreScrollRef.current = true;
          // 用户正在向上查看历史，确保锁定
          userScrollLockedRef.current = true;
          shouldAutoScrollRef.current = false;
          setShouldAutoScroll(false);
          loadMoreMessages();
        }
      },
      {
        root: container,
        rootMargin: "400px 0px 0px 0px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreHistory, isLoadingHistory, loadMoreMessages]);

  // 滚动位置恢复：prepend 旧消息后保持视觉位置不变。
  // 使用 useLayoutEffect 在浏览器绘制前同步执行。
  // 关键：直接 SET scrollTop = scrollTopBefore + scrollDiff，而非 ADD。
  // 这样无论 overflow-anchor 是否生效（浏览器是否自动调整了 scrollTop），结果都正确。
  useLayoutEffect(() => {
    if (shouldRestoreScrollRef.current) {
      const container = scrollContainerRef.current;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        const scrollDiff = newScrollHeight - scrollHeightBeforeLoadRef.current;
        // 用记录的 scrollTop + 新增内容高度，直接设置目标位置
        container.scrollTop = scrollTopBeforeLoadRef.current + scrollDiff;
      }
      shouldRestoreScrollRef.current = false;
    }
  }, [visibleMessages]);

  // 会话切换重置：仅在 activeSessionId 真正变化时执行
  // 注意：不能依赖 resetScrollState（它包含 messagesLength），否则服务端分页
  // 返回新消息导致 messagesLength 变化时，也会误触发 → 解锁滚动 → 拉回底部。
  const prevSessionForResetRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSessionForResetRef.current !== activeSessionId) {
      prevSessionForResetRef.current = activeSessionId;
      resetScrollState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅跟踪 activeSessionId
  }, [activeSessionId]);

  // messagesLength 变化：新消息到达时的滚动控制
  useEffect(() => {
    isEmptySessionRef.current = messagesLength === 0;
    // 从欢迎页面发出第一条消息时，解锁并启用自动滚动
    if (messagesLength > 0 && prevMessagesLengthRef.current === 0) {
      userScrollLockedRef.current = false;
      shouldAutoScrollRef.current = true;
      setShouldAutoScroll(true);
    }
    // 欢迎页（无消息）不需要自动滚到底部，由 resetScrollState 处理 scrollTo(0)
    if (messagesLength === 0) {
      prevMessagesLengthRef.current = messagesLength;
      return;
    }
    // 只在用户未锁定时自动滚到底部
    if (shouldAutoScrollRef.current && !userScrollLockedRef.current) {
      guardedScrollToBottom("auto");
    } else if (
      messagesLength > prevMessagesLengthRef.current &&
      prevMessagesLengthRef.current > 0
    ) {
      setHasNewMessages(true);
    }
    prevMessagesLengthRef.current = messagesLength;
  }, [messagesLength, partialMessage, isStreaming, guardedScrollToBottom]);

  // ResizeObserver：监听内容区域高度变化（代码块渲染、图片加载等）
  useEffect(() => {
    const contentRoot = contentRootRef.current;
    const container = scrollContainerRef.current;
    if (!contentRoot || !container) return;

    const observer = new ResizeObserver(() => {
      if (resizeRafRef.current !== null) return;
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        // 欢迎页（无消息）不自动滚到底部
        if (isEmptySessionRef.current) return;
        // 尊重用户滚动锁定
        if (shouldAutoScrollRef.current && !userScrollLockedRef.current) {
          scrollContainerToBottom(container, "auto");
        } else {
          clampScrollTop(container);
        }
      });
    });

    observer.observe(contentRoot);

    return () => {
      observer.disconnect();
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };
  }, [activeSessionId]);

  return {
    messagesEndRef,
    scrollContainerRef,
    topSentinelRef,
    contentRootRef,
    shouldAutoScrollRef,
    shouldAutoScroll,
    hasNewMessages,
    scrollToBottom,
    handleScroll,
    resetScrollState,
    setHasNewMessages,
  };
}
