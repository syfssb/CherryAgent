/**
 * Provider 能力注册表 - 统一类型定义
 */

import type { ChannelConfig } from '../../services/channel.js';

/**
 * 统一消息格式（provider 无关）
 */
export interface UnifiedMessage {
  role: 'user' | 'assistant';
  content: string | UnifiedContentBlock[];
}

export interface UnifiedContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}

/**
 * 统一请求参数
 */
export interface UnifiedCompletionParams {
  model: string;
  messages: UnifiedMessage[];
  maxTokens: number;
  system?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  stream: boolean;
  /** 原始请求体，适配器可按需使用 provider 特有字段 */
  rawBody?: Record<string, unknown>;
}

/**
 * 统一非流式响应
 */
export interface CompletionResult {
  id: string;
  model: string;
  content: string;
  stopReason: string;
  usage: UsageInfo;
  /** 原始 provider 响应，用于需要透传的场景 */
  rawResponse?: unknown;
}

/**
 * 流式事件块
 */
export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'signature'; signature: string }
  | { type: 'content_block_start'; index: number; contentBlock: ContentBlockStartInfo }
  | { type: 'content_block_stop'; index: number }
  | { type: 'usage'; usage: UsageInfo }
  | { type: 'error'; error: string }
  | { type: 'done' };

/**
 * content_block_start 事件中的内容块信息
 */
export interface ContentBlockStartInfo {
  type: 'thinking' | 'text' | 'tool_use' | 'redacted_thinking';
  thinking?: string;
  signature?: string;
  text?: string;
  id?: string;
  name?: string;
}

/**
 * Token 用量信息
 */
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Provider 能力声明
 */
export interface ProviderCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
}

/**
 * Provider 适配器接口
 *
 * 每个 provider（anthropic / openai / google 等）实现此接口，
 * 由 ProviderRegistry 统一管理。
 * 新增 provider 只需创建一个适配器文件并在 adapters/index.ts 注册即可。
 */
export interface ProviderAdapter {
  /** provider 名称，与 ChannelConfig.provider 对应 */
  readonly name: string;

  /** 该 provider 支持的模型匹配正则列表（用于自动推断 provider） */
  readonly modelPatterns: RegExp[];

  /** 能力声明 */
  readonly capabilities: ProviderCapabilities;

  /**
   * 判断给定 modelId 是否属于此 provider
   */
  matchesModel(modelId: string): boolean;

  /**
   * 非流式请求
   */
  createCompletion(
    channel: ChannelConfig,
    params: UnifiedCompletionParams,
  ): Promise<CompletionResult>;

  /**
   * 流式请求，返回 AsyncIterable
   */
  createStream(
    channel: ChannelConfig,
    params: UnifiedCompletionParams,
  ): Promise<AsyncIterable<StreamChunk>>;
}

/**
 * 模型信息（对外暴露）
 */
export interface ModelInfo {
  id: string;
  displayName: string;
  provider: string;
  capabilities: ProviderCapabilities;
  context_window: number;
}
