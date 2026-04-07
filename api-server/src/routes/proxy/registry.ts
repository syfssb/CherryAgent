/**
 * Provider 注册表
 *
 * 统一管理所有 ProviderAdapter，根据 provider 名称或 model ID 查找适配器。
 * 参考 Vercel AI SDK 的 provider registry 模式设计。
 */

import type { ProviderAdapter, ModelInfo } from './types.js';

class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  /**
   * 注册一个 provider 适配器
   */
  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * 按 provider 名称获取适配器
   */
  getAdapter(providerName: string): ProviderAdapter | null {
    return this.adapters.get(providerName) ?? null;
  }

  /**
   * 按 provider 名称获取适配器（别名，与需求文档一致）
   */
  getAdapterByName(name: string): ProviderAdapter | null {
    return this.getAdapter(name);
  }

  /**
   * 根据 model ID 推断 provider 并返回适配器
   * 遍历所有已注册适配器，调用 matchesModel 进行正则匹配
   */
  getAdapterForModel(modelId: string): ProviderAdapter | null {
    for (const adapter of this.adapters.values()) {
      if (adapter.matchesModel(modelId)) {
        return adapter;
      }
    }

    return null;
  }

  /**
   * 获取所有已注册的 provider 名称
   */
  listProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 获取所有已注册适配器
   */
  getAllAdapters(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 汇总所有 provider 的默认模型信息
   * 用于 /models 端点的静态模型列表
   */
  getDefaultModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
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

/** 全局单例 */
export const providerRegistry = new ProviderRegistry();
