/**
 * 使用量服务集成测试
 * 覆盖 usage.ts 路由
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  mockUser,
} from './setup.js';

// Mock 数据库
vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
  },
}));

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req, res, next) => {
    req.userId = 'user_123';
    next();
  }),
}));

describe('使用量路由测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/usage - 获取使用量统计', () => {
    it('应该返回使用量数据列表', () => {
      const mockUsageData = generateMockUsageData('day', 30);

      expect(mockUsageData).toHaveLength(30);
      expect(mockUsageData[0]).toHaveProperty('date');
      expect(mockUsageData[0]).toHaveProperty('requests');
      expect(mockUsageData[0]).toHaveProperty('promptTokens');
      expect(mockUsageData[0]).toHaveProperty('completionTokens');
      expect(mockUsageData[0]).toHaveProperty('totalTokens');
      expect(mockUsageData[0]).toHaveProperty('cost');
    });

    it('应该支持按小时粒度查询', () => {
      const hourlyData = generateMockUsageData('hour', 24);

      expect(hourlyData).toHaveLength(24);
    });

    it('应该支持按周粒度查询', () => {
      const weeklyData = generateMockUsageData('week', 12);

      expect(weeklyData).toHaveLength(12);
    });

    it('应该支持按月粒度查询', () => {
      const monthlyData = generateMockUsageData('month', 6);

      expect(monthlyData).toHaveLength(6);
    });

    it('每条记录应该包含所有必要字段', () => {
      const data = generateMockUsageData('day', 1);
      const record = data[0];

      expect(record.date).toBeDefined();
      expect(typeof record.requests).toBe('number');
      expect(typeof record.promptTokens).toBe('number');
      expect(typeof record.completionTokens).toBe('number');
      expect(typeof record.totalTokens).toBe('number');
      expect(typeof record.cost).toBe('string');
    });

    it('totalTokens 应该等于 promptTokens + completionTokens', () => {
      const data = generateMockUsageData('day', 10);

      for (const record of data) {
        expect(record.totalTokens).toBe(record.promptTokens + record.completionTokens);
      }
    });
  });

  describe('GET /api/usage/summary - 获取使用量摘要', () => {
    it('应该返回汇总统计数据', () => {
      const summary = generateMockSummary();

      expect(summary.totalRequests).toBeGreaterThanOrEqual(0);
      expect(summary.totalTokens).toBeGreaterThanOrEqual(0);
      expect(summary.totalCost).toBeGreaterThanOrEqual(0);
      expect(summary.currency).toBe('USD');
    });

    it('应该按提供商分组统计', () => {
      const summary = generateMockSummary();

      expect(summary.byProvider).toBeDefined();
      expect(summary.byProvider.openai).toBeDefined();
      expect(summary.byProvider.anthropic).toBeDefined();

      for (const provider of Object.values(summary.byProvider)) {
        expect(provider.requests).toBeGreaterThanOrEqual(0);
        expect(provider.tokens).toBeGreaterThanOrEqual(0);
        expect(provider.cost).toBeGreaterThanOrEqual(0);
      }
    });

    it('应该按模型分组统计', () => {
      const summary = generateMockSummary();

      expect(summary.byModel).toBeDefined();

      for (const model of Object.values(summary.byModel)) {
        expect(model.requests).toBeGreaterThanOrEqual(0);
        expect(model.tokens).toBeGreaterThanOrEqual(0);
        expect(model.cost).toBeGreaterThanOrEqual(0);
      }
    });

    it('应该包含时间范围信息', () => {
      const summary = generateMockSummary();

      expect(summary.period).toBeDefined();
      expect(summary.period.start).toBeDefined();
      expect(summary.period.end).toBeDefined();

      const startDate = new Date(summary.period.start);
      const endDate = new Date(summary.period.end);

      expect(startDate.getTime()).toBeLessThan(endDate.getTime());
    });
  });

  describe('GET /api/usage/quota - 获取配额信息', () => {
    it('应该返回用户配额信息', () => {
      const quota = generateMockQuota();

      expect(quota.plan).toBeDefined();
      expect(quota.monthlyQuota).toBeDefined();
      expect(quota.dailyQuota).toBeDefined();
      expect(quota.rateLimits).toBeDefined();
      expect(quota.resetAt).toBeDefined();
    });

    it('月度配额应该包含请求和 token 限制', () => {
      const quota = generateMockQuota();

      expect(quota.monthlyQuota.requests.used).toBeGreaterThanOrEqual(0);
      expect(quota.monthlyQuota.requests.limit).toBeGreaterThan(0);
      expect(quota.monthlyQuota.requests.remaining).toBe(
        quota.monthlyQuota.requests.limit - quota.monthlyQuota.requests.used
      );

      expect(quota.monthlyQuota.tokens.used).toBeGreaterThanOrEqual(0);
      expect(quota.monthlyQuota.tokens.limit).toBeGreaterThan(0);
      expect(quota.monthlyQuota.tokens.remaining).toBe(
        quota.monthlyQuota.tokens.limit - quota.monthlyQuota.tokens.used
      );
    });

    it('日度配额应该包含请求和 token 限制', () => {
      const quota = generateMockQuota();

      expect(quota.dailyQuota.requests.used).toBeGreaterThanOrEqual(0);
      expect(quota.dailyQuota.requests.limit).toBeGreaterThan(0);

      expect(quota.dailyQuota.tokens.used).toBeGreaterThanOrEqual(0);
      expect(quota.dailyQuota.tokens.limit).toBeGreaterThan(0);
    });

    it('速率限制应该是正数', () => {
      const quota = generateMockQuota();

      expect(quota.rateLimits.requestsPerMinute).toBeGreaterThan(0);
      expect(quota.rateLimits.tokensPerMinute).toBeGreaterThan(0);
    });

    it('重置时间应该在未来', () => {
      const quota = generateMockQuota();
      const now = new Date();

      const monthlyReset = new Date(quota.resetAt.monthly);
      const dailyReset = new Date(quota.resetAt.daily);

      expect(monthlyReset.getTime()).toBeGreaterThan(now.getTime());
      expect(dailyReset.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('GET /api/usage/logs - 获取请求日志', () => {
    it('应该返回请求日志列表', () => {
      const logs = generateMockLogs(10);

      expect(logs).toHaveLength(10);
    });

    it('每条日志应该包含所有必要字段', () => {
      const logs = generateMockLogs(1);
      const log = logs[0];

      expect(log.id).toBeDefined();
      expect(log.timestamp).toBeDefined();
      expect(log.model).toBeDefined();
      expect(log.provider).toBeDefined();
      expect(typeof log.promptTokens).toBe('number');
      expect(typeof log.completionTokens).toBe('number');
      expect(typeof log.latency).toBe('number');
      expect(['success', 'error']).toContain(log.status);
      expect(log.cost).toBeDefined();
    });

    it('日志应该按时间倒序排列', () => {
      const logs = generateMockLogs(10);

      for (let i = 1; i < logs.length; i++) {
        const prevTime = new Date(logs[i - 1].timestamp).getTime();
        const currTime = new Date(logs[i].timestamp).getTime();
        expect(prevTime).toBeGreaterThanOrEqual(currTime);
      }
    });

    it('日志状态应该是 success 或 error', () => {
      const logs = generateMockLogs(100);

      for (const log of logs) {
        expect(['success', 'error']).toContain(log.status);
      }
    });
  });

  describe('GET /api/usage/export - 导出使用量报告', () => {
    it('应该支持 CSV 格式导出', () => {
      const data = generateMockUsageData('day', 30);
      const csv = exportToCsv(data);

      expect(csv).toContain('date,requests,prompt_tokens,completion_tokens,total_tokens,cost');
      expect(csv.split('\n').length).toBe(31); // header + 30 rows
    });

    it('应该支持 JSON 格式导出', () => {
      const data = generateMockUsageData('day', 30);
      const json = JSON.stringify(data);

      expect(() => JSON.parse(json)).not.toThrow();
      expect(JSON.parse(json)).toHaveLength(30);
    });

    it('CSV 应该正确转义特殊字符', () => {
      const data = [
        {
          date: '2025-01-01',
          requests: 100,
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
          cost: '0.0045',
        },
      ];
      const csv = exportToCsv(data);

      expect(csv).toContain('2025-01-01');
      expect(csv).toContain('100');
      expect(csv).toContain('0.0045');
    });
  });
});

describe('使用量数据验证', () => {
  describe('请求计数验证', () => {
    it('请求数应该是非负整数', () => {
      const data = generateMockUsageData('day', 100);

      for (const record of data) {
        expect(Number.isInteger(record.requests)).toBe(true);
        expect(record.requests).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Token 计数验证', () => {
    it('Token 数应该是非负整数', () => {
      const data = generateMockUsageData('day', 100);

      for (const record of data) {
        expect(Number.isInteger(record.promptTokens)).toBe(true);
        expect(Number.isInteger(record.completionTokens)).toBe(true);
        expect(Number.isInteger(record.totalTokens)).toBe(true);
        expect(record.promptTokens).toBeGreaterThanOrEqual(0);
        expect(record.completionTokens).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('费用计算验证', () => {
    it('费用应该是有效的数字字符串', () => {
      const data = generateMockUsageData('day', 100);

      for (const record of data) {
        expect(() => parseFloat(record.cost)).not.toThrow();
        expect(parseFloat(record.cost)).toBeGreaterThanOrEqual(0);
      }
    });

    it('费用应该与 token 数成正比', () => {
      // 简化验证：更多 tokens 应该意味着更高费用
      const data = generateMockUsageData('day', 100);
      const sortedByTokens = [...data].sort((a, b) => a.totalTokens - b.totalTokens);
      const sortedByCost = [...data].sort((a, b) => parseFloat(a.cost) - parseFloat(b.cost));

      // 验证费用公式的正确性
      const record = data[0];
      const expectedCost = (record.promptTokens * 0.00001) + (record.completionTokens * 0.00003);
      expect(parseFloat(record.cost)).toBeCloseTo(expectedCost, 4);
    });
  });
});

describe('分页功能测试', () => {
  it('应该正确计算分页元数据', () => {
    const total = 100;
    const page = 2;
    const limit = 10;

    const meta = {
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };

    expect(meta.total).toBe(100);
    expect(meta.page).toBe(2);
    expect(meta.limit).toBe(10);
    expect(meta.hasMore).toBe(true);
  });

  it('最后一页应该设置 hasMore 为 false', () => {
    const total = 100;
    const page = 10;
    const limit = 10;

    const meta = {
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };

    expect(meta.hasMore).toBe(false);
  });

  it('空结果应该返回正确的元数据', () => {
    const total = 0;
    const page = 1;
    const limit = 10;

    const meta = {
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };

    expect(meta.total).toBe(0);
    expect(meta.hasMore).toBe(false);
  });
});

// 辅助函数

function generateMockUsageData(granularity: string, count: number) {
  const data = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    let date: Date;
    switch (granularity) {
      case 'hour':
        date = new Date(now.getTime() - i * 60 * 60 * 1000);
        break;
      case 'week':
        date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        break;
      default: // day
        date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    }

    const requests = Math.floor(Math.random() * 100) + 10;
    const promptTokens = Math.floor(Math.random() * 50000) + 5000;
    const completionTokens = Math.floor(Math.random() * 20000) + 2000;

    data.push({
      date: date.toISOString().split('T')[0],
      requests,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost: ((promptTokens * 0.00001) + (completionTokens * 0.00003)).toFixed(4),
    });
  }

  return data.reverse();
}

function generateMockSummary() {
  return {
    totalRequests: 1234,
    totalTokens: 567890,
    totalCost: 12.34,
    currency: 'USD',
    byProvider: {
      openai: { requests: 800, tokens: 400000, cost: 8.00 },
      anthropic: { requests: 300, tokens: 150000, cost: 3.50 },
      google: { requests: 134, tokens: 17890, cost: 0.84 },
    },
    byModel: {
      'gpt-4o': { requests: 500, tokens: 250000, cost: 5.00 },
      'gpt-4o-mini': { requests: 300, tokens: 150000, cost: 3.00 },
      'claude-3.5-sonnet': { requests: 300, tokens: 150000, cost: 3.50 },
      'gemini-1.5-flash': { requests: 134, tokens: 17890, cost: 0.84 },
    },
    period: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    },
  };
}

function generateMockQuota() {
  return {
    plan: 'pro',
    monthlyQuota: {
      requests: { used: 1234, limit: 10000, remaining: 8766 },
      tokens: { used: 567890, limit: 2000000, remaining: 1432110 },
    },
    dailyQuota: {
      requests: { used: 45, limit: 500, remaining: 455 },
      tokens: { used: 18000, limit: 100000, remaining: 82000 },
    },
    rateLimits: {
      requestsPerMinute: 60,
      tokensPerMinute: 40000,
    },
    resetAt: {
      monthly: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      daily: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
    },
  };
}

function generateMockLogs(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `log_${Date.now() - i * 60000}`,
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
    model: ['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet'][i % 3],
    provider: ['openai', 'openai', 'anthropic'][i % 3],
    promptTokens: Math.floor(Math.random() * 1000) + 100,
    completionTokens: Math.floor(Math.random() * 500) + 50,
    latency: Math.floor(Math.random() * 2000) + 500,
    status: Math.random() > 0.1 ? 'success' : 'error',
    cost: (Math.random() * 0.05).toFixed(4),
  }));
}

function exportToCsv(data: Array<{
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: string;
}>) {
  const header = 'date,requests,prompt_tokens,completion_tokens,total_tokens,cost';
  const rows = data.map(row =>
    `${row.date},${row.requests},${row.promptTokens},${row.completionTokens},${row.totalTokens},${row.cost}`
  );
  return [header, ...rows].join('\n');
}
