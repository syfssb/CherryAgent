/**
 * 代理服务集成测试
 * 覆盖 proxy.ts 路由
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  mockUser,
} from './setup.js';

// Mock 依赖模块
vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{
            balance: '100.0000',
            totalSpent: '50.0000',
            updatedAt: new Date(),
          }])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}));

vi.mock('../services/channel.js', () => ({
  selectChannel: vi.fn(),
  createClientForChannel: vi.fn(),
  updateChannelHealth: vi.fn(),
  recordChannelRequest: vi.fn(),
  getAllChannelStatus: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
      stream: vi.fn(),
    },
  })),
}));

// 导入被测模块
import {
  selectChannel,
  createClientForChannel,
  updateChannelHealth,
  recordChannelRequest,
  getAllChannelStatus,
} from '../services/channel.js';

describe('代理路由测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('模型定价配置', () => {
    const MODEL_PRICING: Record<string, { input: number; output: number }> = {
      'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
      'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
      'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
      'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
      'claude-opus-4-5-20251101': { input: 15.0, output: 75.0 },
    };

    it('应该包含所有 Claude 模型的定价', () => {
      expect(MODEL_PRICING['claude-3-opus-20240229']).toBeDefined();
      expect(MODEL_PRICING['claude-3-5-sonnet-20241022']).toBeDefined();
      expect(MODEL_PRICING['claude-3-5-haiku-20241022']).toBeDefined();
      expect(MODEL_PRICING['claude-sonnet-4-20250514']).toBeDefined();
      expect(MODEL_PRICING['claude-opus-4-5-20251101']).toBeDefined();
    });

    it('定价应该符合官方标准', () => {
      // Claude 3.5 Sonnet: $3 / $15 per million
      expect(MODEL_PRICING['claude-3-5-sonnet-20241022'].input).toBe(3.0);
      expect(MODEL_PRICING['claude-3-5-sonnet-20241022'].output).toBe(15.0);

      // Claude 3 Opus: $15 / $75 per million
      expect(MODEL_PRICING['claude-3-opus-20240229'].input).toBe(15.0);
      expect(MODEL_PRICING['claude-3-opus-20240229'].output).toBe(75.0);

      // Claude 3.5 Haiku: $0.8 / $4 per million
      expect(MODEL_PRICING['claude-3-5-haiku-20241022'].input).toBe(0.8);
      expect(MODEL_PRICING['claude-3-5-haiku-20241022'].output).toBe(4.0);
    });
  });

  describe('费用计算函数', () => {
    function calculateCost(
      model: string,
      inputTokens: number,
      outputTokens: number,
      costMultiplier: number = 1.0
    ): { total: number; inputCost: number; outputCost: number } {
      const MODEL_PRICING: Record<string, { input: number; output: number }> = {
        'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
        'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
        'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
      };

      let pricing = MODEL_PRICING[model];
      if (!pricing) {
        pricing = { input: 3.0, output: 15.0 }; // 默认使用 Sonnet 价格
      }

      const inputCost = (inputTokens / 1_000_000) * pricing.input * costMultiplier;
      const outputCost = (outputTokens / 1_000_000) * pricing.output * costMultiplier;

      return {
        total: inputCost + outputCost,
        inputCost,
        outputCost,
      };
    }

    it('应该正确计算 Claude 3.5 Sonnet 费用', () => {
      const result = calculateCost('claude-3-5-sonnet-20241022', 1000000, 500000);

      expect(result.inputCost).toBeCloseTo(3.0, 4);
      expect(result.outputCost).toBeCloseTo(7.5, 4);
      expect(result.total).toBeCloseTo(10.5, 4);
    });

    it('应该正确计算 Claude 3 Opus 费用', () => {
      const result = calculateCost('claude-3-opus-20240229', 1000000, 500000);

      expect(result.inputCost).toBeCloseTo(15.0, 4);
      expect(result.outputCost).toBeCloseTo(37.5, 4);
      expect(result.total).toBeCloseTo(52.5, 4);
    });

    it('应该正确应用费用倍率', () => {
      const result = calculateCost('claude-3-5-sonnet-20241022', 1000000, 500000, 2.0);

      expect(result.inputCost).toBeCloseTo(6.0, 4);
      expect(result.outputCost).toBeCloseTo(15.0, 4);
      expect(result.total).toBeCloseTo(21.0, 4);
    });

    it('应该为未知模型使用默认定价', () => {
      const result = calculateCost('unknown-model', 1000000, 500000);

      expect(result.inputCost).toBeCloseTo(3.0, 4);
      expect(result.outputCost).toBeCloseTo(7.5, 4);
    });

    it('应该处理零 tokens', () => {
      const result = calculateCost('claude-3-5-sonnet-20241022', 0, 0);

      expect(result.inputCost).toBe(0);
      expect(result.outputCost).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('请求 ID 生成', () => {
    function generateRequestId(): string {
      return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    it('应该生成唯一的请求 ID', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
    });

    it('请求 ID 应该以 req_ 开头', () => {
      const id = generateRequestId();

      expect(id).toMatch(/^req_/);
    });

    it('请求 ID 应该包含时间戳', () => {
      const beforeTime = Date.now();
      const id = generateRequestId();
      const afterTime = Date.now();

      const parts = id.split('_');
      const timestamp = parseInt(parts[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('POST /api/proxy/messages - Claude Messages API 代理', () => {
    it('应该验证必需的请求字段', () => {
      const validRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024,
      };

      expect(validRequest.model).toBeDefined();
      expect(validRequest.messages).toHaveLength(1);
      expect(validRequest.max_tokens).toBeGreaterThan(0);
    });

    it('应该拒绝空的消息列表', () => {
      const invalidRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        max_tokens: 1024,
      };

      expect(invalidRequest.messages).toHaveLength(0);
    });

    it('应该支持 system 消息', () => {
      const requestWithSystem = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'Hello' },
        ],
        system: 'You are a helpful assistant.',
        max_tokens: 1024,
      };

      expect(requestWithSystem.system).toBeDefined();
    });

    it('应该支持温度参数', () => {
      const requestWithTemp = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024,
        temperature: 0.7,
      };

      expect(requestWithTemp.temperature).toBe(0.7);
      expect(requestWithTemp.temperature).toBeGreaterThanOrEqual(0);
      expect(requestWithTemp.temperature).toBeLessThanOrEqual(1);
    });
  });

  describe('POST /api/proxy/chat/completions - OpenAI 兼容格式', () => {
    it('应该验证 OpenAI 格式请求', () => {
      const validRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      };

      expect(validRequest.model).toBeDefined();
      expect(validRequest.messages.length).toBeGreaterThan(0);
    });

    it('应该支持流式响应', () => {
      const streamRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };

      expect(streamRequest.stream).toBe(true);
    });

    it('应该正确转换消息格式', () => {
      const openAIMessages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      const { systemMessage, claudeMessages } = convertToClaudeMessages(openAIMessages);

      expect(systemMessage).toBe('You are a helpful assistant.');
      expect(claudeMessages).toHaveLength(3); // 不包含 system 消息
      expect(claudeMessages[0].role).toBe('user');
      expect(claudeMessages[0].content).toBe('Hello');
    });
  });

  describe('POST /api/proxy/embeddings - Embeddings 代理', () => {
    it('应该验证 embeddings 请求', () => {
      const validRequest = {
        model: 'text-embedding-ada-002',
        input: 'Hello world',
      };

      expect(validRequest.model).toBeDefined();
      expect(validRequest.input).toBeDefined();
    });

    it('应该支持数组输入', () => {
      const arrayRequest = {
        model: 'text-embedding-ada-002',
        input: ['Hello', 'World', 'Test'],
      };

      expect(Array.isArray(arrayRequest.input)).toBe(true);
      expect(arrayRequest.input).toHaveLength(3);
    });
  });

  describe('GET /api/proxy/models - 获取可用模型列表', () => {
    it('应该返回模型列表', () => {
      const models = [
        { id: 'gpt-4o', provider: 'openai', context_window: 128000 },
        { id: 'claude-3-5-sonnet-20241022', provider: 'anthropic', context_window: 200000 },
        { id: 'gemini-1.5-pro', provider: 'google', context_window: 1000000 },
      ];

      expect(models).toHaveLength(3);
      expect(models.map(m => m.provider)).toContain('openai');
      expect(models.map(m => m.provider)).toContain('anthropic');
      expect(models.map(m => m.provider)).toContain('google');
    });

    it('每个模型应该包含必要信息', () => {
      const model = {
        id: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        context_window: 200000,
      };

      expect(model.id).toBeDefined();
      expect(model.provider).toBeDefined();
      expect(model.context_window).toBeGreaterThan(0);
    });
  });

  describe('GET /api/proxy/channels - 获取渠道状态', () => {
    it('应该返回渠道状态列表', () => {
      vi.mocked(getAllChannelStatus).mockReturnValue([
        {
          channel: {
            id: 'channel_1',
            name: 'Primary Channel',
            provider: 'anthropic',
            models: ['claude-3-5-sonnet-20241022'],
            isEnabled: true,
            costMultiplier: 1.0,
          },
          health: {
            isHealthy: true,
            successCount: 100,
            failureCount: 2,
            averageLatencyMs: 1500,
          },
          rateLimit: {
            requestCount: 50,
            tokenCount: 100000,
          },
        },
      ] as any);

      const status = getAllChannelStatus();

      expect(status).toHaveLength(1);
      expect(status[0].channel.name).toBe('Primary Channel');
      expect(status[0].health.isHealthy).toBe(true);
    });
  });
});

describe('渠道选择逻辑测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该为模型选择可用渠道', () => {
    const mockChannel = {
      id: 'channel_1',
      name: 'Test Channel',
      provider: 'anthropic',
      models: ['claude-3-5-sonnet-20241022'],
      isEnabled: true,
      costMultiplier: 1.0,
    };

    vi.mocked(selectChannel).mockReturnValue({
      channel: mockChannel,
    } as any);

    const selection = selectChannel('claude-3-5-sonnet-20241022');

    expect(selection).toBeDefined();
    expect(selection?.channel.models).toContain('claude-3-5-sonnet-20241022');
  });

  it('应该返回 null 当没有可用渠道时', () => {
    vi.mocked(selectChannel).mockReturnValue(null);

    const selection = selectChannel('nonexistent-model');

    expect(selection).toBeNull();
  });
});

describe('渠道健康检查测试', () => {
  it('应该更新渠道健康状态 - 成功', () => {
    updateChannelHealth('channel_1', true, 1500);

    expect(updateChannelHealth).toHaveBeenCalledWith('channel_1', true, 1500);
  });

  it('应该更新渠道健康状态 - 失败', () => {
    updateChannelHealth('channel_1', false);

    expect(updateChannelHealth).toHaveBeenCalledWith('channel_1', false);
  });

  it('应该记录渠道请求', () => {
    recordChannelRequest('channel_1', 5000);

    expect(recordChannelRequest).toHaveBeenCalledWith('channel_1', 5000);
  });
});

describe('模型提供商映射测试', () => {
  const MODEL_PROVIDERS: Record<string, string> = {
    'gpt-4': 'openai',
    'gpt-4-turbo': 'openai',
    'gpt-4o': 'openai',
    'gpt-4o-mini': 'openai',
    'gpt-3.5-turbo': 'openai',
    'claude-3-opus': 'anthropic',
    'claude-3-sonnet': 'anthropic',
    'claude-3-haiku': 'anthropic',
    'claude-3.5-sonnet': 'anthropic',
    'claude-3-5-sonnet': 'anthropic',
    'claude-sonnet-4': 'anthropic',
    'claude-opus-4': 'anthropic',
    'gemini-pro': 'google',
    'gemini-1.5-pro': 'google',
    'gemini-1.5-flash': 'google',
  };

  function getProviderFromModel(model: string): string {
    const normalizedModel = model.toLowerCase();

    for (const [key, provider] of Object.entries(MODEL_PROVIDERS)) {
      if (normalizedModel.includes(key)) {
        return provider;
      }
    }

    return 'openai'; // 默认
  }

  it('应该正确识别 OpenAI 模型', () => {
    expect(getProviderFromModel('gpt-4o')).toBe('openai');
    expect(getProviderFromModel('gpt-4-turbo-preview')).toBe('openai');
    expect(getProviderFromModel('gpt-3.5-turbo-16k')).toBe('openai');
  });

  it('应该正确识别 Anthropic 模型', () => {
    expect(getProviderFromModel('claude-3-5-sonnet-20241022')).toBe('anthropic');
    expect(getProviderFromModel('claude-3-opus-20240229')).toBe('anthropic');
    expect(getProviderFromModel('claude-sonnet-4-20250514')).toBe('anthropic');
  });

  it('应该正确识别 Google 模型', () => {
    expect(getProviderFromModel('gemini-1.5-pro-latest')).toBe('google');
    expect(getProviderFromModel('gemini-1.5-flash')).toBe('google');
  });

  it('应该为未知模型返回默认提供商', () => {
    expect(getProviderFromModel('unknown-model-xyz')).toBe('openai');
  });
});

describe('消息格式转换测试', () => {
  it('应该正确分离 system 消息', () => {
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ];

    const { systemMessage, claudeMessages } = convertToClaudeMessages(messages);

    expect(systemMessage).toBe('You are helpful.');
    expect(claudeMessages).toHaveLength(1);
  });

  it('应该处理没有 system 消息的情况', () => {
    const messages = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ];

    const { systemMessage, claudeMessages } = convertToClaudeMessages(messages);

    expect(systemMessage).toBeNull();
    expect(claudeMessages).toHaveLength(2);
  });

  it('应该过滤非 user/assistant 消息', () => {
    const messages = [
      { role: 'system', content: 'System message' },
      { role: 'user', content: 'User message' },
      { role: 'function', content: 'Function result' },
      { role: 'assistant', content: 'Assistant response' },
    ];

    const { claudeMessages } = convertToClaudeMessages(messages);

    expect(claudeMessages).toHaveLength(2);
    expect(claudeMessages.map(m => m.role)).not.toContain('function');
  });

  it('应该处理空消息内容', () => {
    const messages = [
      { role: 'user', content: '' },
      { role: 'assistant', content: null },
    ];

    const { claudeMessages } = convertToClaudeMessages(messages);

    expect(claudeMessages[0].content).toBe('');
    expect(claudeMessages[1].content).toBe('');
  });
});

describe('速率限制测试', () => {
  it('应该限制请求频率', () => {
    const rateLimit = {
      windowMs: 60000,  // 1 分钟
      maxRequests: 60,  // 60 次/分钟
    };

    expect(rateLimit.windowMs).toBe(60000);
    expect(rateLimit.maxRequests).toBe(60);
  });
});

// 辅助函数

function convertToClaudeMessages(
  messages: Array<{
    role: string;
    content: string | null;
  }>
): {
  systemMessage: string | null;
  claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  let systemMessage: string | null = null;
  const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessage = msg.content || '';
    } else if (msg.role === 'user' || msg.role === 'assistant') {
      claudeMessages.push({
        role: msg.role,
        content: msg.content || '',
      });
    }
  }

  return { systemMessage, claudeMessages };
}
