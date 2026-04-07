import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { useAppStore } from "../store/useAppStore";
import type { ClientEvent } from "../types";
import { useMessageWindow } from "../hooks/useMessageWindow";
import { PromptInput } from "../components/PromptInput";
import { MessageCard } from "../components/EventCard";
import MDContent from "../render/markdown";
import { NewWelcomeGuide } from "../components/chat/NewWelcomeGuide";

const SCROLL_THRESHOLD = 50;

export interface ChatPageProps {
  connected: boolean;
  sendEvent: (event: ClientEvent) => void;
}

/**
 * 聊天页面组件
 * 从 App.tsx 提取出来的主对话界面
 */
export function ChatPage({ connected: _connected, sendEvent }: ChatPageProps) {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [partialMessage, _setPartialMessage] = useState("");
  const [showPartialMessage, _setShowPartialMessage] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const prevMessagesLengthRef = useRef(0);
  const scrollHeightBeforeLoadRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);

  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const resolvePermissionRequest = useAppStore((s) => s.resolvePermissionRequest);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const messages = activeSession?.messages ?? [];
  const permissionRequests = activeSession?.permissionRequests ?? [];
  const isRunning = activeSession?.status === "running";
  const isCompacting = Boolean(activeSession?.isCompacting);

  const {
    visibleMessages,
    hasMoreHistory,
    isLoadingHistory,
    loadMoreMessages,
    resetToLatest,
    totalMessages,
  } = useMessageWindow(messages, permissionRequests, activeSessionId);

  // Combined event handler
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe(
      () => {
        // Handle any session updates
      }
    );
    return unsubscribe;
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;

    if (isAtBottom !== shouldAutoScroll) {
      setShouldAutoScroll(isAtBottom);
      if (isAtBottom) {
        setHasNewMessages(false);
      }
    }
  }, [shouldAutoScroll]);

  // Set up IntersectionObserver for top sentinel
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMoreHistory && !isLoadingHistory) {
          scrollHeightBeforeLoadRef.current = container.scrollHeight;
          shouldRestoreScrollRef.current = true;
          loadMoreMessages();
        }
      },
      {
        root: container,
        rootMargin: "100px 0px 0px 0px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreHistory, isLoadingHistory, loadMoreMessages]);

  // Restore scroll position after loading history
  useEffect(() => {
    if (shouldRestoreScrollRef.current && !isLoadingHistory) {
      const container = scrollContainerRef.current;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        const scrollDiff = newScrollHeight - scrollHeightBeforeLoadRef.current;
        container.scrollTop += scrollDiff;
      }
      shouldRestoreScrollRef.current = false;
    }
  }, [visibleMessages, isLoadingHistory]);

  // Reset scroll state on session change
  useEffect(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    prevMessagesLengthRef.current = 0;
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 100);
  }, [activeSessionId]);

  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (messages.length > prevMessagesLengthRef.current && prevMessagesLengthRef.current > 0) {
      setHasNewMessages(true);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, partialMessage, shouldAutoScroll]);

  const scrollToBottom = useCallback(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    resetToLatest();
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [resetToLatest]);

  const handlePermissionResult = useCallback((toolUseId: string, result: PermissionResult) => {
    if (!activeSessionId) return;
    sendEvent({ type: "permission.response", payload: { sessionId: activeSessionId, toolUseId, result } });
    resolvePermissionRequest(activeSessionId, toolUseId);
  }, [activeSessionId, sendEvent, resolvePermissionRequest]);

  const handleSendMessage = useCallback(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    resetToLatest();
  }, [resetToLatest]);

  return (
    <>
      <div
        className="flex items-center justify-center h-12 border-b border-ink-900/10 bg-surface-cream select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-medium text-ink-700">
          {activeSession?.title || t("app.name", "Cherry Agent")}
        </span>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-8 pb-40 pt-6"
      >
        <div className="mx-auto max-w-3xl">
          <div ref={topSentinelRef} className="h-1" />

          {!hasMoreHistory && totalMessages > 0 && (
            <div className="flex items-center justify-center py-4 mb-4">
              <div className="flex items-center gap-2 text-xs text-muted">
                <div className="h-px w-12 bg-ink-900/10" />
                <span>{t("chat.beginningOfConversation", "对话开始")}</span>
                <div className="h-px w-12 bg-ink-900/10" />
              </div>
            </div>
          )}

          {isLoadingHistory && (
            <div className="flex items-center justify-center py-4 mb-4">
              <div className="flex items-center gap-2 text-xs text-muted">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{t("chat.loading", "加载中...")}</span>
              </div>
            </div>
          )}

          {visibleMessages.length === 0 ? (
            <NewWelcomeGuide />
          ) : (
            visibleMessages.map((item, idx) => {
              const extendedMessage = item.message as any;
              const usage = extendedMessage._usage;

              return (
                <MessageCard
                  key={`${activeSessionId}-msg-${item.originalIndex}`}
                  message={item.message}
                  isLast={idx === visibleMessages.length - 1}
                  isRunning={isRunning}
                  permissionRequest={permissionRequests[0]}
                  onPermissionResult={handlePermissionResult}
                  usage={usage}
                  provider={activeSession?.provider}
                />
              );
            })
          )}

          {isCompacting && (
            <div className="my-6 flex items-center justify-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-ink-900/10" />
              <span>{t("chat.compacting", "正在自动压缩上下文...")}</span>
              <div className="h-px flex-1 bg-ink-900/10" />
            </div>
          )}

          <div className="partial-message">
            <MDContent text={partialMessage} />
            {showPartialMessage && (
              <div className="mt-3 flex flex-col gap-2 px-1">
                <div className="relative h-3 w-2/12 overflow-hidden rounded-full bg-ink-900/10">
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-900/10">
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-900/10">
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-900/10">
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
                </div>
                <div className="relative h-3 w-4/12 overflow-hidden rounded-full bg-ink-900/10">
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
                </div>
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
        </div>
      </div>

      <PromptInput sendEvent={sendEvent} onSendMessage={handleSendMessage} disabled={isRunning} />

      {hasNewMessages && !shouldAutoScroll && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:bg-accent-hover hover:scale-105 animate-bounce-subtle"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          <span>{t("chat.newMessages", "新消息")}</span>
        </button>
      )}
    </>
  );
}
