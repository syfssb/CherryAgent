/**
 * 健康检查服务
 * 提供系统各个组件的健康状态检查
 */

import { pool } from '../db/index.js';
import { getChannels, type ChannelConfig } from './channel.js';
import Anthropic from '@anthropic-ai/sdk';

/**
 * 健康检查结果接口
 */
export interface HealthCheckResult {
  status: 'ok' | 'error';
  latency?: number;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * 检查数据库连接
 * 执行简单的 SELECT 1 查询来验证连接
 */
export async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const client = await pool.connect();

    try {
      const result = await client.query('SELECT 1 as health_check');
      const latency = Date.now() - start;

      if (result.rows.length > 0 && result.rows[0].health_check === 1) {
        return {
          status: 'ok',
          latency,
          details: {
            totalConnections: pool.totalCount,
            idleConnections: pool.idleCount,
            waitingClients: pool.waitingCount,
          },
        };
      }

      return {
        status: 'error',
        message: '数据库查询返回异常结果',
        latency,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    const latency = Date.now() - start;
    return {
      status: 'error',
      message: error instanceof Error ? error.message : '数据库连接失败',
      latency,
    };
  }
}

/**
 * 检查单个上游 API 渠道
 * 使用 health check 端点或简单的模型列表请求
 */
async function checkUpstreamChannel(channel: ChannelConfig): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    // 根据提供商类型执行不同的检查
    if (channel.provider === 'anthropic') {
      const client = new Anthropic({
        apiKey: channel.apiKey,
        baseURL: channel.baseUrl,
      });

      // 使用最小的请求来检查 API 可用性
      // 注意：Anthropic API 没有专门的健康检查端点，我们使用一个最小的消息请求
      await client.messages.create(
        {
          model: 'claude-3-5-haiku-20241022', // 使用最便宜的模型
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        },
        {
          timeout: 5000, // 5秒超时
        }
      );

      const latency = Date.now() - start;
      return {
        status: 'ok',
        latency,
      };
    } else if (channel.provider === 'openai') {
      // OpenAI API 检查
      const response = await fetch(`${channel.baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${channel.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      const latency = Date.now() - start;

      if (!response.ok) {
        return {
          status: 'error',
          message: `HTTP ${response.status}: ${response.statusText}`,
          latency,
        };
      }

      return {
        status: 'ok',
        latency,
      };
    } else {
      // 其他提供商，尝试基本的 HTTP 连接检查
      const response = await fetch(channel.baseUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      const latency = Date.now() - start;

      return {
        status: response.ok ? 'ok' : 'error',
        message: response.ok ? undefined : `HTTP ${response.status}`,
        latency,
      };
    }
  } catch (error) {
    const latency = Date.now() - start;

    // 处理不同类型的错误
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        return {
          status: 'error',
          message: '请求超时',
          latency,
        };
      }

      return {
        status: 'error',
        message: error.message,
        latency,
      };
    }

    return {
      status: 'error',
      message: '未知错误',
      latency,
    };
  }
}

/**
 * 检查所有上游 API 渠道
 * 返回每个渠道的健康状态
 */
export async function checkUpstreamAPIs(): Promise<Record<string, HealthCheckResult>> {
  const channels = getChannels();
  const results: Record<string, HealthCheckResult> = {};

  // 并行检查所有渠道
  await Promise.all(
    channels.map(async (channel) => {
      if (channel.isEnabled) {
        try {
          results[channel.id] = await checkUpstreamChannel(channel);
        } catch (error) {
          results[channel.id] = {
            status: 'error',
            message: error instanceof Error ? error.message : '检查失败',
          };
        }
      } else {
        results[channel.id] = {
          status: 'error',
          message: '渠道已禁用',
        };
      }
    })
  );

  return results;
}

/**
 * 执行完整的系统健康检查
 * 检查所有关键组件
 */
export interface SystemHealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  checks: {
    database: HealthCheckResult;
    upstreamAPIs: Record<string, HealthCheckResult>;
  };
}

export async function performSystemHealthCheck(version: string = '1.0.0'): Promise<SystemHealthCheck> {
  // 并行执行所有检查
  const [database, upstreamAPIs] = await Promise.all([
    checkDatabase(),
    checkUpstreamAPIs(),
  ]);

  // 确定整体健康状态
  const allUpstreamResults = Object.values(upstreamAPIs);

  // 如果数据库失败，系统不健康
  const hasCriticalFailure = database.status === 'error';

  // 如果所有上游 API 都失败，系统不健康
  const allUpstreamsFailed = allUpstreamResults.length > 0 &&
                             allUpstreamResults.every(check => check.status === 'error');

  // 如果部分上游 API 失败，系统降级
  const someUpstreamsFailed = allUpstreamResults.some(check => check.status === 'error');

  let status: 'healthy' | 'degraded' | 'unhealthy';

  if (hasCriticalFailure || allUpstreamsFailed) {
    status = 'unhealthy';
  } else if (someUpstreamsFailed) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    version,
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    checks: {
      database,
      upstreamAPIs,
    },
  };
}
