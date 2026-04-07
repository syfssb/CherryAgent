import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ServerEvent, SessionStatus } from "../types";
import { useAppStore } from "../store/useAppStore";
import { useAuthStore } from "../store/useAuthStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { normalizeChatErrorText } from "../lib/chat-error";
import { scrollContainerToBottom } from "../utils/scroll";

export interface SessionEventsState {
  partialMessage: string;
  showPartialMessage: boolean;
  showRechargeModal: boolean;
  showLoginModal: boolean;
  setShowRechargeModal: (show: boolean) => void;
  setShowLoginModal: (show: boolean) => void;
  handleLoginRequired: () => void;
  onEvent: (event: ServerEvent) => void;
  onBatchEvent: (events: ServerEvent[]) => void;
}

function isInsufficientBalanceErrorText(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    message.includes("积分不足") ||
    message.includes("余额不足") ||
    message.includes("RATE_4002") ||
    normalized.includes("insufficient balance") ||
    normalized.includes("insufficient_balance") ||
    normalized.includes("api error: 402")
  );
}

/**
 * rAF 节流：使用 requestAnimationFrame 限制 partial message 更新频率
 * 确保最终状态不丢失
 */
function useRafThrottle<T>(setter: (value: T) => void): (value: T) => void {
  const pendingRef = useRef<T | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return useCallback((value: T) => {
    pendingRef.current = value;
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (pendingRef.current !== null) {
          setter(pendingRef.current);
          pendingRef.current = null;
        }
      });
    }
  }, [setter]);
}

/**
 * 间隔节流：以固定间隔限制更新频率，确保最终状态不丢失
 */
function useIntervalThrottle(intervalMs: number): {
  shouldProcess: (key: string) => boolean;
  flushFinal: (key: string, callback: () => void) => void;
} {
  const lastProcessedRef = useRef(new Map<string, number>());
  const pendingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    return () => {
      for (const timer of pendingTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const shouldProcess = useCallback((key: string): boolean => {
    const now = Date.now();
    const lastProcessed = lastProcessedRef.current.get(key) ?? 0;
    if (now - lastProcessed >= intervalMs) {
      lastProcessedRef.current.set(key, now);
      return true;
    }
    return false;
  }, [intervalMs]);

  const flushFinal = useCallback((key: string, callback: () => void) => {
    // 清除之前的延迟刷新
    const existingTimer = pendingTimersRef.current.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    // 设置新的延迟刷新，确保最终状态被处理
    const timer = setTimeout(() => {
      pendingTimersRef.current.delete(key);
      callback();
    }, intervalMs);
    pendingTimersRef.current.set(key, timer);
  }, [intervalMs]);

  return { shouldProcess, flushFinal };
}

export function useSessionEvents(
  shouldAutoScrollRef: React.MutableRefObject<boolean>,
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  setHasNewMessages: (value: boolean) => void,
  onPartialMessageChange?: (value: string) => void
): SessionEventsState {
  const { t } = useTranslation();
  const partialMessagesRef = useRef(new Map<string, string>());
  const partialVisibilityRef = useRef(new Map<string, boolean>());
  const clearPartialTimerRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastStatusRef = useRef(new Map<string, SessionStatus>());
  /** 按 session 跟踪当前流式 content_block 是否为 thinking 类型 */
  const isThinkingBlockRef = useRef(new Map<string, boolean>());

  const [partialMessage, setPartialMessage] = useState("");
  const [showPartialMessage, setShowPartialMessage] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const autoScrollRafRef = useRef<number | null>(null);

  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const handleServerEvent = useAppStore((s) => s.handleServerEvent);
  const handleServerEventBatch = useAppStore((s) => s.handleServerEventBatch);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const notifications = useSettingsStore((s) => s.notifications);

  // rAF 节流：partial message 更新
  const throttledSetPartialMessage = useRafThrottle((value: string) => {
    setPartialMessage(value);
    onPartialMessageChange?.(value);
  });

  // 500ms 间隔节流：tool_progress 更新
  const toolProgressThrottle = useIntervalThrottle(500);

  const syncActivePartialState = useCallback((sessionId: string | null) => {
    const nextPartial = sessionId ? (partialMessagesRef.current.get(sessionId) ?? "") : "";
    const nextVisible = sessionId ? (partialVisibilityRef.current.get(sessionId) ?? false) : false;
    setPartialMessage(nextPartial);
    onPartialMessageChange?.(nextPartial);
    setShowPartialMessage(nextVisible);
  }, [onPartialMessageChange]);

  const getPartialMessageContent = (eventMessage: any) => {
    try {
      const realType = eventMessage.delta.type.split("_")[0];
      return eventMessage.delta[realType];
    } catch {
      return "";
    }
  };

  const scheduleAutoScrollToBottom = useCallback(
    (force = false) => {
      if (autoScrollRafRef.current !== null) {
        if (!force) return;
        cancelAnimationFrame(autoScrollRafRef.current);
      }

      autoScrollRafRef.current = requestAnimationFrame(() => {
        autoScrollRafRef.current = null;
        if (!shouldAutoScrollRef.current) return;
        const container = scrollContainerRef.current;
        if (container) {
          scrollContainerToBottom(container, "auto");
        }
      });
    },
    [scrollContainerRef, shouldAutoScrollRef]
  );

  useEffect(() => {
    return () => {
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
      }
      for (const timer of clearPartialTimerRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    syncActivePartialState(activeSessionId);
  }, [activeSessionId, syncActivePartialState]);

  const handlePartialMessages = useCallback((partialEvent: ServerEvent) => {
    if (partialEvent.type !== "stream.message" || partialEvent.payload.message.type !== "stream_event") return;

    const sessionId = partialEvent.payload.sessionId;
    const isActiveSession = sessionId === useAppStore.getState().activeSessionId;
    const message = partialEvent.payload.message as any;
    if (message.event.type === "content_block_start") {
      const existingTimer = clearPartialTimerRef.current.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        clearPartialTimerRef.current.delete(sessionId);
      }

      // 判断当前 block 是否为 thinking 类型
      const blockType = message.event.content_block?.type;
      const isThinking = blockType === "thinking";
      isThinkingBlockRef.current.set(sessionId, isThinking);

      // thinking block 由 ThinkingBlock 组件渲染，不走 partialMessage
      if (isThinking) {
        return;
      }

      partialMessagesRef.current.set(sessionId, "");
      partialVisibilityRef.current.set(sessionId, true);
      // content_block_start 不节流，立即更新
      if (isActiveSession) {
        setPartialMessage("");
        onPartialMessageChange?.("");
        setShowPartialMessage(true);
      }
    }

    if (message.event.type === "content_block_delta") {
      const deltaType = message.event.delta?.type;
      // thinking_delta / signature_delta 由 ThinkingBlock 渲染，跳过 partialMessage
      if (deltaType === "thinking_delta" || deltaType === "signature_delta") {
        // 仍需滚动
        if (isActiveSession && shouldAutoScrollRef.current) {
          scheduleAutoScrollToBottom();
        }
        return;
      }

      const nextPartial = `${partialMessagesRef.current.get(sessionId) ?? ""}${getPartialMessageContent(message.event) || ""}`;
      partialMessagesRef.current.set(sessionId, nextPartial);
      // 使用 rAF 节流更新 partial message
      if (isActiveSession) {
        throttledSetPartialMessage(nextPartial);
      }
      if (isActiveSession && shouldAutoScrollRef.current) {
        // 流式阶段只做即时滚动，避免频繁 smooth 动画叠加导致抖动
        scheduleAutoScrollToBottom();
      } else if (isActiveSession) {
        setHasNewMessages(true);
      }
    }

    if (message.event.type === "content_block_stop") {
      // thinking block 结束时不影响 partialMessage
      if (isThinkingBlockRef.current.get(sessionId)) {
        isThinkingBlockRef.current.set(sessionId, false);
        return;
      }

      // 对最终 partial message 做错误规范化，避免错误原文（如 "API Error: 502"）直接渲染给用户
      const rawPartial = partialMessagesRef.current.get(sessionId) ?? "";
      if (rawPartial) {
        const { text: normalizedText } = normalizeChatErrorText(rawPartial);
        if (normalizedText !== rawPartial) {
          partialMessagesRef.current.set(sessionId, normalizedText);
        }
      }

      partialVisibilityRef.current.set(sessionId, false);
      // content_block_stop 时确保最终内容被刷新（不节流）
      if (isActiveSession) {
        const finalPartial = partialMessagesRef.current.get(sessionId) ?? "";
        setShowPartialMessage(false);
        setPartialMessage(finalPartial);
        onPartialMessageChange?.(finalPartial);
      }
      if (isActiveSession && shouldAutoScrollRef.current) {
        scheduleAutoScrollToBottom(true);
      }
      const clearTimer = setTimeout(() => {
        partialMessagesRef.current.set(sessionId, "");
        if (sessionId === useAppStore.getState().activeSessionId) {
          setPartialMessage("");
          onPartialMessageChange?.("");
        }
        clearPartialTimerRef.current.delete(sessionId);
      }, 500);
      clearPartialTimerRef.current.set(sessionId, clearTimer);
    }
  }, [
    onPartialMessageChange,
    scheduleAutoScrollToBottom,
    setHasNewMessages,
    shouldAutoScrollRef,
    throttledSetPartialMessage,
  ]);

  const onEvent = useCallback((event: ServerEvent) => {
    const sessions = useAppStore.getState().sessions;

    // tool_progress 事件使用 500ms 间隔节流
    if (event.type === "stream.message") {
      const msgType = (event.payload.message as any)?.type;
      if (msgType === "tool_progress") {
        const toolUseId = (event.payload.message as any)?.tool_use_id ?? "default";
        if (toolProgressThrottle.shouldProcess(toolUseId)) {
          handleServerEvent(event);
        } else {
          // 确保最终状态不丢失：延迟刷新
          toolProgressThrottle.flushFinal(toolUseId, () => {
            handleServerEvent(event);
          });
        }
        return;
      }
    }

    if (event.type === "session.status") {
      const prevStatus = lastStatusRef.current.get(event.payload.sessionId);
      lastStatusRef.current.set(event.payload.sessionId, event.payload.status);

      // 会话从 running 变为任何非 running 状态时，清理流式预览
      if (prevStatus === "running" && event.payload.status !== "running") {
        const sessionId = event.payload.sessionId;
        partialMessagesRef.current.set(sessionId, "");
        partialVisibilityRef.current.set(sessionId, false);
        const clearTimer = clearPartialTimerRef.current.get(sessionId);
        if (clearTimer) {
          clearTimeout(clearTimer);
          clearPartialTimerRef.current.delete(sessionId);
        }
        if (sessionId === useAppStore.getState().activeSessionId) {
          setPartialMessage("");
          onPartialMessageChange?.("");
          setShowPartialMessage(false);
        }
      }

      if (
        prevStatus === "running" &&
        event.payload.status === "completed" &&
        notifications.enabled &&
        notifications.desktopNotifications &&
        window.electron?.notifications?.show
      ) {
        const sessionTitle =
          event.payload.title ||
          sessions[event.payload.sessionId]?.title ||
          t("notifications.untitledSession", "未命名会话");
        window.electron.notifications.show({
          title: t("notifications.sessionCompletedTitle", "会话已完成"),
          body: t("notifications.sessionCompletedBody", "\"{{title}}\" 已生成回复", {
            title: sessionTitle
          }),
          silent: !notifications.soundEnabled,
          sessionId: event.payload.sessionId
        });
      }
    }
    if (
      event.type === "permission.request" &&
      notifications.enabled &&
      notifications.desktopNotifications &&
      notifications.permissionNotifications &&
      window.electron?.notifications?.show
    ) {
      const sessions = useAppStore.getState().sessions;
      const sessionTitle =
        sessions[event.payload.sessionId]?.title ||
        t("notifications.untitledSession", "未命名会话");
      window.electron.notifications.show({
        title: t("notifications.permissionTitle", "需要权限确认"),
        body: t("notifications.permissionBody", "会话\"{{title}}\"请求 {{toolName}}", {
          title: sessionTitle,
          toolName: event.payload.toolName
        }),
        silent: !notifications.soundEnabled,
        sessionId: event.payload.sessionId
      });
    }
    handleServerEvent(event);
    handlePartialMessages(event);

    if (event.type === "session.status" && event.payload.error) {
      const errorType = event.payload.metadata?.errorType;
      const needsAuth = event.payload.metadata?.needsAuth;
      const errorText = typeof event.payload.error === "string" ? event.payload.error : "";

      if (needsAuth || errorType === "UnauthenticatedError") {
        setShowLoginModal(true);
        return;
      }

      if (errorType === "InsufficientBalanceError" || isInsufficientBalanceErrorText(errorText)) {
        if (isAuthenticated) {
          setShowRechargeModal(true);
        } else {
          setShowLoginModal(true);
        }
      }
    }

    if (event.type === "session.deleted") {
      const sessionId = event.payload.sessionId;
      partialMessagesRef.current.delete(sessionId);
      partialVisibilityRef.current.delete(sessionId);
      isThinkingBlockRef.current.delete(sessionId);
      const clearTimer = clearPartialTimerRef.current.get(sessionId);
      if (clearTimer) {
        clearTimeout(clearTimer);
        clearPartialTimerRef.current.delete(sessionId);
      }
    }
  }, [handleServerEvent, handlePartialMessages, isAuthenticated, notifications, onPartialMessageChange, t, toolProgressThrottle]);

  const onBatchEvent = useCallback((events: ServerEvent[]) => {
    handleServerEventBatch(events);

    for (const event of events) {
      handlePartialMessages(event);
    }
  }, [handleServerEventBatch, handlePartialMessages]);

  const handleLoginRequired = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  return {
    partialMessage,
    showPartialMessage,
    showRechargeModal,
    showLoginModal,
    setShowRechargeModal,
    setShowLoginModal,
    handleLoginRequired,
    onEvent,
    onBatchEvent,
  };
}
