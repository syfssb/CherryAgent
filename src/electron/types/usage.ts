/**
 * 使用量和费用类型定义
 * 用于 API 代理转发和费用统计
 */

/**
 * 模型定价信息
 */
export interface ModelPricing {
  /** 模型名称 */
  model: string;
  /** 提供商 */
  provider: string;
  /** 输入 Token 单价 (美元/百万 Token) */
  inputPricePerMillion: number;
  /** 输出 Token 单价 (美元/百万 Token) */
  outputPricePerMillion: number;
  /** 上下文窗口大小 */
  contextWindow?: number;
}

/**
 * Token 使用量
 */
export interface TokenUsage {
  /** 输入 Token 数量 */
  inputTokens: number;
  /** 输出 Token 数量 */
  outputTokens: number;
  /** 缓存命中的输入 Token */
  cacheReadInputTokens?: number;
  /** 写入缓存的 Token */
  cacheCreationInputTokens?: number;
}

/**
 * 单条消息的使用量信息
 * 附加到每条 AI 消息上
 */
export interface MessageUsage {
  /** 唯一标识符 */
  id: string;
  /** 关联的消息 ID */
  messageId?: string;
  /** 使用的模型 */
  model: string;
  /** 提供商 */
  provider: string;
  /** Token 使用量 */
  usage: TokenUsage;
  /** 费用 (美元) */
  cost: number;
  /** 费用明细 */
  costBreakdown?: {
    inputCost: number;
    outputCost: number;
    cacheCost?: number;
  };
  /** 延迟 (毫秒) */
  latencyMs: number;
  /** 首个 Token 延迟 (毫秒) - 用于流式响应 */
  firstTokenLatencyMs?: number;
  /** 请求开始时间 */
  startedAt: number;
  /** 请求结束时间 */
  completedAt: number;
  /** 使用的渠道 ID */
  channelId?: string;
  /** 是否为流式请求 */
  isStreaming?: boolean;
  /** 请求状态 */
  status: 'success' | 'error' | 'partial';
  /** 错误信息 */
  errorMessage?: string;
}

/**
 * API 使用量记录
 * 存储到数据库的完整记录
 */
export interface UsageRecord {
  /** 唯一标识符 */
  id: string;
  /** 用户 ID (可选，未登录用户为空) */
  userId?: string;
  /** API Key ID (如果通过 API Key 访问) */
  apiKeyId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 请求 ID */
  requestId: string;
  /** 使用的模型 */
  model: string;
  /** 提供商 */
  provider: string;
  /** 输入 Token 数量 */
  promptTokens: number;
  /** 输出 Token 数量 */
  completionTokens: number;
  /** 总 Token 数量 */
  totalTokens: number;
  /** 缓存相关 Token */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** 延迟 (毫秒) */
  latencyMs: number;
  /** 费用 (美元) */
  cost: number;
  /** 状态 */
  status: 'success' | 'error';
  /** 错误信息 */
  errorMessage?: string;
  /** 客户端 IP */
  clientIp?: string;
  /** 用户代理 */
  userAgent?: string;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 预扣费记录
 * 用于流式响应的费用预估和退还
 */
export interface PrechargeRecord {
  /** 唯一标识符 */
  id: string;
  /** 用户 ID */
  userId: string;
  /** 请求 ID */
  requestId: string;
  /** 预扣金额 */
  amount: number;
  /** 预估的输入 Token */
  estimatedInputTokens: number;
  /** 预估的输出 Token */
  estimatedOutputTokens: number;
  /** 状态: pending=进行中, settled=已结算, refunded=已退还 */
  status: 'pending' | 'settled' | 'refunded';
  /** 实际费用 (结算后填充) */
  actualCost?: number;
  /** 退还金额 */
  refundedAmount?: number;
  /** 创建时间 */
  createdAt: number;
  /** 结算时间 */
  settledAt?: number;
}

/**
 * 渠道信息
 */
export interface Channel {
  /** 渠道 ID */
  id: string;
  /** 渠道名称 */
  name: string;
  /** 提供商类型 */
  provider: 'anthropic' | 'openai' | 'google' | 'custom';
  /** API 基础 URL */
  baseUrl: string;
  /** API Key (加密存储) */
  apiKey: string;
  /** 支持的模型列表 */
  models: string[];
  /** 权重 (用于负载均衡) */
  weight: number;
  /** 优先级 (数值越小优先级越高) */
  priority: number;
  /** 是否启用 */
  isEnabled: boolean;
  /** 健康状态 */
  health: {
    isHealthy: boolean;
    lastCheckAt?: number;
    successCount: number;
    failureCount: number;
    consecutiveFailures: number;
    averageLatencyMs?: number;
  };
  /** 限流配置 */
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    currentRequests?: number;
    currentTokens?: number;
    resetAt?: number;
  };
  /** 费用倍率 (相对于官方价格) */
  costMultiplier: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 渠道选择结果
 */
export interface ChannelSelectionResult {
  /** 选中的渠道 */
  channel: Channel;
  /** 选择原因 */
  reason: 'available' | 'fallback' | 'weight_balanced';
  /** 备选渠道列表 */
  alternatives?: Channel[];
}

/**
 * 代理请求上下文
 */
export interface ProxyRequestContext {
  /** 请求 ID */
  requestId: string;
  /** 用户 ID */
  userId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 选中的渠道 */
  channel: Channel;
  /** 请求的模型 */
  model: string;
  /** 是否为流式请求 */
  isStreaming: boolean;
  /** 请求开始时间 */
  startTime: number;
  /** 预扣费记录 ID */
  prechargeId?: string;
}

/**
 * 代理响应扩展
 * 在原始响应基础上添加费用信息
 */
export interface ProxyResponseExtension {
  /** 使用量信息 */
  usage?: MessageUsage;
  /** 渠道信息 */
  channelInfo?: {
    id: string;
    name: string;
    provider: string;
  };
}

/**
 * 默认模型定价
 * 单位: 美元/百万 Token
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic 模型
  'claude-3-opus-20240229': {
    model: 'claude-3-opus-20240229',
    provider: 'anthropic',
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
    contextWindow: 200000,
  },
  'claude-3-5-sonnet-20241022': {
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    contextWindow: 200000,
  },
  'claude-3-5-haiku-20241022': {
    model: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4.0,
    contextWindow: 200000,
  },
  'claude-sonnet-4-20250514': {
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    contextWindow: 200000,
  },
  'claude-opus-4-5-20251101': {
    model: 'claude-opus-4-5-20251101',
    provider: 'anthropic',
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
    contextWindow: 200000,
  },
  // OpenAI 模型
  'gpt-4o': {
    model: 'gpt-4o',
    provider: 'openai',
    inputPricePerMillion: 5.0,
    outputPricePerMillion: 15.0,
    contextWindow: 128000,
  },
  'gpt-4o-mini': {
    model: 'gpt-4o-mini',
    provider: 'openai',
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    contextWindow: 128000,
  },
  'gpt-4-turbo': {
    model: 'gpt-4-turbo',
    provider: 'openai',
    inputPricePerMillion: 10.0,
    outputPricePerMillion: 30.0,
    contextWindow: 128000,
  },
  // Google 模型
  'gemini-1.5-pro': {
    model: 'gemini-1.5-pro',
    provider: 'google',
    inputPricePerMillion: 3.5,
    outputPricePerMillion: 10.5,
    contextWindow: 1000000,
  },
  'gemini-1.5-flash': {
    model: 'gemini-1.5-flash',
    provider: 'google',
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.3,
    contextWindow: 1000000,
  },
};

/**
 * 计算费用
 * @param model - 模型名称
 * @param inputTokens - 输入 Token 数量
 * @param outputTokens - 输出 Token 数量
 * @param costMultiplier - 费用倍率
 * @returns 费用 (美元)
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  costMultiplier: number = 1.0
): { total: number; inputCost: number; outputCost: number } {
  // 查找模型定价，如果找不到则使用默认价格
  const pricing = findModelPricing(model);

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion * costMultiplier;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion * costMultiplier;

  return {
    total: inputCost + outputCost,
    inputCost,
    outputCost,
  };
}

/**
 * 查找模型定价
 * 支持模糊匹配
 */
export function findModelPricing(model: string): ModelPricing {
  // 精确匹配
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  // 模糊匹配
  const normalizedModel = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (normalizedModel.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedModel)) {
      return pricing;
    }
  }

  // 默认定价 (使用 Claude 3.5 Sonnet 的价格作为默认)
  return {
    model,
    provider: 'unknown',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
  };
}

/**
 * 格式化费用显示
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(6)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * 格式化 Token 数量显示
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * 格式化延迟显示
 */
export function formatLatency(ms: number): string {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(1)}min`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}
