/**
 * Chat components barrel export file.
 * Import all chat-related components from a single location.
 *
 * @example
 * import {
 *   ThinkingBlock,
 *   ToolCallCard,
 *   CodeBlock,
 *   ChatAvatar,
 *   MessageTimestamp,
 *   MessageActions,
 *   MarkdownRenderer,
 *   MessageCard,
 * } from "@/ui/components/chat"
 */

// ThinkingBlock - 可折叠的思考过程显示
export { ThinkingBlock } from './ThinkingBlock';
export type { ThinkingBlockProps } from './ThinkingBlock';

// ToolCallCard - 工具调用卡片
export { ToolCallCard } from './ToolCallCard';
export type { ToolCallCardProps, ToolCallStatus } from './ToolCallCard';

// ExecutionLogItem - 执行过程日志条目
export { ExecutionLogItem } from './ExecutionLogItem';
export type { ExecutionLogItemProps, ExecutionLogStatus } from './ExecutionLogItem';

// ToolLogItem - 工具执行日志条目
export { ToolLogItem } from './ToolLogItem';
export type { ToolLogItemProps } from './ToolLogItem';

// CodeBlock - 语法高亮代码块
export { CodeBlock } from './CodeBlock';
export type { CodeBlockProps } from './CodeBlock';

// ChatAvatar - 聊天头像
export { ChatAvatar } from './Avatar';
export type { ChatAvatarProps, AvatarType } from './Avatar';

// MessageTimestamp - 消息时间戳
export { MessageTimestamp } from './MessageTimestamp';
export type { MessageTimestampProps } from './MessageTimestamp';

// MessageActions - 消息操作
export { MessageActions } from './MessageActions';
export type { MessageActionsProps, MessageType } from './MessageActions';

// MarkdownRenderer - Markdown 渲染器
export { MarkdownRenderer } from './MarkdownRenderer';
export type { MarkdownRendererProps } from './MarkdownRenderer';

// MessageCost - 消息费用显示
export { MessageCost } from './MessageCost';
export type { MessageCostProps, MessageUsageInfo } from './MessageCost';

// MessageCard - 完整的消息卡片组件
export { MessageCard } from './MessageCard';
export type { MessageCardProps, Message, MessageRole, ToolCall } from './MessageCard';

// MessageAdapter - SDK 消息适配器
export { MessageAdapter } from './MessageAdapter';
export type { MessageAdapterProps } from './MessageAdapter';
