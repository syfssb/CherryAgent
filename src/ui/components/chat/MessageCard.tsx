import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/ui/lib/utils';
import { MessageTimestamp } from './MessageTimestamp';
import { MessageActions } from './MessageActions';
import { MessageCost } from './MessageCost';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallCard } from './ToolCallCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import Avatar from './Avatar';
import { Badge } from '@/ui/components/ui';

/**
 * 消息角色类型
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 工具调用信息
 */
export interface ToolCall {
  id: string;
  name: string;
  status: 'running' | 'success' | 'error';
  input: Record<string, any>;
  output?: string;
  duration?: number;
}

/**
 * 消息使用量信息
 */
export interface MessageUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  costBreakdown?: {
    inputCost: number;
    outputCost: number;
  };
  latencyMs: number;
  firstTokenLatencyMs?: number | null;
  model: string;
  provider: string;
  channelId?: string;
  requestId?: string;
}

/**
 * 消息数据
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number | Date;
  thinkingContent?: string;
  toolCalls?: ToolCall[];
  duration?: number;
  tokenCount?: number;
  cost?: number;
  status?: 'sending' | 'sent' | 'error';
  /** 使用量详细信息（优先使用此字段） */
  usage?: MessageUsageInfo;
}

/**
 * MessageCard 组件属性
 */
export interface MessageCardProps {
  /** 消息数据 */
  message: Message;
  /** 是否正在生成 */
  isGenerating?: boolean;
  /** 复制回调 */
  onCopy?: (content: string) => void;
  /** 重新生成回调 */
  onRegenerate?: (messageId: string) => void;
  /** 编辑回调 */
  onEdit?: (messageId: string) => void;
  /** 删除回调 */
  onDelete?: (messageId: string) => void;
  /** 重试回调 */
  onRetry?: (messageId: string) => void;
  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * 消息卡片组件
 * 完整的消息展示，包含头像、时间戳、操作按钮、思考过程、工具调用等
 *
 * @example
 * // 基础用法
 * <MessageCard
 *   message={messageData}
 *   onCopy={(content) => console.log('已复制:', content)}
 *   onRegenerate={(id) => console.log('重新生成:', id)}
 * />
 *
 * @example
 * // 带错误状态
 * <MessageCard
 *   message={{ ...messageData, status: 'error' }}
 *   onRetry={(id) => console.log('重试:', id)}
 * />
 */
export function MessageCard({
  message,
  isGenerating = false,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onRetry,
  className,
}: MessageCardProps) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const hasError = message.status === 'error';
  const isSending = message.status === 'sending';

  /**
   * 格式化持续时间
   */
  const formattedDuration = useMemo(() => {
    if (!message.duration && !message.usage?.latencyMs) return null;
    const duration = message.usage?.latencyMs || message.duration || 0;
    return (duration / 1000).toFixed(2);
  }, [message.duration, message.usage?.latencyMs]);

  /**
   * 格式化费用（如果没有 usage 信息则使用简单的 cost）
   */
  const formattedCost = useMemo(() => {
    if (message.usage) return null; // 使用 MessageCost 组件
    if (!message.cost) return null;
    return message.cost.toFixed(4);
  }, [message.cost, message.usage]);

  /**
   * Token 数量（优先使用 usage 信息）
   */
  const tokenCount = useMemo(() => {
    return message.usage?.totalTokens || message.tokenCount || null;
  }, [message.usage, message.tokenCount]);

  return (
    <div
      className={cn(
        'group relative flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
        className
      )}
    >
      {/* 头像 */}
      <Avatar
        type={message.role === 'assistant' ? 'ai' : message.role === 'user' ? 'user' : 'system'}
        className="flex-shrink-0"
      />

      {/* 消息内容容器 */}
      <div
        className={cn(
          'flex-1 min-w-0',
          isUser ? 'ml-12' : 'mr-12'
        )}
      >
        {/* 消息头部 */}
        <div className="flex items-center gap-2 mb-1.5">
          {/* 角色标签 */}
          <span className={cn(
            'text-sm font-medium',
            isUser && 'text-chart-1',
            isAssistant && 'text-chart-3'
          )}>
            {isUser && t('chat.userLabel')}
            {isAssistant && t('chat.assistantLabel')}
            {message.role === 'system' && t('chat.systemLabel')}
          </span>

          {/* 时间戳 */}
          <MessageTimestamp timestamp={message.timestamp} />

          {/* 统计信息徽章（优先显示 usage 信息中的数据） */}
          {formattedDuration && (
            <Badge variant="secondary">
              {formattedDuration}s
            </Badge>
          )}
          {tokenCount && (
            <Badge variant="secondary">
              {tokenCount.toLocaleString()} {t('chat.stats.tokens')}
            </Badge>
          )}
          {/* 简单费用显示（当没有 usage 详细信息时） */}
          {formattedCost && (
            <MessageCost cost={parseFloat(formattedCost)} />
          )}

          {/* 操作按钮 */}
          <div className="ml-auto">
            <MessageActions
              messageType={message.role}
              content={message.content}
              isGenerating={isGenerating}
              onCopy={onCopy ? () => onCopy(message.content) : undefined}
              onRegenerate={onRegenerate ? () => onRegenerate(message.id) : undefined}
              onEdit={onEdit ? () => onEdit(message.id) : undefined}
              onDelete={onDelete ? () => onDelete(message.id) : undefined}
              showOnHover={true}
            />
          </div>
        </div>

        {/* 消息主体 */}
        <div
          className={cn(
            'rounded-lg overflow-hidden',
            'border transition-colors duration-200',
            isUser && 'bg-surface-secondary border-border',
            isAssistant && 'bg-surface border-border-subtle',
            hasError && 'border-destructive',
            isSending && 'opacity-60'
          )}
        >
          {/* 思考过程（折叠） */}
          {message.thinkingContent && (
            <ThinkingBlock content={message.thinkingContent} />
          )}

          {/* 工具调用 */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="border-t border-border-subtle">
              {message.toolCalls.map((toolCall) => (
                <ToolCallCard key={toolCall.id} toolName={toolCall.name} status={toolCall.status} input={toolCall.input} output={toolCall.output} executionTimeMs={toolCall.duration} />
              ))}
            </div>
          )}

          {/* 消息内容 */}
          <div className="px-4 py-3">
            <MarkdownRenderer content={message.content} />
          </div>
        </div>

        {/* 详细费用信息（使用 MessageCost 组件） */}
        {message.usage && (
          <div className="mt-2">
            <MessageCost usage={message.usage} defaultExpanded={false} compact={false} />
          </div>
        )}

        {/* 错误提示 */}
        {hasError && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
            <span className="flex-1">{t('chat.errorRetry')}</span>
            {onRetry && (
              <button
                onClick={() => onRetry(message.id)}
                className="px-3 py-1 bg-destructive/20 hover:bg-destructive/30 rounded text-xs font-medium transition-colors"
              >
                {t('chat.retry')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageCard;
