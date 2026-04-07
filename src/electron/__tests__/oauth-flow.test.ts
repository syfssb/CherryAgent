/**
 * OAuth PKCE 流程测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  validateState,
  startOAuthFlow,
  handleOAuthCallback,
  cancelOAuthFlow,
  hasActiveOAuthFlow,
  OAUTH_PROVIDERS
} from '../libs/oauth-flow';
import type { OAuthFlowConfig } from '../libs/oauth-flow';

const { mockOpenExternal, mockLoginWithCode } = vi.hoisted(() => ({
  mockOpenExternal: vi.fn(),
  mockLoginWithCode: vi.fn()
}));

vi.mock('electron', () => ({
  shell: { openExternal: mockOpenExternal }
}));

vi.mock('../libs/auth-service.js', () => ({
  loginWithCode: mockLoginWithCode
}));

describe('OAuth PKCE Flow', () => {
  /**
   * 创建测试用 OAuth 配置
   */
  function createTestOAuthConfig(provider: 'google' | 'github'): OAuthFlowConfig {
    const providerConfig = OAUTH_PROVIDERS[provider];
    return {
      provider: {
        name: providerConfig.name,
        authorizationEndpoint: providerConfig.authorizationEndpoint,
        tokenEndpoint: providerConfig.tokenEndpoint,
        clientId: 'test-client-id',
        scopes: [...providerConfig.scopes]
      }
    };
  }

  beforeEach(() => {
    // 清理状态
    cancelOAuthFlow();
    mockOpenExternal.mockReset();
    mockLoginWithCode.mockReset();
    mockLoginWithCode.mockResolvedValue({
      success: true,
      user: {
        id: 'user-123',
        email: 'test@example.com'
      }
    });
  });

  describe('PKCE 参数生成', () => {
    it('应该生成有效的 code_verifier', () => {
      const verifier = generateCodeVerifier();

      expect(verifier).toBeDefined();
      expect(typeof verifier).toBe('string');
      expect(verifier.length).toBeGreaterThanOrEqual(43); // Base64URL 编码后至少 43 个字符
      expect(verifier.length).toBeLessThanOrEqual(128); // RFC 7636 规定最多 128 个字符
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/); // Base64URL 字符集
    });

    it('应该生成不同的 code_verifier', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();

      expect(verifier1).not.toBe(verifier2);
    });

    it('应该生成有效的 code_challenge', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      expect(challenge).toBeDefined();
      expect(typeof challenge).toBe('string');
      expect(challenge.length).toBe(43); // SHA256 哈希 Base64URL 编码后固定 43 个字符
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/); // Base64URL 字符集
    });

    it('相同的 code_verifier 应该生成相同的 code_challenge', () => {
      const verifier = generateCodeVerifier();
      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier);

      expect(challenge1).toBe(challenge2);
    });

    it('不同的 code_verifier 应该生成不同的 code_challenge', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      const challenge1 = generateCodeChallenge(verifier1);
      const challenge2 = generateCodeChallenge(verifier2);

      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('State 参数', () => {
    it('应该生成有效的 state', () => {
      const state = generateState();

      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(0);
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('应该生成不同的 state', () => {
      const state1 = generateState();
      const state2 = generateState();

      expect(state1).not.toBe(state2);
    });

    it('应该验证正确的 state', () => {
      const state = generateState();
      const isValid = validateState(state, state);

      expect(isValid).toBe(true);
    });

    it('应该拒绝不匹配的 state', () => {
      const state1 = generateState();
      const state2 = generateState();
      const isValid = validateState(state1, state2);

      expect(isValid).toBe(false);
    });

    it('应该拒绝空 state', () => {
      const state = generateState();
      const isValid1 = validateState(undefined, state);
      const isValid2 = validateState(state, '');

      expect(isValid1).toBe(false);
      expect(isValid2).toBe(false);
    });
  });

  describe('OAuth 流程管理', () => {
    it('启动 OAuth 流程后应该有活跃流程', async () => {
      const config = createTestOAuthConfig('google');

      await startOAuthFlow(config);

      expect(hasActiveOAuthFlow()).toBe(true);
    });

    it('取消 OAuth 流程后应该没有活跃流程', async () => {
      const config = createTestOAuthConfig('google');

      await startOAuthFlow(config);
      cancelOAuthFlow();

      expect(hasActiveOAuthFlow()).toBe(false);
    });

    it('应该在超时后自动清除流程', async () => {
      const config = createTestOAuthConfig('google');

      await startOAuthFlow(config);

      // 快进时间到超时后
      vi.useFakeTimers();
      vi.advanceTimersByTime(6 * 60 * 1000); // 6 分钟

      expect(hasActiveOAuthFlow()).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('OAuth 回调处理', () => {
    it('应该成功处理有效的回调', async () => {
      const config = createTestOAuthConfig('google');

      const pkceState = await startOAuthFlow(config);

      const result = await handleOAuthCallback({
        code: 'test-code',
        state: pkceState.state
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('应该拒绝无效的 state', async () => {
      const config = createTestOAuthConfig('google');

      await startOAuthFlow(config);

      const result = await handleOAuthCallback({
        code: 'test-code',
        state: 'invalid-state'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_state');
    });

    it('应该处理缺少授权码的情况', async () => {
      const config = createTestOAuthConfig('google');

      const pkceState = await startOAuthFlow(config);

      const result = await handleOAuthCallback({
        state: pkceState.state
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('missing_code');
    });

    it('应该处理 OAuth 错误响应', async () => {
      const config = createTestOAuthConfig('google');

      await startOAuthFlow(config);

      const result = await handleOAuthCallback({
        error: 'access_denied',
        errorDescription: 'User denied access'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('access_denied');
      expect(result.errorDescription).toBe('User denied access');
    });

    it('应该拒绝没有活跃流程时的回调', async () => {
      const result = await handleOAuthCallback({
        code: 'test-code',
        state: 'test-state'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('no_pkce_state');
    });
  });

  describe('OAuth 提供商配置', () => {
    it('应该创建 Google OAuth 配置', () => {
      const config = createTestOAuthConfig('google');

      expect(config.provider.name).toBe('Google');
      expect(config.provider.clientId).toBe('test-client-id');
      expect(config.provider.scopes).toContain('openid');
      expect(config.provider.scopes).toContain('email');
    });

    it('应该创建 GitHub OAuth 配置', () => {
      const config = createTestOAuthConfig('github');

      expect(config.provider.name).toBe('GitHub');
      expect(config.provider.clientId).toBe('test-client-id');
      expect(config.provider.scopes).toContain('read:user');
      expect(config.provider.scopes).toContain('user:email');
    });
  });

  describe('安全性测试', () => {
    it('code_verifier 应该有足够的熵', () => {
      const verifiers = new Set();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        verifiers.add(generateCodeVerifier());
      }

      // 应该没有重复
      expect(verifiers.size).toBe(count);
    });

    it('state 应该有足够的熵', () => {
      const states = new Set();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        states.add(generateState());
      }

      // 应该没有重复
      expect(states.size).toBe(count);
    });

    it('code_challenge 应该不可逆', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      // code_challenge 应该与 code_verifier 完全不同
      expect(challenge).not.toBe(verifier);
    });
  });
});
