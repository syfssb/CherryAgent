/**
 * 系统配置服务
 *
 * 从 system_configs 表读取配置，带内存缓存（60 秒 TTL）
 * 管理员修改配置时调用 clearConfigCache() 清除缓存
 */

import { pool } from '../db/index.js';

// ==========================================
// 缓存
// ==========================================

interface ConfigCacheEntry {
  value: string;
  fetchedAt: number;
}

const CONFIG_CACHE_TTL_MS = 60_000; // 60 秒

const configCache = new Map<string, ConfigCacheEntry>();

// ==========================================
// 公共 API
// ==========================================

/**
 * 从 system_configs 表读取单个配置值
 * 带 60 秒内存缓存
 *
 * @param key - 配置键名
 * @param defaultValue - 配置不存在时的默认值
 * @returns 配置值字符串，不存在则返回 defaultValue
 */
export async function getSystemConfig(
  key: string,
  defaultValue: string = ''
): Promise<string> {
  const now = Date.now();
  const cached = configCache.get(key);

  if (cached && now - cached.fetchedAt < CONFIG_CACHE_TTL_MS) {
    return cached.value;
  }

  const result = await pool.query(
    `SELECT value FROM system_configs WHERE key = $1`,
    [key]
  );

  if (result.rows.length === 0) {
    // 缓存 "不存在" 状态，避免反复查库
    configCache.set(key, { value: defaultValue, fetchedAt: now });
    return defaultValue;
  }

  // system_configs.value 列可能是 JSONB（0004 迁移）或 TEXT（0006 迁移）
  // JSONB 列返回的值可能是 number/boolean/object，需要统一转为 string
  const rawValue = (result.rows[0] as { value: unknown }).value;
  const value = typeof rawValue === 'string' ? rawValue : String(rawValue);
  configCache.set(key, { value, fetchedAt: now });
  return value;
}

/**
 * 读取配置并解析为数字
 */
export async function getSystemConfigNumber(
  key: string,
  defaultValue: number
): Promise<number> {
  const raw = await getSystemConfig(key, String(defaultValue));
  const parsed = parseFloat(raw);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 读取配置并解析为布尔值
 * "true" / "1" → true，其余 → false
 */
export async function getSystemConfigBool(
  key: string,
  defaultValue: boolean
): Promise<boolean> {
  const raw = await getSystemConfig(key, defaultValue ? 'true' : 'false');
  return raw === 'true' || raw === '1';
}

/**
 * 批量读取多个配置（单次查询）
 */
export async function getSystemConfigs(
  keys: string[]
): Promise<Map<string, string>> {
  const now = Date.now();
  const result = new Map<string, string>();
  const missingKeys: string[] = [];

  // 先从缓存取
  for (const key of keys) {
    const cached = configCache.get(key);
    if (cached && now - cached.fetchedAt < CONFIG_CACHE_TTL_MS) {
      result.set(key, cached.value);
    } else {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length === 0) {
    return result;
  }

  // 查库补齐
  const placeholders = missingKeys.map((_, i) => `$${i + 1}`).join(', ');
  const dbResult = await pool.query(
    `SELECT key, value FROM system_configs WHERE key IN (${placeholders})`,
    missingKeys
  );

  const dbMap = new Map<string, string>();
  for (const row of dbResult.rows as Array<{ key: string; value: unknown }>) {
    // 兼容 JSONB 列：值可能是 number/boolean/object，统一转为 string
    const val = typeof row.value === 'string' ? row.value : String(row.value);
    dbMap.set(row.key, val);
  }

  for (const key of missingKeys) {
    const value = dbMap.get(key) ?? '';
    configCache.set(key, { value, fetchedAt: now });
    result.set(key, value);
  }

  return result;
}

/**
 * 清除所有配置缓存
 * 管理员修改配置后调用
 */
export function clearConfigCache(): void {
  configCache.clear();
}
