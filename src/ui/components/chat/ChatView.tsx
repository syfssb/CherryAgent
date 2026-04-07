import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { PermissionRequest } from "../../store/useAppStore";
import type { IndexedMessage } from "../../hooks/useMessageWindow";
import type { ToolExecutionState } from "../../hooks/useToolExecutionStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useAppStore } from "../../store/useAppStore";
import { MessageAdapter } from "./MessageAdapter";
import { ToolLogItem } from "./ToolLogItem";
import { ChatAvatar } from "./Avatar";
import { ScrollArea } from "../ui/scroll-area";
import MDContent from "../../render/markdown";
import { NewWelcomeGuide } from "./NewWelcomeGuide";
import { buildChatViewportInsetStyle } from "../../lib/layout-insets";

function isHiddenInTimeline(message: any): boolean {
  if (!message) return true;
  if (message.type === "stream_event" || message.type === "tool_progress") return true;
  if (message.type === "system") {
    const subtype = (message as any).subtype;
    if (subtype === "status" || subtype === "init") return true;
  }
  return false;
}

/** 对头像分组透明的消息：tool_result、隐藏系统消息、成功结果 */
function isGroupTransparentMessage(msg: any): boolean {
  if (!msg) return true;
  if (msg.type === "user") return true; // tool_result
  if (isHiddenInTimeline(msg)) return true;
  if (msg.type === "result" && msg.subtype === "success") return true;
  return false;
}

/** 助手消息是否为纯工具调用（无文本、无思考） */
function isToolOnlyMessage(msg: any): boolean {
  if (!msg || msg.type !== "assistant") return false;
  const contents = msg?.message?.content;
  if (!Array.isArray(contents) || contents.length === 0) return false;
  const hasToolUse = contents.some((c: any) => c.type === "tool_use");
  const hasText = contents.some((c: any) => c.type === "text" && c.text?.trim());
  const hasThinking = contents.some((c: any) => c.type === "thinking");
  return hasToolUse && !hasText && !hasThinking;
}

/** 助手消息是否含有文本（结果性回复） */
function isAssistantWithText(msg: any): boolean {
  if (!msg || msg.type !== "assistant") return false;
  const contents = msg?.message?.content;
  if (!Array.isArray(contents)) return false;
  return contents.some((c: any) => c.type === "text" && c.text?.trim());
}

function hasDisplayableAssistantContent(message: any): boolean {
  if (!message || message.type !== "assistant") return false;
  const contents = message?.message?.content;
  if (!Array.isArray(contents) || contents.length === 0) return false;
  return contents.some((block: any) => {
    if (!block) return false;
    if (block.type === "text") {
      return String(block.text ?? "").trim().length > 0;
    }
    return true;
  });
}

interface ChatViewProps {
  activeSessionId: string | null;
  visibleMessages: IndexedMessage[];
  totalMessages: number;
  hasMoreHistory: boolean;
  isLoadingHistory: boolean;
  isRunning: boolean;
  isStopping?: boolean;
  isRetrying?: boolean;
  waitingPhase?: 'thinking' | 'long' | 'timeout' | null;
  permissionRequests: PermissionRequest[];
  liveToolExecutions: ToolExecutionState[];
  partialMessage: string;
  showPartialMessage: boolean;
  highlightSessionId: string | null;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  contentRootRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onNewSession: () => void;
  onPermissionResult: (sessionId: string, toolUseId: string, result: PermissionResult) => void;
  onLoginRequired?: () => void;
  provider?: string;
  rightInset?: number;
  isHydrating?: boolean;
}

export function ChatView({
  activeSessionId,
  visibleMessages,
  totalMessages,
  hasMoreHistory,
  isLoadingHistory,
  isRunning,
  isStopping = false,
  isRetrying = false,
  waitingPhase = null,
  permissionRequests,
  liveToolExecutions,
  partialMessage,
  showPartialMessage,
  highlightSessionId,
  scrollContainerRef,
  topSentinelRef,
  contentRootRef,
  messagesEndRef,
  onScroll,
  onNewSession: _onNewSession,
  onPermissionResult,
  onLoginRequired,
  provider,
  rightInset = 0,
  isHydrating = false,
}: ChatViewProps) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pendingStart = useAppStore((s) => s.pendingStart);
  const chatTypography = useSettingsStore((s) => s.chatTypography);
  const isPermissionPaused = permissionRequests.length > 0;

  /**
   * 一次反向遍历计算所有需要的索引和标志，避免 5 个独立 O(n) 遍历
   */
  const {
    lastUserPromptVisibleIndex,
    hasAssistantOrTerminalMessageAfterLatestUser,
    lastRenderableOriginalIndex,
    latestAssistantStartOriginalIndex,
  } = useMemo(() => {
    const msgs = visibleMessages.map((item) => item.message as any);
    let lastUserIdx = -1;
    let lastRenderableOIdx = -1;
    let assistantStartOIdx = -1;
    let hasAssistantOrTerminal = false;
    let foundLastRenderable = false;

    // 反向遍历一次获取所有信息
    for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
      const item = visibleMessages[i];
      const msg = msgs[i];

      // lastRenderableOriginalIndex: 最后一个非隐藏消息的 originalIndex
      if (!foundLastRenderable && !isHiddenInTimeline(msg)) {
        lastRenderableOIdx = item.originalIndex;
        foundLastRenderable = true;
      }

      // lastUserPromptVisibleIndex: 最后一个 user_prompt 的可见索引
      if (lastUserIdx < 0 && msg?.type === "user_prompt") {
        lastUserIdx = i;
      }
    }

    // 正向扫描 lastUserIdx 之后的消息
    if (lastUserIdx >= 0) {
      let foundStart = false;
      for (let i = lastUserIdx + 1; i < visibleMessages.length; i += 1) {
        const item = visibleMessages[i];
        const msg = msgs[i];

        if (!hasAssistantOrTerminal) {
          if (!isHiddenInTimeline(msg)) {
            if (msg?.type === "assistant" && hasDisplayableAssistantContent(msg)) {
              hasAssistantOrTerminal = true;
            } else if (msg?.type === "result") {
              hasAssistantOrTerminal = true;
            }
          }
        }

        if (msg?.type === "assistant" && hasDisplayableAssistantContent(msg)) {
          if (!foundStart) {
            assistantStartOIdx = item.originalIndex;
            foundStart = true;
          }
        }
      }
    }

    return {
      lastUserPromptVisibleIndex: lastUserIdx,
      hasAssistantOrTerminalMessageAfterLatestUser: hasAssistantOrTerminal,
      lastRenderableOriginalIndex: lastRenderableOIdx,
      latestAssistantStartOriginalIndex: assistantStartOIdx,
    };
  }, [visibleMessages]);

  /**
   * 预计算每条消息的头像分组标志，避免在渲染循环中重复反向扫描
   * - isFirstInToolGroup: 纯工具消息且前一个非透明消息不是工具消息（即本轮工具组第一条）
   * - isTextAfterTools: 含文本的助手消息且前一个非透明消息是纯工具消息
   */
  const messageFlags = useMemo(() => {
    return visibleMessages.map((item, i) => {
      const msg = item.message as any;

      let isFirstInToolGroup = false;
      let isTextAfterTools = false;

      if (isToolOnlyMessage(msg) || isAssistantWithText(msg)) {
        // 向前扫描，跳过透明消息，找到最近的实质消息
        let prevNonTransparentMsg: any = null;
        for (let j = i - 1; j >= 0; j -= 1) {
          const prevMsg = visibleMessages[j].message as any;
          if (!isGroupTransparentMessage(prevMsg)) {
            prevNonTransparentMsg = prevMsg;
            break;
          }
        }

        if (isToolOnlyMessage(msg)) {
          isFirstInToolGroup = !isToolOnlyMessage(prevNonTransparentMsg);
        }
        if (isAssistantWithText(msg)) {
          isTextAfterTools = isToolOnlyMessage(prevNonTransparentMsg);
        }
      }

      return { isFirstInToolGroup, isTextAfterTools };
    });
  }, [visibleMessages]);

  const handleJumpToLatestAssistantStart = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>('[data-latest-assistant-start="true"]');
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollContainerRef]);

  // 当最新回复起点滚出视口时，显示固定悬浮按钮
  const [showFixedJumpButton, setShowFixedJumpButton] = useState(false);
  useEffect(() => {
    if (isRunning || latestAssistantStartOriginalIndex < 0) {
      setShowFixedJumpButton(false);
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>('[data-latest-assistant-start="true"]');
    if (!target) {
      setShowFixedJumpButton(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setShowFixedJumpButton(!entry.isIntersecting),
      { root: container, threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isRunning, latestAssistantStartOriginalIndex, visibleMessages, scrollContainerRef]);

  // 会话刚启动但 stream.user_prompt 尚未到达时，messages 为空
  // pendingStart: 用户已点击发送但 session.status 事件尚未到达
  // isSessionJustStarted: session.status "running" 已到达但 stream.user_prompt 未到达
  const isSessionJustStarted = isRunning && visibleMessages.length === 0;
  const isWaitingForSession = pendingStart || isSessionJustStarted;
  const waitingForFirstAssistantReply =
    isRunning &&
    lastUserPromptVisibleIndex >= 0 &&
    !hasAssistantOrTerminalMessageAfterLatestUser;
  const shouldShowPartialPreview =
    showPartialMessage &&
    !hasAssistantOrTerminalMessageAfterLatestUser &&
    partialMessage.trim().length > 0;
  // showPartialMessage=true 但内容为空时（content_block_start 已到达但 delta 未到），
  // 应继续显示等待指示器，而非空白
  const shouldShowWaitingIndicator = (waitingForFirstAssistantReply || isWaitingForSession) && !shouldShowPartialPreview;

  // 工具调用之间的静默期指示器：AI 正在运行，但没有实时工具、没有流式输出、不是初始等待
  const shouldShowBetweenToolsIndicator =
    isRunning &&
    !shouldShowWaitingIndicator &&
    !shouldShowPartialPreview &&
    liveToolExecutions.length === 0 &&
    hasAssistantOrTerminalMessageAfterLatestUser;

  const runningAssistantOriginalIndex = (() => {
    if (!isRunning || waitingForFirstAssistantReply) return -1;
    for (let i = visibleMessages.length - 1; i > lastUserPromptVisibleIndex; i -= 1) {
      const candidate = visibleMessages[i];
      if (
        (candidate.message as any)?.type === "assistant" &&
        hasDisplayableAssistantContent(candidate.message as any)
      ) {
        return candidate.originalIndex;
      }
    }
    return -1;
  })();

  const handlePermissionResult = useCallback(
    (toolUseId: string, result: PermissionResult) => {
      if (!activeSessionId) return;
      onPermissionResult(activeSessionId, toolUseId, result);
    },
    [activeSessionId, onPermissionResult]
  );

  /**
   * 稳定 permissionRequests[0] 的引用
   *
   * 问题：permissionRequests 是数组，父组件每次 render 都会产生新数组引用，
   * 即使 permissionRequests[0] 的内容完全没变，[0] 取出的对象也是新引用。
   * 这会导致所有 MessageAdapter 实例的 permissionRequest prop 比较失败，
   * 进而触发全量重渲染。
   *
   * 方案：用 useMemo 按 toolUseId 做稳定性检查，只有真正的权限请求变化时才产生新引用。
   */
  const stablePermissionRequest = useMemo(() => {
    return permissionRequests[0] ?? undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    permissionRequests[0]?.toolUseId,
    permissionRequests[0]?.toolName,
    permissionRequests.length,
  ]);

  const chatTypographyStyle = useMemo(() => ({
    '--chat-font-size': `${chatTypography.fontSize / 16}rem`,
    '--chat-line-height': `${chatTypography.lineHeight}`,
    '--chat-paragraph-spacing': `${chatTypography.paragraphSpacing}em`,
    maxWidth: 'clamp(56rem, 76vw, 82rem)',
  } as React.CSSProperties), [chatTypography.fontSize, chatTypography.lineHeight, chatTypography.paragraphSpacing]);

  const viewportInsetStyle = useMemo(
    () => ({
      overflowX: 'hidden' as const,
      ...buildChatViewportInsetStyle(rightInset),
    }),
    [rightInset]
  );

  // 欢迎页：未登录 或 无消息且未运行 → 不需要巨量底部 padding
  const isWelcomePage =
    !isAuthenticated ||
    (!isHydrating && visibleMessages.length === 0 && !isRunning && !pendingStart);

  return (
    <>
    <ScrollArea
      className="flex-1"
      type="scroll"
      scrollHideDelay={300}
      viewportRef={scrollContainerRef}
      onViewportScroll={onScroll}
      viewportClassName={`overflow-x-hidden px-6 pt-4 ${isWelcomePage ? "pb-6" : "pb-52"}`}
      viewportStyle={viewportInsetStyle}
    >
      <div
        ref={contentRootRef}
        className="mx-auto w-full min-w-0"
        style={chatTypographyStyle}
      >
        <div ref={topSentinelRef} className="h-1" />

        {!isAuthenticated ? (
          <NewWelcomeGuide onLoginRequired={onLoginRequired} />
        ) : (
        <>

        {!hasMoreHistory && totalMessages > 0 && (
          <div className="flex items-center justify-center py-3 mb-6">
            <div className="flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 max-w-12 bg-ink-900/8" />
              <span>{t("chat.beginningOfConversation", "对话开始")}</span>
              <div className="h-px flex-1 max-w-12 bg-ink-900/8" />
            </div>
          </div>
        )}

        {isLoadingHistory && (
          <div className="flex items-center justify-center py-3 mb-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>{t("chat.loading", "加载中...")}</span>
            </div>
          </div>
        )}

        {isHydrating ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <svg className="h-5 w-5 animate-spin text-muted" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-xs text-muted">{t("chat.loading", "加载中...")}</span>
          </div>
        ) : visibleMessages.length === 0 && !isRunning && !pendingStart ? (
          <NewWelcomeGuide onLoginRequired={onLoginRequired} />
        ) : (
          visibleMessages.map((item, idx) => {
            const extendedMessage = item.message as any;
            const usage = extendedMessage._usage;
            const isLastMessage = item.originalIndex === lastRenderableOriginalIndex;
            const isLatestTurnAssistantStart =
              item.originalIndex === latestAssistantStartOriginalIndex;
            const shouldHighlight =
              isLastMessage && highlightSessionId === activeSessionId;
            const shouldRunThisMessage =
              isRunning && item.originalIndex === runningAssistantOriginalIndex;
            const { isFirstInToolGroup, isTextAfterTools } = messageFlags[idx]!;

            return (
              <div
                key={`${activeSessionId}-msg-${item.originalIndex}`}
                className="message-virtualized"
                data-latest-assistant-start={isLatestTurnAssistantStart ? "true" : undefined}
              >
                <MessageAdapter
                  message={item.message}
                  isLast={isLastMessage}
                  isRunning={shouldRunThisMessage}
                  isPaused={isPermissionPaused}
                  isStopping={isStopping}
                  permissionRequest={stablePermissionRequest}
                  onPermissionResult={handlePermissionResult}
                  usage={usage}
                  showCost={true}
                  sessionId={activeSessionId ?? undefined}
                  provider={provider}
                  isFirstInToolGroup={isFirstInToolGroup}
                  isTextAfterTools={isTextAfterTools}
                  className={
                    shouldHighlight
                      ? "rounded-xl bg-accent/[0.03] ring-1 ring-accent/20"
                      : undefined
                  }
                />
              </div>
            );
          })
        )}

        {liveToolExecutions.length > 0 && (
          <div className="space-y-2 mb-4 pl-9">
            {liveToolExecutions.map((exec) => (
              <ToolLogItem
                key={`live-${exec.toolUseId}`}
                toolUseId={exec.toolUseId}
                toolName={exec.toolName}
                input={exec.input}
                showIndicator={exec.status === "running" && !isPermissionPaused && !isStopping}
                isPaused={isPermissionPaused}
                isStopping={isStopping}
              />
            ))}
          </div>
        )}

        {shouldShowBetweenToolsIndicator && (
          <div className="mt-2 mb-1 pl-9">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#1414130a] px-3 py-1.5 dark:bg-[#faf9f50a]">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#b0aea5] animate-bounce"
                style={{ animationDelay: '-0.3s' }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#b0aea5] animate-bounce"
                style={{ animationDelay: '-0.15s' }}
              />
              <span className="h-1.5 w-1.5 rounded-full bg-[#b0aea5] animate-bounce" />
            </div>
          </div>
        )}

        {shouldShowWaitingIndicator && (
          <div className="mt-4 pl-1">
            <div className="flex gap-3">
              <ChatAvatar type="ai" size="sm" className="mt-0.5 flex-shrink-0" isLoading provider={provider} />
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[13px] text-ink-500">
                  {isRetrying
                    ? t("chat.retrying_busy", "服务繁忙，正在重试...")
                    : waitingPhase === 'timeout'
                      ? t("chat.waiting_timeout", "等待时间过长，你可以点击停止重新提问")
                      : waitingPhase === 'long'
                        ? t("chat.waiting_long", "响应时间较长，仍在等待中...")
                        : waitingPhase === 'thinking'
                          ? t("chat.waiting_thinking", "模型正在深度思考，请稍候...")
                          : t("chat.thinking", "思考中")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" />
                </span>
              </div>
            </div>
          </div>
        )}

        {shouldShowPartialPreview && (
        <div className="partial-message pl-10 max-h-[60vh] overflow-auto">
          <MDContent text={partialMessage} />
          {!waitingForFirstAssistantReply && (
            <div className="mt-3 flex flex-col gap-1.5 px-1">
              <div className="relative h-2.5 w-2/12 overflow-hidden rounded-full bg-ink-900/6">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/20 to-transparent animate-shimmer" />
              </div>
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-ink-900/6">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/20 to-transparent animate-shimmer" />
              </div>
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-ink-900/6">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/20 to-transparent animate-shimmer" />
              </div>
              <div className="relative h-2.5 w-4/12 overflow-hidden rounded-full bg-ink-900/6">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/20 to-transparent animate-shimmer" />
              </div>
            </div>
          )}
        </div>
        )}

        <div ref={messagesEndRef} />
        </>
        )}
      </div>
    </ScrollArea>

    {/* 回到本次回复顶部 — fixed 悬浮按钮，跟随侧边栏 inset */}
    {showFixedJumpButton && (
      <div
        className="pointer-events-none fixed bottom-0 left-0 z-40 flex items-end justify-center pb-[176px]"
        style={{ right: rightInset }}
      >
        <button
          type="button"
          aria-label={t("chat.jumpToLatestReplyStart", "回到本次回复开头")}
          onClick={handleJumpToLatestAssistantStart}
          className="pointer-events-auto inline-flex h-10 w-10 touch-manipulation cursor-pointer items-center justify-center rounded-full border border-ink-900/8 bg-surface shadow-card text-ink-500/85 transition-all duration-150 hover:-translate-y-0.5 hover:bg-accent/10 hover:text-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 animate-bounce-subtle"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.3">
            <path d="M7 14l5-5 5 5" />
          </svg>
        </button>
      </div>
    )}
    </>
  );
}
