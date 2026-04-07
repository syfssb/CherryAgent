import { describe, it, expect, beforeEach } from 'vitest';
import { AuthenticationError, ValidationError } from '../utils/errors.js';
import {
  createOAuthState,
  verifyOAuthState,
  resetOAuthStateCacheForTest,
} from '../utils/oauth-state.js';

describe('OAuth state 签名校验', () => {
  const provider = 'google' as const;
  const redirectUri = 'http://localhost:3001/api/auth/oauth/google/callback';

  beforeEach(() => {
    resetOAuthStateCacheForTest();
  });

  it('应能生成并验证有效 state', () => {
    const now = Date.now();
    const state = createOAuthState({
      provider,
      redirectUri,
      now,
    });

    const payload = verifyOAuthState(state, {
      provider,
      redirectUri,
      now: now + 1000,
    });

    expect(payload.provider).toBe(provider);
    expect(payload.redirectUri).toBe(redirectUri);
  });

  it('应拒绝重复使用的 state（重放攻击）', () => {
    const now = Date.now();
    const state = createOAuthState({
      provider,
      redirectUri,
      now,
    });

    verifyOAuthState(state, {
      provider,
      redirectUri,
      now: now + 500,
    });

    expect(() => {
      verifyOAuthState(state, {
        provider,
        redirectUri,
        now: now + 1000,
      });
    }).toThrow(AuthenticationError);
  });

  it('应拒绝被篡改的 state', () => {
    const state = createOAuthState({
      provider,
      redirectUri,
    });

    const tampered = `${state}x`;

    expect(() => {
      verifyOAuthState(tampered, {
        provider,
        redirectUri,
      });
    }).toThrow(AuthenticationError);
  });

  it('应拒绝 redirect_uri 不一致', () => {
    const state = createOAuthState({
      provider,
      redirectUri,
    });

    expect(() => {
      verifyOAuthState(state, {
        provider,
        redirectUri: 'http://localhost:3001/api/auth/oauth/google/other-callback',
      });
    }).toThrow(ValidationError);
  });

  it('应拒绝过期 state', () => {
    const now = Date.now();
    const state = createOAuthState({
      provider,
      redirectUri,
      now,
      ttlMs: 1000,
    });

    expect(() => {
      verifyOAuthState(state, {
        provider,
        redirectUri,
        now: now + 2 * 60 * 1000,
      });
    }).toThrow(AuthenticationError);
  });

  it('应在包含 PKCE 时校验 code_verifier', () => {
    const codeVerifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890-._~';
    const codeChallenge = 'o8rNQWnQfNfA5L0iYiW0o9x0xO9HjQh9T1FfYz5vwxA';

    const state = createOAuthState({
      provider,
      redirectUri,
      codeChallenge,
    });

    expect(() => {
      verifyOAuthState(state, {
        provider,
        redirectUri,
        codeVerifier,
      });
    }).toThrow(AuthenticationError);
  });
});

