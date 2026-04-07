/**
 * 渠道服务
 * 管理 API 渠道选择、健康检查和负载均衡
 */

import { env } from '../utils/env.js';
import { pool } from '../db/index.js';
import { decrypt } from '../utils/crypto.js';

/**
 * 渠道健康状态
 */
interface ChannelHealth {
  isHealthy: boolean;
  lastCheckAt: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  averageLatencyMs: number;
  latencyHistory: number[];
}

/**
 * 渠道配置
 */
export interface ChannelConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  weight: number;
  priority: number;
  isEnabled: boolean;
  costMultiplier: number;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

/**
 * 过滤渠道敏感字段，用于安全日志输出
 */
export function sanitizeChannel(channel: ChannelConfig): Omit<ChannelConfig, 'apiKey'> & { apiKey?: undefined } {
  const { apiKey: _, ...safe } = channel;
  return safe;
}

/**
 * 渠道选择结果
 */
export interface ChannelSelectionResult {
  channel: ChannelConfig;
  reason: 'available' | 'fallback' | 'weight_balanced' | 'only_available';
}

/**
 * 内存中的渠道健康状态
 */
const channelHealthMap = new Map<string, ChannelHealth>();

/**
 * 渠道客户端缓存（保留接口兼容，实际不再使用 Anthropic SDK 客户端）
 */
const clientCache = new Map<string, unknown>();

/**
 * 渠道限流状态
 */
const rateLimitState = new Map<string, {
  requestCount: number;
  tokenCount: number;
  resetAt: number;
}>();

/**
 * 数据库渠道缓存
 * 启动时加载，定期刷新
 */
let dbChannelsCache: ChannelConfig[] = [];
const DB_CHANNELS_REFRESH_MS = 60000; // 60 秒刷新一次

/**
 * 将数据库 provider 字符串保留原始值
 */
function mapProvider(provider: string): string {
  return provider;
}

/**
 * 从数据库加载渠道配置到缓存
 */
export async function loadChannelsFromDb(): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT id, name, provider, base_url, api_key_encrypted, model_mapping,
              weight, priority, rpm_limit, tpm_limit, price_multiplier, is_enabled
       FROM channels WHERE is_enabled = true`
    );

    const channels: ChannelConfig[] = [];

    for (const row of result.rows) {
      try {
        const apiKey = decrypt(row.api_key_encrypted);
        if (!apiKey) {
          console.warn(`[Channel] 渠道 ${row.name} API Key 解密失败，跳过`);
          continue;
        }

        // 从 model_mapping 提取模型列表
        const modelMapping = row.model_mapping || {};
        const models = Object.keys(modelMapping);
        if (models.length === 0) {
          console.warn(`[Channel] 渠道 ${row.name} 没有配置模型，跳过`);
          continue;
        }

        channels.push({
          id: row.id,
          name: row.name,
          provider: mapProvider(row.provider),
          baseUrl: row.base_url,
          apiKey,
          models,
          weight: row.weight || 100,
          priority: row.priority || 0,
          isEnabled: row.is_enabled,
          costMultiplier: parseFloat(row.price_multiplier) || 1.0,
          ...(row.rpm_limit || row.tpm_limit
            ? {
                rateLimit: {
                  requestsPerMinute: row.rpm_limit || 0,
                  tokensPerMinute: row.tpm_limit || 0,
                },
              }
            : {}),
        });
      } catch (err) {
        console.error(`[Channel] 加载渠道 ${row.name} 失败:`, err);
      }
    }

    dbChannelsCache = channels;
    console.log(`[Channel] 从数据库加载了 ${channels.length} 个渠道`);
  } catch (err) {
    console.error('[Channel] 从数据库加载渠道失败:', err);
  }
}

/**
 * 主动刷新渠道缓存（供管理后台 CRUD 后调用）
 */
export const refreshChannelCache = loadChannelsFromDb;

// 启动时加载，并设置定期刷新
loadChannelsFromDb().catch(() => {});
setInterval(() => {
  loadChannelsFromDb().catch(() => {});
}, DB_CHANNELS_REFRESH_MS);

/**
 * 最大连续失败次数
 * 超过此值将标记渠道为不健康
 */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * 健康恢复时间 (毫秒)
 * 不健康的渠道在此时间后可以重新尝试
 */
const HEALTH_RECOVERY_MS = 60000;

/**
 * 延迟历史记录长度
 */
const LATENCY_HISTORY_LENGTH = 10;

/**
 * 获取所有配置的渠道
 * 从环境变量或数据库加载
 */
export function getChannels(): ChannelConfig[] {
  // 从环境变量加载默认渠道 (作为兜底)
  const envChannels: ChannelConfig[] = [];

  // Anthropic 官方渠道
  if (env.ANTHROPIC_API_KEY) {
    envChannels.push({
      id: 'anthropic-official',
      name: 'Anthropic Official',
      provider: env.ANTHROPIC_PROVIDER_NAME || 'anthropic',
      baseUrl: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      apiKey: env.ANTHROPIC_API_KEY,
      models: [
        'claude-3-opus-20240229',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-sonnet-4-20250514',
        'claude-opus-4-5-20251101',
      ],
      weight: 100,
      priority: 1,
      isEnabled: true,
      costMultiplier: 1.0,
      rateLimit: {
        requestsPerMinute: 60,
        tokensPerMinute: 100000,
      },
    });
  }

  // 第三方代理渠道 (如果配置了)
  if (env.PROXY_API_KEY && env.PROXY_BASE_URL) {
    const proxyModels = env.PROXY_MODELS
      ? env.PROXY_MODELS.split(',').map((m) => m.trim()).filter(Boolean)
      : [
          'claude-3-opus-20240229',
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-sonnet-4-20250514',
          'claude-opus-4-5-20251101',
        ];

    envChannels.push({
      id: 'proxy-channel',
      name: 'Proxy Channel',
      provider: env.PROXY_PROVIDER_NAME || 'anthropic',
      baseUrl: env.PROXY_BASE_URL,
      apiKey: env.PROXY_API_KEY,
      models: proxyModels,
      weight: 50,
      priority: 2,
      isEnabled: true,
      costMultiplier: parseFloat(env.PROXY_COST_MULTIPLIER || '0.8'),
    });
  }

  // OpenAI 渠道
  if (env.OPENAI_API_KEY) {
    envChannels.push({
      id: 'openai-official',
      name: 'OpenAI Official',
      provider: env.OPENAI_PROVIDER_NAME || 'openai',
      baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com',
      apiKey: env.OPENAI_API_KEY,
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      weight: 100,
      priority: 1,
      isEnabled: true,
      costMultiplier: 1.0,
    });
  }

  // 数据库渠道优先，环境变量渠道作为补充
  // 去重：如果数据库渠道已覆盖某模型，环境变量渠道仍保留（通过优先级和权重选择）
  return [...dbChannelsCache, ...envChannels];
}

/**
 * 初始化渠道健康状态
 */
function initChannelHealth(channelId: string): ChannelHealth {
  const health: ChannelHealth = {
    isHealthy: true,
    lastCheckAt: Date.now(),
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
    averageLatencyMs: 0,
    latencyHistory: [],
  };
  channelHealthMap.set(channelId, health);
  return health;
}

/**
 * 获取渠道健康状态
 */
export function getChannelHealth(channelId: string): ChannelHealth {
  let health = channelHealthMap.get(channelId);
  if (!health) {
    health = initChannelHealth(channelId);
  }
  return health;
}

/**
 * 更新渠道健康状态
 * @param channelId - 渠道 ID
 * @param success - 请求是否成功
 * @param latencyMs - 请求延迟 (毫秒)
 */
export function updateChannelHealth(
  channelId: string,
  success: boolean,
  latencyMs?: number
): void {
  let health = channelHealthMap.get(channelId);
  if (!health) {
    health = initChannelHealth(channelId);
  }

  health.lastCheckAt = Date.now();

  if (success) {
    health.successCount++;
    health.consecutiveFailures = 0;
    health.isHealthy = true;

    // 更新延迟统计
    if (latencyMs !== undefined) {
      health.latencyHistory.push(latencyMs);
      if (health.latencyHistory.length > LATENCY_HISTORY_LENGTH) {
        health.latencyHistory.shift();
      }
      health.averageLatencyMs =
        health.latencyHistory.reduce((a, b) => a + b, 0) / health.latencyHistory.length;
    }
  } else {
    health.failureCount++;
    health.consecutiveFailures++;

    // 连续失败超过阈值，标记为不健康
    if (health.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      health.isHealthy = false;
    }
  }

  channelHealthMap.set(channelId, health);
}

/**
 * 检查渠道是否可用
 * @param channel - 渠道配置
 * @returns 是否可用
 */
function isChannelAvailable(channel: ChannelConfig): boolean {
  if (!channel.isEnabled) {
    return false;
  }

  const health = getChannelHealth(channel.id);

  // 如果不健康，检查是否已过恢复时间
  if (!health.isHealthy) {
    const timeSinceLastCheck = Date.now() - health.lastCheckAt;
    if (timeSinceLastCheck < HEALTH_RECOVERY_MS) {
      return false;
    }
    // 恢复时间已过，允许重试
    health.isHealthy = true;
    health.consecutiveFailures = 0;
    channelHealthMap.set(channel.id, health);
  }

  // 检查限流
  const rateState = rateLimitState.get(channel.id);
  if (rateState && channel.rateLimit) {
    if (Date.now() < rateState.resetAt) {
      if (rateState.requestCount >= channel.rateLimit.requestsPerMinute) {
        return false;
      }
    } else {
      // 重置限流计数
      rateLimitState.delete(channel.id);
    }
  }

  return true;
}

/**
 * 检查渠道是否支持指定模型
 * @param channel - 渠道配置
 * @param model - 模型名称
 * @returns 是否支持
 */
function supportsModel(channel: ChannelConfig, model: string): boolean {
  // 精确匹配
  if (channel.models.includes(model)) {
    return true;
  }

  // 模糊匹配：只允许渠道支持的模型以用户请求的模型开头，并且后缀是日期版本号
  // 例如：用户请求 claude-3-5-sonnet，渠道支持 claude-3-5-sonnet-20241022 ✓
  // 例如：用户请求 gpt-4o，渠道支持 gpt-4o-mini ✗（后缀不是日期）
  const normalizedModel = model.toLowerCase();
  return channel.models.some((m) => {
    const normalizedChannelModel = m.toLowerCase();

    // 检查渠道模型是否以用户请求的模型开头
    if (normalizedChannelModel.startsWith(normalizedModel)) {
      const suffix = normalizedChannelModel.substring(normalizedModel.length);
      // 如果后缀为空（精确匹配）或者是日期版本号（-YYYYMMDD），则匹配成功
      return suffix === '' || /^-\d{8}$/.test(suffix);
    }

    return false;
  });
}

/**
 * 选择最优渠道
 * @param model - 请求的模型
 * @returns 选择结果
 */
export function selectChannel(model: string): ChannelSelectionResult | null {
  const channels = getChannels();

  // 过滤支持该模型且可用的渠道
  const availableChannels = channels.filter(
    (c) => supportsModel(c, model) && isChannelAvailable(c)
  );

  if (availableChannels.length === 0) {
    // 没有可用渠道，尝试使用任何支持该模型的渠道 (即使不健康)
    const fallbackChannels = channels.filter((c) => supportsModel(c, model) && c.isEnabled);
    if (fallbackChannels.length > 0) {
      // 按优先级排序
      fallbackChannels.sort((a, b) => a.priority - b.priority);
      return {
        channel: fallbackChannels[0]!,
        reason: 'fallback',
      };
    }
    return null;
  }

  if (availableChannels.length === 1) {
    return {
      channel: availableChannels[0]!,
      reason: 'only_available',
    };
  }

  // 多个可用渠道，使用加权随机选择
  // 首先按优先级分组
  const byPriority = new Map<number, ChannelConfig[]>();
  for (const channel of availableChannels) {
    const priority = channel.priority;
    if (!byPriority.has(priority)) {
      byPriority.set(priority, []);
    }
    byPriority.get(priority)!.push(channel);
  }

  // 选择最高优先级的组
  const priorities = Array.from(byPriority.keys()).sort((a, b) => a - b);
  const topPriorityChannels = byPriority.get(priorities[0]!)!;

  if (topPriorityChannels.length === 1) {
    return {
      channel: topPriorityChannels[0]!,
      reason: 'available',
    };
  }

  // 在同优先级中进行加权随机选择
  const totalWeight = topPriorityChannels.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;

  for (const channel of topPriorityChannels) {
    random -= channel.weight;
    if (random <= 0) {
      return {
        channel,
        reason: 'weight_balanced',
      };
    }
  }

  // 兜底返回第一个
  return {
    channel: topPriorityChannels[0]!,
    reason: 'available',
  };
}

/**
 * 获取渠道客户端配置
 * @param channelId - 渠道 ID
 * @returns 渠道配置（用于适配器层创建实际客户端），不再返回特定 SDK 实例
 * @deprecated 请直接使用 selectChannel + ProviderRegistry 适配器
 */
export function getChannelClient(channelId: string): ChannelConfig | null {
  // 查找渠道配置
  const channels = getChannels();
  const channel = channels.find((c) => c.id === channelId);
  if (!channel) {
    return null;
  }

  return channel;
}

/**
 * 根据渠道配置获取渠道信息
 * @param channel - 渠道配置
 * @returns 渠道配置本身（适配器层负责创建实际客户端）
 * @deprecated 请直接使用 selectChannel + ProviderRegistry 适配器
 */
export function createClientForChannel(channel: ChannelConfig): ChannelConfig | null {
  return channel;
}

/**
 * 记录渠道请求
 * 用于限流统计
 */
export function recordChannelRequest(
  channelId: string,
  tokenCount: number = 0
): void {
  const channels = getChannels();
  const channel = channels.find((c) => c.id === channelId);
  if (!channel?.rateLimit) {
    return;
  }

  let state = rateLimitState.get(channelId);
  if (!state || Date.now() >= state.resetAt) {
    state = {
      requestCount: 0,
      tokenCount: 0,
      resetAt: Date.now() + 60000, // 1 分钟后重置
    };
  }

  state.requestCount++;
  state.tokenCount += tokenCount;
  rateLimitState.set(channelId, state);
}

/**
 * 获取所有渠道状态
 */
export function getAllChannelStatus(): Array<{
  channel: ChannelConfig;
  health: ChannelHealth;
  rateLimit?: { requestCount: number; tokenCount: number; resetAt: number };
}> {
  const channels = getChannels();
  return channels.map((channel) => ({
    channel,
    health: getChannelHealth(channel.id),
    rateLimit: rateLimitState.get(channel.id),
  }));
}

/**
 * 重置渠道健康状态
 * 用于管理员手动重置
 */
export function resetChannelHealth(channelId: string): void {
  channelHealthMap.delete(channelId);
  rateLimitState.delete(channelId);
}

/**
 * 清除所有客户端缓存
 */
export function clearClientCache(): void {
  clientCache.clear();
}
