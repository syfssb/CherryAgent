/**
 * 代理服务集成测试
 *
 * 测试代理客户端、适配器和 runner 的集成
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getProxyConfig,
  checkProxyHealth,
  proxyRequest,
  getUserBalance,
  UnauthenticatedError,
  InsufficientBalanceError,
  RateLimitError,
  ServiceUnavailableError,
} from '../libs/proxy-client.js';
import {
  shouldUseProxy,
  getProxyApiConfig,
  buildProxyEnv,
  getProxyErrorMessage,
} from '../libs/proxy-adapter.js';

// Mock 相关模块
vi.mock('../libs/secure-storage.js', () => ({
  getToken: vi.fn(),
  saveToken: vi.fn(),
}));

vi.mock('../libs/auth-service.js', () => ({
  getAccessToken: vi.fn(),
}));

describe('代理服务集成测试', () => {
  const originalEnv = {
    VITE_PROXY_BASE_URL: process.env.VITE_PROXY_BASE_URL,
    VITE_API_BASE_URL: process.env.VITE_API_BASE_URL,
    VITE_PROXY_API_KEY: process.env.VITE_PROXY_API_KEY,
    PROXY_API_KEY: process.env.PROXY_API_KEY,
    VITE_DEFAULT_MODEL: process.env.VITE_DEFAULT_MODEL,
  };

  beforeEach(() => {
    // 重置环境变量
    process.env.VITE_PROXY_BASE_URL = 'http://localhost:3000';
    process.env.VITE_API_BASE_URL = 'http://localhost:3000';
    process.env.VITE_PROXY_API_KEY = '';
    process.env.PROXY_API_KEY = '';
    process.env.VITE_DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
  });

  afterEach(() => {
    const keys = Object.keys(originalEnv) as Array<keyof typeof originalEnv>;
    keys.forEach((key) => {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  describe('ProxyClient - 代理客户端', () => {
    it('应该能获取代理配置', () => {
      const config = getProxyConfig();

      expect(config).toBeDefined();
      expect(config.baseURL).toBe('http://localhost:3000');
      expect(config.timeout).toBe(120000);
    });

    it('应该能检查服务健康状态', async () => {
      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      const health = await checkProxyHealth();

      expect(health.available).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });

    it('应该能处理服务不可用的情况', async () => {
      // Mock fetch error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const health = await checkProxyHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain('Network');
    });

    it('应该能处理 401 未认证错误', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            type: 'unauthenticated',
            message: '未登录',
          },
        }),
      });

      await expect(
        proxyRequest('/api/proxy/messages', {
          method: 'POST',
          body: { model: 'claude-3-5-sonnet', messages: [] },
        })
      ).rejects.toThrow(UnauthenticatedError);
    });

    it('应该能处理 402 余额不足错误', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        json: async () => ({
          error: {
            type: 'insufficient_balance',
            message: '余额不足',
            current_balance: 100,
            required_amount: 500,
          },
        }),
      });

      await expect(
        proxyRequest('/api/proxy/messages', {
          method: 'POST',
          body: { model: 'claude-3-5-sonnet', messages: [] },
          config: { baseURL: 'http://localhost:3000', apiKey: 'sk-test' },
        })
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it('应该能处理 429 速率限制错误', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            type: 'rate_limit_exceeded',
            message: '请求过于频繁',
            retry_after: 60,
          },
        }),
      });

      await expect(
        proxyRequest('/api/proxy/messages', {
          method: 'POST',
          body: { model: 'claude-3-5-sonnet', messages: [] },
          config: { baseURL: 'http://localhost:3000', apiKey: 'sk-test' },
        })
      ).rejects.toThrow(RateLimitError);
    });

  });

  describe('ProxyAdapter - SDK 适配器', () => {
    it('应该能判断是否使用代理模式', async () => {
      const { getToken } = await import('../libs/secure-storage.js');
      const { getAccessToken } = await import('../libs/auth-service.js');

      // Mock API Key 存在
      vi.mocked(getToken).mockReturnValue('test-jwt-token-123');

      const useProxy = await shouldUseProxy();
      expect(useProxy).toBe(true);
    });

    it('应该能获取代理配置', async () => {
      const { getToken } = await import('../libs/secure-storage.js');

      vi.mocked(getToken).mockReturnValue('test-jwt-token-123');

      const config = await getProxyApiConfig();

      expect(config).toBeDefined();
      expect(config?.apiKey).toBe('test-jwt-token-123');
      expect(config?.baseURL).toContain('/api/proxy');
      expect(config?.isProxy).toBe(true);
    });

    it('应该能构建代理环境变量', async () => {
      const { getToken } = await import('../libs/secure-storage.js');

      vi.mocked(getToken).mockReturnValue('test-jwt-token-123');

      const env = await buildProxyEnv();

      expect(env.ANTHROPIC_BASE_URL).toContain('/api/proxy');
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe('test-jwt-token-123');
    });

    it('应该能提供友好的错误消息', () => {
      const unauthError = new UnauthenticatedError();
      const message1 = getProxyErrorMessage(unauthError);
      expect(message1).toContain('登录');

      const balanceError = new InsufficientBalanceError('余额不足', 100, 500);
      const message2 = getProxyErrorMessage(balanceError);
      expect(message2).toContain('余额不足');

      const rateLimitError = new RateLimitError('请求过于频繁', 60);
      const message3 = getProxyErrorMessage(rateLimitError);
      expect(message3).toContain('频繁');
    });
  });

  describe('Runner 集成', () => {
    it('应该能在代理模式下运行 Claude 查询', async () => {
      const { getCurrentApiConfig, buildEnvForConfig } = await import(
        '../libs/claude-settings.js'
      );
      const { getToken } = await import('../libs/secure-storage.js');

      // Mock API Key
      vi.mocked(getToken).mockReturnValue('test-jwt-token-123');

      const config = await getCurrentApiConfig();
      expect(config).toBeDefined();

      if (config) {
        const env = await buildEnvForConfig(config);
        expect(env.ANTHROPIC_BASE_URL).toContain('/api/proxy');
        expect(env.ANTHROPIC_AUTH_TOKEN).toBe('test-jwt-token-123');
      }
    });

    it('应该在未登录时提示登录', async () => {
      const { getCurrentApiConfig } = await import('../libs/claude-settings.js');
      const { getToken } = await import('../libs/secure-storage.js');
      const { getAccessToken } = await import('../libs/auth-service.js');

      // Mock 未登录状态
      vi.mocked(getToken).mockReturnValue(null);
      vi.mocked(getAccessToken).mockResolvedValue(null);

      const config = await getCurrentApiConfig();
      expect(config).toBeNull();
    });
  });

  describe('错误处理流程', () => {
    it('应该能正确识别和处理不同类型的错误', async () => {
      const errors = [
        new UnauthenticatedError(),
        new InsufficientBalanceError('余额不足', 100, 500),
        new RateLimitError('请求过于频繁', 60),
        new ServiceUnavailableError(),
      ];

      for (const error of errors) {
        const message = getProxyErrorMessage(error);
        expect(message).toBeDefined();
        expect(message.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('端到端场景测试', () => {
  it('完整流程: 登录 -> 获取配置 -> 运行查询', async () => {
    // 1. Mock 登录成功
    const { getToken, saveToken } = await import('../libs/secure-storage.js');
    vi.mocked(saveToken).mockImplementation(() => {});
    vi.mocked(getToken).mockReturnValue('test-jwt-token-123');

    // 2. 获取配置
    const { getCurrentApiConfig } = await import('../libs/claude-settings.js');
    const config = await getCurrentApiConfig();
    expect(config).toBeDefined();
    expect('isProxy' in config! && config.isProxy).toBe(true);

    // 3. 构建环境变量
    const { buildEnvForConfig } = await import('../libs/claude-settings.js');
    const env = await buildEnvForConfig(config!);
    expect(env.ANTHROPIC_BASE_URL).toContain('/api/proxy');

    // 4. 检查服务健康
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    const health = await checkProxyHealth();
    expect(health.available).toBe(true);
  });

  it('错误场景: 余额不足 -> 显示充值提示', async () => {
    // 1. Mock 余额不足错误
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        error: {
          type: 'insufficient_balance',
          message: '余额不足',
          current_balance: 100,
          required_amount: 500,
        },
      }),
    });

    // 2. 发起请求
    try {
      await proxyRequest('/api/proxy/messages', {
        method: 'POST',
        body: { model: 'claude-3-5-sonnet', messages: [] },
        config: { baseURL: 'http://localhost:3000', apiKey: 'sk-test' },
      });
      expect.fail('应该抛出 InsufficientBalanceError');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientBalanceError);
      const balanceError = error as InsufficientBalanceError;
      expect(balanceError.currentBalance).toBe(100);
      expect(balanceError.requiredAmount).toBe(500);

      // 3. 获取友好提示
      const message = getProxyErrorMessage(balanceError);
      expect(message).toContain('余额不足');
    }
  });
});
