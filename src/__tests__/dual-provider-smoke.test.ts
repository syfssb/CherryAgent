import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockFiles = new Map<string, string>();
const originalApiKey = process.env.OPENAI_API_KEY;

vi.mock('electron', () => ({
  app: { getPath: () => '/mock/userData' },
  default: { app: { getPath: () => '/mock/userData' } },
}));

vi.mock('fs', () => ({
  default: {},
  existsSync: vi.fn((path: string) => mockFiles.has(path)),
  readFileSync: vi.fn((path: string) => {
    const content = mockFiles.get(path);
    if (!content) throw new Error(`ENOENT: ${path}`);
    return content;
  }),
  writeFileSync: vi.fn((path: string, data: string) => {
    mockFiles.set(path, data);
  }),
  renameSync: vi.fn((src: string, dest: string) => {
    const content = mockFiles.get(src);
    if (content !== undefined) {
      mockFiles.set(dest, content);
      mockFiles.delete(src);
    }
  }),
  unlinkSync: vi.fn((path: string) => {
    mockFiles.delete(path);
  }),
}));

vi.mock('crypto', () => ({
  default: {},
  randomBytes: vi.fn(() => Buffer.from('abcd1234')),
}));

import { AgentRunnerFactory } from '../electron/libs/agent-runner/factory';
import { resetFeatureFlags, setFeatureFlag } from '../electron/libs/feature-flags';

describe('Dual Provider Smoke Tests', () => {
  beforeEach(() => {
    mockFiles.clear();
    delete process.env.OPENAI_API_KEY;
    resetFeatureFlags();
  });

  afterEach(() => {
    if (originalApiKey) {
      process.env.OPENAI_API_KEY = originalApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('默认仅启用 Claude provider', () => {
    expect(AgentRunnerFactory.getAvailableProviders()).toEqual(['claude']);
  });

  it('开启 desktop.enableCodexRunner 后可见 codex provider', () => {
    setFeatureFlag('desktop.enableCodexRunner', true);
    expect(AgentRunnerFactory.getAvailableProviders()).toEqual(['claude', 'codex']);
  });

  it('设置 OPENAI_API_KEY 时可见 codex provider', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    resetFeatureFlags();
    expect(AgentRunnerFactory.getAvailableProviders()).toEqual(['claude', 'codex']);
  });
});
