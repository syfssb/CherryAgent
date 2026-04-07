import { describe, expect, it } from 'vitest';
import { shouldCollectAutoTitleMessage } from '../libs/title-generation-policy.js';

describe('title generation policy', () => {
  it('assistant 消息应允许触发自动标题生成', () => {
    expect(
      shouldCollectAutoTitleMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hello' }] },
      }),
    ).toBe(true);
  });

  it('result success 应允许触发自动标题生成', () => {
    expect(
      shouldCollectAutoTitleMessage({ type: 'result', subtype: 'success' }),
    ).toBe(true);
  });

  it('result error 不应触发自动标题生成', () => {
    expect(
      shouldCollectAutoTitleMessage({ type: 'result', subtype: 'error', error: 'API Error: 409' }),
    ).toBe(false);
  });

  it('空 assistant 内容不应触发自动标题生成', () => {
    expect(
      shouldCollectAutoTitleMessage({ type: 'assistant', message: { content: [] } }),
    ).toBe(false);
  });
});
