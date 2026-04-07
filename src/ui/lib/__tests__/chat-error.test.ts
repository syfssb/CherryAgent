import { describe, expect, it } from 'vitest';
import {
  LOGIN_REQUIRED_MESSAGE,
  PERMANENT_MODEL_UNAVAILABLE_MESSAGE,
  normalizeChatErrorText,
} from '../chat-error.js';

describe('normalizeChatErrorText', () => {
  it('402 余额不足应显示充值提示', () => {
    const normalized = normalizeChatErrorText('API Error: 402 {"error":{"code":"RATE_4002","message":"积分不足"}}');
    expect(normalized.isBalanceError).toBe(true);
    expect(normalized.text).toContain('当前积分不足');
  });

  it('409 + EXT_6002 应显示永久性可操作错误', () => {
    const normalized = normalizeChatErrorText('API Error: 409 {"error":{"code":"EXT_6002","message":"当前模型暂无可用渠道，请切换模型或稍后再试。"}}');
    expect(normalized.text).toBe(PERMANENT_MODEL_UNAVAILABLE_MESSAGE);
    expect(normalized.isBalanceError).toBe(false);
  });

  it('401 + AUTH_1001 应显示登录提示', () => {
    const normalized = normalizeChatErrorText('API Error: 401 {"error":{"code":"AUTH_1001","message":"Missing authentication credentials."}}');
    expect(normalized.text).toBe(LOGIN_REQUIRED_MESSAGE);
    expect(normalized.isLoginError).toBe(true);
  });

  it('AUTH_1002 文本应显示登录提示', () => {
    const normalized = normalizeChatErrorText('{"success":false,"error":{"code":"AUTH_1002","message":"Invalid authentication credentials."}}');
    expect(normalized.text).toBe(LOGIN_REQUIRED_MESSAGE);
    expect(normalized.isLoginError).toBe(true);
  });

  it('model_not_found 文本应显示永久性可操作错误', () => {
    const normalized = normalizeChatErrorText('anthropic: 503 {"error":{"code":"model_not_found","message":"No available channel for model claude-sonnet-4-6 under group svip"}}');
    expect(normalized.text).toBe(PERMANENT_MODEL_UNAVAILABLE_MESSAGE);
  });

  it('瞬时 503 应保留通用稍后重试文案', () => {
    const normalized = normalizeChatErrorText('API Error: 503 {"error":{"code":"server_error","message":"upstream overloaded"}}');
    expect(normalized.text).toBe('请求失败，请稍后重试。');
  });
});
