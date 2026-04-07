import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---- Mock state ----
const mockFiles = new Map<string, string>();

vi.mock('electron', () => ({
  app: { getPath: () => '/mock/userData' },
  default: { app: { getPath: () => '/mock/userData' } },
}));

function createFsMock() {
  const mock = {
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
  };
  return { default: mock, ...mock };
}

vi.mock('fs', () => createFsMock());
vi.mock('node:fs', () => createFsMock());

// Import after mocks are set up
import {
  getFeatureFlags,
  setFeatureFlag,
  resetFeatureFlags,
  isCodexEnabled,
  isProviderSwitchEnabled,
} from '../libs/feature-flags';

describe('Feature Flags', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

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

  it('should return default flags when no file exists', () => {
    const flags = getFeatureFlags();
    expect(flags.desktop.enableCodexRunner).toBe(false);
    expect(flags.desktop.enableProviderSwitch).toBe(false);
  });

  it('should persist and read back a flag change', () => {
    setFeatureFlag('desktop.enableCodexRunner', true);
    const flags = getFeatureFlags();
    expect(flags.desktop.enableCodexRunner).toBe(true);
    expect(flags.desktop.enableProviderSwitch).toBe(false);
  });

  it('should reset all flags to defaults', () => {
    setFeatureFlag('desktop.enableCodexRunner', true);
    setFeatureFlag('desktop.enableProviderSwitch', true);
    resetFeatureFlags();
    const flags = getFeatureFlags();
    expect(flags.desktop.enableCodexRunner).toBe(false);
    expect(flags.desktop.enableProviderSwitch).toBe(false);
  });

  it('isCodexEnabled should reflect flag state', () => {
    expect(isCodexEnabled()).toBe(false);
    setFeatureFlag('desktop.enableCodexRunner', true);
    expect(isCodexEnabled()).toBe(true);
  });

  it('isCodexEnabled should be true when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    resetFeatureFlags();
    expect(isCodexEnabled()).toBe(true);
  });

  it('isCodexEnabled should be true when secure token file exists', () => {
    mockFiles.set('/mock/userData/secure-tokens.enc', 'token');
    resetFeatureFlags();
    expect(isCodexEnabled()).toBe(true);
  });

  it('isProviderSwitchEnabled should reflect flag state', () => {
    expect(isProviderSwitchEnabled()).toBe(false);
    setFeatureFlag('desktop.enableProviderSwitch', true);
    expect(isProviderSwitchEnabled()).toBe(true);
  });

  it('should return immutable copies', () => {
    const a = getFeatureFlags();
    const b = getFeatureFlags();
    expect(a).toEqual(b);
    expect(a.desktop).not.toBe(b.desktop);
  });
});
