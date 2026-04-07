/**
 * MessageAdapter - 适配器组件
 * 将旧的 SDK 消息格式转换为新的聊天组件格式
 * 集成 ThinkingBlock, ToolCallCard, CodeBlock, Avatar, MessageActions
 *
 * 设计参考: Claude.ai / ChatGPT / Cursor 风格
 * - 无边框卡片，用背景色微妙区分
 * - 统一左对齐布局
 * - 头像 + 角色名在上方，内容在下方
 * - 操作按钮 hover 显示
 */

import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  PermissionResult,
} from '@anthropic-ai/claude-agent-sdk';
import type { StreamMessage, MessageUsageInfo, ImageContent } from '@/ui/types';
import type { PermissionRequest } from '@/ui/store/useAppStore';
import React from 'react';
import { useThinkingStore } from '@/ui/hooks/useThinkingStore';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolLogItem } from './ToolLogItem';
import { InlineUserQuestion } from './InlineUserQuestion';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MessageAttachmentCard } from './MessageAttachmentCard';
import { ChatAvatar } from './Avatar';
import { MessageActions } from './MessageActions';
import { MessageCost } from './MessageCost';
import { MessageTimestamp } from './MessageTimestamp';
import { cn } from '@/ui/lib/utils';
import { isGloballyHandledChatErrorText, normalizeChatErrorText } from '@/ui/lib/chat-error';
import { ImageThumbnailGrid } from './ImageViewer';
import { shouldSuppressAssistantSystemErrorMessage } from './message-system-error';
import { useArtifacts } from '@/ui/hooks/useArtifacts';
import { findReferencedArtifacts } from '@/ui/lib/artifact-references';
import { useAppStore } from '@/ui/store/useAppStore';
import { useTranslation } from 'react-i18next';

/**
 * 消息适配器组件属性
 */
export interface MessageAdapterProps {
  /** SDK 消息 */
  message: StreamMessage;
  /** 是否是最后一条消息 */
  isLast?: boolean;
  /** 是否正在运行 */
  isRunning?: boolean;
  /** 权限等待暂停：工具等用户授权，之后会恢复 → pending */
  isPaused?: boolean;
  /** 会话正在终止：工具不会恢复 → error/cancelled */
  isStopping?: boolean;
  /** 权限请求 */
  permissionRequest?: PermissionRequest;
  /** 权限结果回调 */
  onPermissionResult?: (toolUseId: string, result: PermissionResult) => void;
  /** 使用量信息 */
  usage?: MessageUsageInfo;
  /** 是否显示费用 */
  showCost?: boolean;
  /** 当前会话 ID */
  sessionId?: string;
  /** 额外的 CSS 类名 */
  className?: string;
  /** AI 提供商 */
  provider?: string;
  /** 本条是否是连续工具组的第一条（显示头像+时间戳） */
  isFirstInToolGroup?: boolean;
  /** 本条文本回复上方有工具组（不显示头像和时间戳） */
  isTextAfterTools?: boolean;
}

// SDK 内部遥测/日志噪音，不应显示给用户
const SDK_INTERNAL_ERROR_PREFIXES = [
  '1P event logging',
  'Failed to export',
  'events failed to export',
];

function isInternalSdkError(text: string): boolean {
  return SDK_INTERNAL_ERROR_PREFIXES.some((prefix) => text.includes(prefix));
}

function getResultErrorText(message: SDKResultMessage): string {
  const asAny = message as any;
  if (typeof asAny.error === 'string') {
    return asAny.error;
  }
  if (typeof asAny.error?.message === 'string') {
    return asAny.error.message;
  }
  if (typeof asAny.result === 'string') {
    return asAny.result;
  }
  if (typeof asAny.message === 'string') {
    return asAny.message;
  }
  // SDK error_during_execution 格式：errors 是字符串数组
  if (Array.isArray(asAny.errors) && asAny.errors.length > 0) {
    // 优先取第一条非遥测噪音的错误
    const meaningful = asAny.errors.find(
      (e: unknown) => typeof e === 'string' && !isInternalSdkError(e),
    );
    const first = asAny.errors[0];
    return typeof (meaningful ?? first) === 'string'
      ? (meaningful ?? first)
      : JSON.stringify(meaningful ?? first);
  }
  return JSON.stringify(asAny);
}

/**
 * 流式 ThinkingBlock 包装组件
 * 在流式阶段从 useThinkingStore 读取实时内容，流式结束后使用静态内容
 *
 * 性能关键：只有当前正在流式输出的消息（isRunning=true）才订阅 thinking store，
 * 历史消息直接使用 staticContent，避免新一轮对话的 thinking store 更新
 * 导致旧消息的 ThinkingBlock 意外重渲染（store key 按 blockIndex 复用会碰撞）
 */
const StreamingThinkingBlock = React.memo(function StreamingThinkingBlock({
  staticContent,
  isLastContent,
  showIndicator,
  sessionId,
  blockIndex,
  isRunning,
}: {
  staticContent: string;
  isLastContent: boolean;
  showIndicator?: boolean;
  sessionId?: string;
  blockIndex: number;
  /** 当前消息是否正在流式输出 */
  isRunning?: boolean;
}) {
  // 只有正在运行的消息才订阅 thinking store
  // 历史消息返回 undefined，Object.is(undefined, undefined) = true → 不触发重渲染
  const activeBlock = useThinkingStore((s) =>
    isRunning && sessionId ? s.blocks[sessionId]?.[blockIndex] : undefined
  );

  // 流式阶段：store 中有活跃的 thinking block，使用实时内容
  if (activeBlock && activeBlock.isThinking) {
    const durationMs = Date.now() - activeBlock.startTime;
    return (
      <ThinkingBlock
        content={activeBlock.content}
        isThinking={true}
        durationMs={durationMs}
      />
    );
  }

  // 流式结束或历史消息：使用静态内容
  const completedBlock = activeBlock && !activeBlock.isThinking ? activeBlock : undefined;
  const durationMs = completedBlock?.endTime && completedBlock?.startTime
    ? completedBlock.endTime - completedBlock.startTime
    : undefined;

  return (
    <ThinkingBlock
      content={staticContent || completedBlock?.content || ''}
      isThinking={isLastContent && showIndicator}
      durationMs={durationMs}
    />
  );
});

/**
 * 用户提示消息卡片
 * 左对齐布局，浅色背景区分，无边框
 */
function UserPromptCard({
  message,
  showIndicator,
  timestamp,
}: {
  message: { type: 'user_prompt'; prompt: string; images?: ImageContent[] };
  showIndicator?: boolean;
  timestamp: number;
}) {
  const hasImages = message.images && message.images.length > 0;

  return (
    <div className="group flex w-full items-start justify-end gap-3">
      {/* 消息内容（右对齐） */}
      <div className="flex min-w-0 flex-col items-end" style={{ maxWidth: "min(82%, 36rem)" }}>
        {/* 消息头部 - 去掉"用户"标签，仅保留时间戳 */}
        <div className="flex items-center gap-2 mb-1.5">
          {showIndicator && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
          )}
          <MessageTimestamp timestamp={timestamp} showFullTime={true} />
        </div>

        {/* 消息气泡 - Anthropic 暖灰色右对齐气泡 */}
        <div className="rounded-2xl rounded-tr-sm bg-[#DDD9CE] dark:bg-[#393937] px-4 py-3 w-fit max-w-full">
          <div className="text-sm text-ink-900 leading-relaxed whitespace-pre-wrap break-words">
            {message.prompt}
          </div>
          {/* 图片缩略图 */}
          {hasImages && (
            <ImageThumbnailGrid images={message.images!} />
          )}
        </div>

        <div className="mt-1.5 flex justify-end">
          <MessageActions
            messageType="user"
            content={message.prompt}
            showOnHover={true}
          />
        </div>
      </div>

      {/* 用户头像（右侧） */}
      <ChatAvatar type="user" size="sm" className="mt-1 flex-shrink-0" />
    </div>
  );
}

/**
 * 系统初始化消息卡片
 * 紧凑的系统信息展示，无边框
 */
function SystemInitCard({
  message,
  showIndicator,
  timestamp,
}: {
  message: any;
  showIndicator?: boolean;
  timestamp: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="group flex gap-3">
      {/* 系统头像 */}
      <ChatAvatar type="system" size="sm" className="flex-shrink-0 mt-0.5" />

      {/* 消息内容 */}
      <div className="flex-1 min-w-0">
        {/* 消息头部 */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-muted">
            {t('chat.systemInit', '系统初始化')}
          </span>
          <MessageTimestamp timestamp={timestamp} showFullTime={true} />
          {showIndicator && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
          )}
        </div>

        {/* 消息内容 - 无边框，微妙背景 */}
        <div className="rounded-xl bg-surface-secondary/60 dark:bg-surface-secondary/40 px-4 py-3 space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted text-xs">
              {t('chat.model', '模型')}
            </span>
            <span className="text-ink-700 text-xs">{message.model || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted text-xs">
              {t('chat.permissionMode', '权限模式')}
            </span>
            <span className="text-ink-700 text-xs">{message.permissionMode || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted text-xs">
              {t('chat.workingDirectory', '工作目录')}
            </span>
            <span className="text-ink-600 font-mono text-xs truncate">
              {message.cwd || '-'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 助手消息卡片
 * 无边框，直接展示内容，操作按钮 hover 显示
 */
function AssistantMessageCard({
  message,
  isLast = false,
  showIndicator,
  isRunning,
  isPaused = false,
  isStopping = false,
  usage,
  showCost,
  sessionId,
  timestamp,
  provider,
  isFirstInToolGroup = true,
  isTextAfterTools = false,
  referenceTimestamp,
  permissionRequest,
  onPermissionResult,
}: {
  message: SDKAssistantMessage;
  isLast?: boolean;
  showIndicator?: boolean;
  isRunning?: boolean;
  isPaused?: boolean;
  isStopping?: boolean;
  usage?: MessageUsageInfo;
  showCost?: boolean;
  sessionId?: string;
  timestamp: number;
  referenceTimestamp?: number;
  provider?: string;
  /** 本条是否是连续工具组的第一条（显示头像+时间戳） */
  isFirstInToolGroup?: boolean;
  /** 本条文本回复上方有工具组（不显示头像和时间戳） */
  isTextAfterTools?: boolean;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: PermissionResult) => void;
}) {
  const { t } = useTranslation();
  // 防御性访问：content 理论上是数组，但兼容服务端偶发返回 null/undefined 的情况
  const contents: any[] = Array.isArray(message.message?.content) ? message.message.content : [];
  const shouldShowCost = showCost && usage && !isRunning;
  const { artifacts } = useArtifacts();
  const cwd = useAppStore((state) => (sessionId ? state.sessions[sessionId]?.cwd : undefined));

  // 提取所有文本内容用于复制
  const fullTextContent = contents
    .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
    .map((c: any) => c.text as string)
    .join('\n');
  const referencedArtifacts = React.useMemo(
    () => findReferencedArtifacts(fullTextContent, artifacts, Number.isFinite(referenceTimestamp) ? referenceTimestamp : undefined),
    [artifacts, fullTextContent, referenceTimestamp],
  );

  // 检测是否有 thinking 但没有有效 text（text 块不存在，或存在但内容为空）
  const hasThinking = contents.some((c: any) => c.type === 'thinking');
  const hasToolUse = contents.some((c: any) => c.type === 'tool_use');
  const hasText = contents.some((c: any) => c.type === 'text' && c.text && c.text.trim() !== '');
  // 有任意内容块（thinking / text），但有效 text 为空：可能是安全软件拦截或网络中断
  const hasAnyBlock = contents.some((c: any) => c.type === 'thinking' || c.type === 'text');
  const isResponseIntercepted = !isRunning && isLast && hasAnyBlock && !hasText && !hasToolUse;

  // 纯工具调用消息（无文本、无思考）：显示模型图标 + 工具列表
  const isToolOnly = hasToolUse && !hasText && !hasThinking;

  if (isToolOnly) {
    const toolList = (
      <div className="space-y-0.5">
        {contents.map((content: any, idx: number) => {
          const isLastContent = idx === contents.length - 1;
          const contentKey = `${content.type}-${content.id || idx}`;
          if (content.type === 'tool_use') {
            // AskUserQuestion: render inline card when there's a pending request
            if (
              content.name === 'AskUserQuestion' &&
              permissionRequest &&
              permissionRequest.toolName === 'AskUserQuestion' &&
              onPermissionResult
            ) {
              return (
                <InlineUserQuestion
                  key={contentKey}
                  request={permissionRequest}
                  onResult={onPermissionResult}
                />
              );
            }
            return (
              <ToolLogItem
                key={contentKey}
                toolUseId={content.id}
                toolName={content.name}
                input={content.input as Record<string, unknown>}
                showIndicator={isLastContent && showIndicator}
                isPaused={isPaused}
                isStopping={isStopping}
              />
            );
          }
          return null;
        })}
      </div>
    );

    // 工具组第一条：头像 + 时间戳 + 工具列表
    if (isFirstInToolGroup) {
      return (
        <div className="group flex gap-3">
          <ChatAvatar type="ai" size="sm" className="flex-shrink-0 mt-0.5" provider={provider} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <MessageTimestamp timestamp={timestamp} showFullTime={true} />
            </div>
            {toolList}
          </div>
        </div>
      );
    }

    // 工具组后续条：仅缩进对齐（无头像、无时间戳）
    return <div className="pl-11">{toolList}</div>;
  }

  // 文本回复紧跟工具组：仅缩进对齐（无头像、无时间戳）
  if (isTextAfterTools) {
    return (
      <div className="pl-11">
        <div className="space-y-3">
          {contents.map((content: any, idx: number) => {
            const isLastContent = idx === contents.length - 1;
            const contentKey = `${content.type}-${content.id || idx}`;

            if (content.type === 'thinking') {
              return (
                <StreamingThinkingBlock
                  key={contentKey}
                  staticContent={content.thinking}
                  isLastContent={isLastContent}
                  showIndicator={showIndicator}
                  sessionId={sessionId}
                  blockIndex={idx}
                  isRunning={isRunning}
                />
              );
            }

            if (content.type === 'text') {
              return (
                <div key={contentKey} className="prose-container">
                  <MarkdownRenderer content={content.text} enhancedCodeBlocks={true} />
                </div>
              );
            }

            if (content.type === 'tool_use') {
              // AskUserQuestion: render inline card when there's a pending request
              if (
                content.name === 'AskUserQuestion' &&
                permissionRequest &&
                permissionRequest.toolName === 'AskUserQuestion' &&
                onPermissionResult
              ) {
                return (
                  <InlineUserQuestion
                    key={contentKey}
                    request={permissionRequest}
                    onResult={onPermissionResult}
                  />
                );
              }
              return (
                <ToolLogItem
                  key={contentKey}
                  toolUseId={content.id}
                  toolName={content.name}
                  input={content.input as Record<string, unknown>}
                  showIndicator={isLastContent && showIndicator}
                  isPaused={isPaused}
                isStopping={isStopping}
                />
              );
            }

            return null;
          })}

          {isResponseIntercepted && (
            <div className="rounded-xl bg-warning/10 px-4 py-3 flex items-start gap-2">
              <span className="text-warning text-base leading-none mt-0.5">⚠️</span>
              <p className="text-sm text-ink-700 leading-relaxed">
                {t(
                  'chat.responseIntercepted',
                  '回复被终止啦~'
                )}
              </p>
            </div>
          )}

          {referencedArtifacts.length > 0 && (
            <div className="space-y-2">
          {referencedArtifacts.filter((a) => a?.path).map((artifact) => (
                <MessageAttachmentCard key={artifact.path} artifact={artifact} cwd={cwd} />
              ))}
            </div>
          )}

          {shouldShowCost && usage && (
            <MessageCost usage={usage} />
          )}

          <div className="pt-1">
            <MessageActions
              messageType="assistant"
              content={fullTextContent}
              isGenerating={isRunning}
              onCopy={() => {
                navigator.clipboard.writeText(fullTextContent);
              }}
              showOnHover={true}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-3">
      {/* AI 头像 */}
      <ChatAvatar type="ai" size="sm" className="flex-shrink-0 mt-0.5" isLoading={isRunning} provider={provider} />

      {/* 消息内容 */}
      <div className="flex-1 min-w-0">
        {/* 消息头部 - 仅保留时间戳 */}
        <div className="flex items-center gap-2 mb-1">
          <MessageTimestamp timestamp={timestamp} showFullTime={true} />
          {showIndicator && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
          )}
        </div>

        {/* 消息主体 - 无边框，直接展示 */}
        <div className="space-y-3">
          {contents.map((content: any, idx: number) => {
            const isLastContent = idx === contents.length - 1;
            const contentKey = `${content.type}-${content.id || idx}`;

            // 思考内容
            if (content.type === 'thinking') {
              return (
                <StreamingThinkingBlock
                  key={contentKey}
                  staticContent={content.thinking}
                  isLastContent={isLastContent}
                  showIndicator={showIndicator}
                  sessionId={sessionId}
                  blockIndex={idx}
                  isRunning={isRunning}
                />
              );
            }

            // 文本内容 - 无边框，直接渲染
            if (content.type === 'text') {
              return (
                <div key={contentKey} className="prose-container">
                  <MarkdownRenderer content={content.text} enhancedCodeBlocks={true} />
                </div>
              );
            }

            // 工具调用 - 使用日志式 ToolLogItem 组件
            if (content.type === 'tool_use') {
              // AskUserQuestion: render inline card when there's a pending request
              if (
                content.name === 'AskUserQuestion' &&
                permissionRequest &&
                permissionRequest.toolName === 'AskUserQuestion' &&
                onPermissionResult
              ) {
                return (
                  <InlineUserQuestion
                    key={contentKey}
                    request={permissionRequest}
                    onResult={onPermissionResult}
                  />
                );
              }
              return (
                <ToolLogItem
                  key={contentKey}
                  toolUseId={content.id}
                  toolName={content.name}
                  input={content.input as Record<string, unknown>}
                  showIndicator={isLastContent && showIndicator}
                  isPaused={isPaused}
                isStopping={isStopping}
                />
              );
            }

            return null;
          })}

          {/* 响应被拦截警告：有 thinking 但无 text，可能是安全软件 HTTPS 扫描导致 */}
          {isResponseIntercepted && (
            <div className="rounded-xl bg-warning/10 px-4 py-3 flex items-start gap-2">
              <span className="text-warning text-base leading-none mt-0.5">⚠️</span>
              <p className="text-sm text-ink-700 leading-relaxed">
                {t(
                  'chat.responseIntercepted',
                  '回复被终止啦~'
                )}
              </p>
            </div>
          )}

          {referencedArtifacts.length > 0 && (
            <div className="space-y-2">
          {referencedArtifacts.filter((a) => a?.path).map((artifact) => (
                <MessageAttachmentCard key={artifact.path} artifact={artifact} cwd={cwd} />
              ))}
            </div>
          )}

          {/* 费用显示 */}
          {shouldShowCost && usage && (
            <MessageCost usage={usage} />
          )}

          <div className="pt-1">
            <MessageActions
              messageType="assistant"
              content={fullTextContent}
              isGenerating={isRunning}
              onCopy={() => {
                navigator.clipboard.writeText(fullTextContent);
              }}
              showOnHover={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 工具结果消息卡片
 * tool_result 内容已在 ToolCallCard（默认折叠）中展示，此处不再重复渲染，
 * 避免原始 JSON、报错文本（如 "Claude Code is unable to fetch..."）直接暴露给用户。
 */
function ToolResultCard(_props: { message: SDKUserMessage }) {
  return null;
}

/**
 * 消息适配器组件
 * 将 SDK 消息格式转换为新的聊天组件格式
 *
 * memo 比较策略：
 * - message 对象：历史消息引用稳定，只有正在 streaming 的最新消息会更新内容
 * - isRunning：只对最后一条助手消息为 true，其余历史消息始终为 false
 * - isLast：只有最后一条渲染消息为 true
 * - permissionRequest：来自父组件 permissionRequests[0]，用 toolUseId 做稳定性比较
 *   避免数组每次 render 产生新引用导致所有消息重渲染
 * - onPermissionResult：已在 ChatView 用 useCallback 包裹，引用稳定
 *
 * 结论：不变的历史消息（isRunning=false 且 message 引用不变）可被完全跳过
 */
export const MessageAdapter = React.memo(function MessageAdapter({
  message,
  isLast = false,
  isRunning = false,
  isPaused = false,
  isStopping = false,
  permissionRequest,
  onPermissionResult,
  usage,
  showCost = true,
  sessionId,
  className,
  provider,
  isFirstInToolGroup,
  isTextAfterTools,
}: MessageAdapterProps) {
  const { t } = useTranslation();
  const showIndicator = isLast && isRunning;
  const messageCreatedAt = typeof (message as any)?._createdAt === 'number'
    ? (message as any)._createdAt
    : undefined;
  const messageTimestamp = messageCreatedAt ?? Date.now();

  // 用户提示消息
  if (message.type === 'user_prompt') {
    return (
      <div className={cn('mb-6', className)}>
        <UserPromptCard message={message} showIndicator={showIndicator} timestamp={messageTimestamp} />
      </div>
    );
  }

  if ((message as any).type === 'tool_progress') {
    return null;
  }

  const sdkMessage = message as SDKMessage;

  // 系统消息
  if (sdkMessage.type === 'system') {
    // system 消息（init、status、files_persisted 等）不在聊天区域渲染
    if ((sdkMessage as any).subtype === 'compact_boundary') {
      return (
        <div className={cn('my-6', className)}>
          <div className="flex items-center justify-center gap-3 text-xs text-muted">
            <div className="h-px flex-1 max-w-16 bg-ink-900/8" />
            <span>{t('chat.compactDone', '上下文已压缩')}</span>
            <div className="h-px flex-1 max-w-16 bg-ink-900/8" />
          </div>
        </div>
      );
    }
    return null;
  }

  // 结果消息
  if (sdkMessage.type === 'result') {
    if (sdkMessage.subtype === 'success') {
      // 不显示会话结果统计
      return null;
    }
    // is_error 为 false 表示 AI 已成功输出内容（如 error_max_turns 只是触达轮次上限），
    // 无需向用户展示误导性的错误卡片。使用严格等于避免 undefined 被误判
    if ((sdkMessage as any).is_error === false) {
      return null;
    }
    const rawErrorText = getResultErrorText(sdkMessage);

    // 开发模式下在控制台输出原始错误，便于调试
    if (process.env.NODE_ENV === 'development') {
      console.error('[MessageAdapter] Raw error:', rawErrorText);
      console.error('[MessageAdapter] Full SDK message:', sdkMessage);
    }

    const normalized = normalizeChatErrorText(rawErrorText);
    const friendlyErrorText = normalized.text || t('chat.requestFailedRetry', '请求失败，请稍后重试。');

    // Login and balance errors are handled globally (global banner + action button).
    // Suppress the inline chat bubble to avoid showing the same message twice.
    if (isGloballyHandledChatErrorText(rawErrorText) || normalized.isLoginError || normalized.isBalanceError) {
      return null;
    }

    return (
      <div className={cn('mb-6', className)}>
        <div className="group flex gap-3">
          <ChatAvatar type="ai" size="sm" className="flex-shrink-0 mt-0.5" provider={provider} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-ink-600">
                {t('chat.sessionError', '会话错误')}
              </span>
              <MessageTimestamp timestamp={messageTimestamp} showFullTime={true} />
            </div>
            <div className="rounded-xl bg-surface-secondary/60 dark:bg-surface-secondary/40 px-4 py-3">
              <p className="text-sm text-ink-700">
                {friendlyErrorText}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 助手消息
  if (sdkMessage.type === 'assistant') {
    if (shouldSuppressAssistantSystemErrorMessage(sdkMessage)) {
      return null;
    }

    const assistantContents = sdkMessage.message?.content ?? [];
    const assistantHasToolUse = assistantContents.some((c: any) => c.type === 'tool_use');
    const assistantHasText = assistantContents.some((c: any) => c.type === 'text' && c.text?.trim());
    const assistantHasThinking = assistantContents.some((c: any) => c.type === 'thinking');
    const assistantIsToolOnly = assistantHasToolUse && !assistantHasText && !assistantHasThinking;
    return (
      <div className={cn(assistantIsToolOnly ? 'mb-1' : 'mb-6', className)}>
        <AssistantMessageCard
          message={sdkMessage}
          isLast={isLast}
          showIndicator={showIndicator}
          isRunning={isRunning}
          isPaused={isPaused}
          isStopping={isStopping}
          usage={usage}
          showCost={showCost}
          sessionId={sessionId}
          timestamp={messageTimestamp}
          referenceTimestamp={messageCreatedAt}
          provider={provider}
          isFirstInToolGroup={isFirstInToolGroup}
          isTextAfterTools={isTextAfterTools}
          permissionRequest={permissionRequest}
          onPermissionResult={onPermissionResult}
        />
      </div>
    );
  }

  // 用户消息（工具结果）
  if (sdkMessage.type === 'user') {
    return (
      <div className={cn('mb-3', className)}>
        <ToolResultCard message={sdkMessage} />
      </div>
    );
  }

  return null;
},
/**
 * 自定义比较函数
 *
 * 核心优化点：
 * 1. message 引用：历史消息对象引用稳定，只有 streaming 中的最新消息会发生内容变化
 * 2. isRunning：绝大多数历史消息 isRunning=false，这一判断可快速短路大量重渲染
 * 3. permissionRequest：用 toolUseId 比较，避免父组件每次渲染时 permissionRequests[0]
 *    产生新对象引用（即使内容未变）导致所有消息重渲染
 * 4. 非最后一条消息（isLast=false）且非运行中：只要 message 引用和关键展示 props 不变，
 *    可完全跳过重渲染
 */
(prevProps, nextProps) => {
  // message 引用变化（streaming 更新内容）→ 必须重渲染
  if (prevProps.message !== nextProps.message) return false;

  // isRunning 变化（开始/停止 streaming）→ 必须重渲染
  if (prevProps.isRunning !== nextProps.isRunning) return false;
  if (prevProps.isPaused !== nextProps.isPaused) return false;
  if (prevProps.isStopping !== nextProps.isStopping) return false;

  // isLast 变化（新消息到来，最后一条标记转移）→ 必须重渲染
  if (prevProps.isLast !== nextProps.isLast) return false;

  // 布局/分组 props 变化 → 必须重渲染
  if (prevProps.isFirstInToolGroup !== nextProps.isFirstInToolGroup) return false;
  if (prevProps.isTextAfterTools !== nextProps.isTextAfterTools) return false;
  if (prevProps.className !== nextProps.className) return false;

  // provider/sessionId/showCost 变化 → 必须重渲染
  if (prevProps.provider !== nextProps.provider) return false;
  if (prevProps.sessionId !== nextProps.sessionId) return false;
  if (prevProps.showCost !== nextProps.showCost) return false;

  // usage：通常在消息完成后写入一次，用 JSON 字符串做值比较防止引用陷阱
  if (prevProps.usage !== nextProps.usage) {
    if (
      prevProps.usage?.inputTokens !== nextProps.usage?.inputTokens ||
      prevProps.usage?.outputTokens !== nextProps.usage?.outputTokens ||
      prevProps.usage?.cost !== nextProps.usage?.cost
    ) return false;
  }

  // permissionRequest：用 toolUseId 做稳定性标识，避免新引用误触发重渲染
  const prevPR = prevProps.permissionRequest;
  const nextPR = nextProps.permissionRequest;
  if (prevPR !== nextPR) {
    if (prevPR?.toolUseId !== nextPR?.toolUseId) return false;
    if (prevPR?.toolName !== nextPR?.toolName) return false;
  }

  // onPermissionResult：已在 ChatView 用 useCallback 包裹，引用应稳定，
  // 若不稳定也应更新（函数语义变化）
  if (prevProps.onPermissionResult !== nextProps.onPermissionResult) return false;

  return true;
});

export default MessageAdapter;
