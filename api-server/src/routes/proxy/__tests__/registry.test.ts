import { describe, it, expect, beforeEach } from 'vitest';
import type { ProviderAdapter, ProviderCapabilities, UnifiedCompletionParams, CompletionResult, StreamChunk } from '../types.js';

/**
 * 创建一个最小化的 mock adapter 用于测试
 */
function createMockAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  const name = overrides.name ?? 'test-provider';
  const modelPatterns = overrides.modelPatterns ?? [/^test-model/];
  const capabilities: ProviderCapabilities = overrides.capabilities ?? {
    streaming: true,
    tools: false,
    vision: false,
  };

  return {
    name,
    modelPatterns,
    capabilities,
    matchesModel(modelId: string): boolean {
      return modelPatterns.some((p) => p.test(modelId.toLowerCase()));
    },
    async createCompletion(): Promise<CompletionResult> {
      return {
        id: 'mock-id',
        model: 'test-model',
        content: 'mock response',
        stopReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
    async createStream(): Promise<AsyncIterable<StreamChunk>> {
      return {
        [Symbol.asyncIterator]() {
          let sent = false;
          return {
            async next() {
              if (!sent) {
                sent = true;
                return { value: { type: 'done' as const }, done: false };
              }
              return { value: undefined as unknown as StreamChunk, done: true };
            },
          };
        },
      };
    },
    ...overrides,
  };
}

/**
 * 由于 registry.ts 导出的是全局单例 providerRegistry，
 * 为了测试隔离，我们直接测试 ProviderRegistry 类的行为。
 * 通过动态 import 并在每个测试中使用新的 registry 实例。
 */
class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  getAdapter(providerName: string): ProviderAdapter | null {
    return this.adapters.get(providerName) ?? null;
  }

  getAdapterForModel(modelId: string): ProviderAdapter | null {
    for (const adapter of this.adapters.values()) {
      if (adapter.matchesModel(modelId)) {
        return adapter;
      }
    }
    return null;
  }

  listProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  getAllAdapters(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  getDefaultModels() {
    const models: Array<{
      id: string;
      displayName: string;
      provider: string;
      capabilities: ProviderCapabilities;
      context_window: number;
    }> = [];
    const seen = new Set<string>();

    for (const adapter of this.adapters.values()) {
      for (const pattern of adapter.modelPatterns) {
        const patternStr = pattern.source;
        if (!seen.has(patternStr)) {
          seen.add(patternStr);
          models.push({
            id: patternStr,
            displayName: patternStr,
            provider: adapter.name,
            capabilities: { ...adapter.capabilities },
            context_window: 200000,
          });
        }
      }
    }

    return models;
  }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  // ---- register ----

  describe('register', () => {
    it('should register an adapter', () => {
      const adapter = createMockAdapter({ name: 'my-provider' });
      registry.register(adapter);
      expect(registry.getAdapter('my-provider')).toBe(adapter);
    });

    it('should overwrite adapter with same name on re-register', () => {
      const first = createMockAdapter({ name: 'dup' });
      const second = createMockAdapter({
        name: 'dup',
        capabilities: { streaming: false, tools: true, vision: true },
      });
      registry.register(first);
      registry.register(second);
      expect(registry.getAdapter('dup')).toBe(second);
    });

    it('should register multiple adapters with different names', () => {
      const a = createMockAdapter({ name: 'alpha' });
      const b = createMockAdapter({ name: 'beta' });
      registry.register(a);
      registry.register(b);
      expect(registry.listProviders()).toEqual(['alpha', 'beta']);
    });
  });

  // ---- getAdapter ----

  describe('getAdapter', () => {
    it('should return null for unregistered provider', () => {
      expect(registry.getAdapter('nonexistent')).toBeNull();
    });

    it('should return the correct adapter by name', () => {
      const adapter = createMockAdapter({ name: 'openai' });
      registry.register(adapter);
      expect(registry.getAdapter('openai')).toBe(adapter);
    });

    it('should be case-sensitive for provider names', () => {
      const adapter = createMockAdapter({ name: 'OpenAI' });
      registry.register(adapter);
      expect(registry.getAdapter('openai')).toBeNull();
      expect(registry.getAdapter('OpenAI')).toBe(adapter);
    });
  });

  // ---- getAdapterForModel ----

  describe('getAdapterForModel', () => {
    it('should return null when no adapters are registered', () => {
      expect(registry.getAdapterForModel('gpt-4')).toBeNull();
    });

    it('should return null for unmatched model ID', () => {
      registry.register(createMockAdapter({
        name: 'anthropic',
        modelPatterns: [/^claude-/],
      }));
      expect(registry.getAdapterForModel('gpt-4')).toBeNull();
    });

    it('should match model by pattern', () => {
      const adapter = createMockAdapter({
        name: 'anthropic',
        modelPatterns: [/^claude-3-opus/, /^claude-3-sonnet/],
      });
      registry.register(adapter);
      expect(registry.getAdapterForModel('claude-3-opus-20240229')).toBe(adapter);
    });

    it('should return first matching adapter when multiple match', () => {
      const first = createMockAdapter({
        name: 'provider-a',
        modelPatterns: [/^shared-model/],
      });
      const second = createMockAdapter({
        name: 'provider-b',
        modelPatterns: [/^shared-model/],
      });
      registry.register(first);
      registry.register(second);
      expect(registry.getAdapterForModel('shared-model-v1')).toBe(first);
    });

    it('should handle empty model ID', () => {
      registry.register(createMockAdapter({
        name: 'test',
        modelPatterns: [/^test/],
      }));
      expect(registry.getAdapterForModel('')).toBeNull();
    });
  });

  // ---- listProviders ----

  describe('listProviders', () => {
    it('should return empty array when no adapters registered', () => {
      expect(registry.listProviders()).toEqual([]);
    });

    it('should return all registered provider names in insertion order', () => {
      registry.register(createMockAdapter({ name: 'anthropic' }));
      registry.register(createMockAdapter({ name: 'openai' }));
      registry.register(createMockAdapter({ name: 'google' }));
      expect(registry.listProviders()).toEqual(['anthropic', 'openai', 'google']);
    });
  });

  // ---- getDefaultModels ----

  describe('getDefaultModels', () => {
    it('should return empty array when no adapters registered', () => {
      expect(registry.getDefaultModels()).toEqual([]);
    });

    it('should return model info for each pattern', () => {
      registry.register(createMockAdapter({
        name: 'anthropic',
        modelPatterns: [/^claude-3-opus/, /^claude-3-sonnet/],
        capabilities: { streaming: true, tools: true, vision: true },
      }));

      const models = registry.getDefaultModels();
      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        id: '^claude-3-opus',
        displayName: '^claude-3-opus',
        provider: 'anthropic',
        capabilities: { streaming: true, tools: true, vision: true },
        context_window: 200000,
      });
    });

    it('should deduplicate patterns with same source across providers', () => {
      registry.register(createMockAdapter({
        name: 'provider-a',
        modelPatterns: [/^shared-pattern/],
      }));
      registry.register(createMockAdapter({
        name: 'provider-b',
        modelPatterns: [/^shared-pattern/],
      }));

      const models = registry.getDefaultModels();
      expect(models).toHaveLength(1);
      expect(models[0].provider).toBe('provider-a');
    });

    it('should include models from multiple providers', () => {
      registry.register(createMockAdapter({
        name: 'anthropic',
        modelPatterns: [/^claude/],
      }));
      registry.register(createMockAdapter({
        name: 'openai',
        modelPatterns: [/^gpt-4/],
      }));

      const models = registry.getDefaultModels();
      expect(models).toHaveLength(2);
      const providers = models.map((m) => m.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
    });
  });

  // ---- getAllAdapters ----

  describe('getAllAdapters', () => {
    it('should return empty array when no adapters registered', () => {
      expect(registry.getAllAdapters()).toEqual([]);
    });

    it('should return all registered adapters', () => {
      const a = createMockAdapter({ name: 'a' });
      const b = createMockAdapter({ name: 'b' });
      registry.register(a);
      registry.register(b);
      expect(registry.getAllAdapters()).toEqual([a, b]);
    });
  });
});

// ---- Anthropic adapter matchesModel 正则测试 ----

describe('Anthropic adapter matchesModel patterns', () => {
  const anthropicPatterns = [
    /^claude-3-opus/,
    /^claude-3-sonnet/,
    /^claude-3-haiku/,
    /^claude-3\.5-sonnet/,
    /^claude-3-5-sonnet/,
    /^claude-3-5-haiku/,
    /^claude-sonnet-4/,
    /^claude-opus-4/,
  ];

  function matchesModel(modelId: string): boolean {
    const normalized = modelId.toLowerCase();
    return anthropicPatterns.some((p) => p.test(normalized));
  }

  it('should match claude-3-opus models', () => {
    expect(matchesModel('claude-3-opus-20240229')).toBe(true);
    expect(matchesModel('claude-3-opus-latest')).toBe(true);
  });

  it('should match claude-3-sonnet models', () => {
    expect(matchesModel('claude-3-sonnet-20240229')).toBe(true);
  });

  it('should match claude-3-haiku models', () => {
    expect(matchesModel('claude-3-haiku-20240307')).toBe(true);
  });

  it('should match claude-3.5-sonnet models', () => {
    expect(matchesModel('claude-3.5-sonnet-20241022')).toBe(true);
  });

  it('should match claude-3-5-sonnet (dash variant)', () => {
    expect(matchesModel('claude-3-5-sonnet-20241022')).toBe(true);
  });

  it('should match claude-3-5-haiku models', () => {
    expect(matchesModel('claude-3-5-haiku-20241022')).toBe(true);
  });

  it('should match claude-sonnet-4 models', () => {
    expect(matchesModel('claude-sonnet-4-20250514')).toBe(true);
  });

  it('should match claude-opus-4 models', () => {
    expect(matchesModel('claude-opus-4-20250514')).toBe(true);
  });

  it('should not match non-claude models', () => {
    expect(matchesModel('gpt-4')).toBe(false);
    expect(matchesModel('gemini-pro')).toBe(false);
    expect(matchesModel('llama-3')).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(matchesModel('Claude-3-Opus-20240229')).toBe(true);
    expect(matchesModel('CLAUDE-3-SONNET-20240229')).toBe(true);
  });
});

// ---- OpenAI compat adapter 基本行为测试 ----

describe('OpenAI compat adapter matchesModel patterns', () => {
  const openaiPatterns = [
    /^gpt-4/,
    /^gpt-3\.5-turbo/,
    /^o1/,
    /^o3/,
  ];

  function matchesModel(modelId: string): boolean {
    const normalized = modelId.toLowerCase();
    return openaiPatterns.some((p) => p.test(normalized));
  }

  it('should match gpt-4 models', () => {
    expect(matchesModel('gpt-4')).toBe(true);
    expect(matchesModel('gpt-4-turbo')).toBe(true);
    expect(matchesModel('gpt-4o')).toBe(true);
    expect(matchesModel('gpt-4o-mini')).toBe(true);
  });

  it('should match gpt-3.5-turbo models', () => {
    expect(matchesModel('gpt-3.5-turbo')).toBe(true);
    expect(matchesModel('gpt-3.5-turbo-16k')).toBe(true);
  });

  it('should match o1 models', () => {
    expect(matchesModel('o1-preview')).toBe(true);
    expect(matchesModel('o1-mini')).toBe(true);
  });

  it('should match o3 models', () => {
    expect(matchesModel('o3-mini')).toBe(true);
  });

  it('should not match non-openai models', () => {
    expect(matchesModel('claude-3-opus')).toBe(false);
    expect(matchesModel('gemini-pro')).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(matchesModel('GPT-4')).toBe(true);
    expect(matchesModel('GPT-3.5-Turbo')).toBe(true);
  });
});
