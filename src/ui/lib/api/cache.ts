import type { RequestConfig } from './types';

/**
 * 缓存项
 */
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * 请求缓存管理器
 *
 * 提供内存缓存功能，减少重复请求
 */
export class RequestCache {
  private cache = new Map<string, CacheItem<any>>();
  private defaultTTL = 5 * 60 * 1000; // 默认 5 分钟

  /**
   * 生成缓存键
   */
  private generateKey(url: string, config?: RequestConfig): string {
    const method = config?.method || 'GET';
    const body = config?.body ? JSON.stringify(config.body) : '';
    return `${method}:${url}:${body}`;
  }

  /**
   * 检查缓存是否过期
   */
  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  /**
   * 获取缓存
   */
  get<T>(url: string, config?: RequestConfig): T | null {
    const key = config?.cache?.key || this.generateKey(url, config);
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    if (this.isExpired(item)) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  /**
   * 设置缓存
   */
  set<T>(url: string, data: T, config?: RequestConfig): void {
    const key = config?.cache?.key || this.generateKey(url, config);
    const ttl = config?.cache?.ttl || this.defaultTTL;

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * 删除缓存
   */
  delete(url: string, config?: RequestConfig): void {
    const key = config?.cache?.key || this.generateKey(url, config);
    this.cache.delete(key);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清除过期缓存
   */
  clearExpired(): void {
    for (const [key, item] of this.cache.entries()) {
      if (this.isExpired(item)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }
}
