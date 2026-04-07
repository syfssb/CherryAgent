/**
 * 安全存储模块
 * 使用 Electron safeStorage API 加密存储敏感数据
 */
import { app, safeStorage } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

/**
 * 支持的令牌类型
 *
 * Note: "apiKey" is deprecated but kept for backward compatibility
 * to support cleanup of legacy stored API keys. New code should not
 * store API keys locally - use cloud authentication instead.
 */
export type TokenKey = "accessToken" | "refreshToken" | "apiKey";

// 存储文件路径
const STORAGE_FILE_NAME = "secure-tokens.enc";

// 内存缓存，避免频繁解密
const tokenCache = new Map<TokenKey, string>();

/**
 * 获取安全存储文件路径
 */
function getStoragePath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, STORAGE_FILE_NAME);
}

/**
 * 检查 safeStorage 是否可用
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/**
 * 加载所有存储的令牌
 */
function loadTokens(): Record<TokenKey, string> {
  try {
    const storagePath = getStoragePath();
    if (!existsSync(storagePath)) {
      return {} as Record<TokenKey, string>;
    }

    const encryptedData = readFileSync(storagePath);

    if (!isEncryptionAvailable()) {
      console.warn("[secure-storage] Encryption not available, tokens may not be secure");
      // 在加密不可用的情况下，数据是 base64 编码的 JSON
      const jsonData = Buffer.from(encryptedData.toString(), "base64").toString("utf8");
      return JSON.parse(jsonData);
    }

    const decryptedData = safeStorage.decryptString(encryptedData);
    return JSON.parse(decryptedData);
  } catch (error) {
    console.error("[secure-storage] Failed to load tokens:", error);
    return {} as Record<TokenKey, string>;
  }
}

/**
 * 原子写入文件：先写临时文件，再 renameSync 替换目标。
 * renameSync 在同一文件系统上是原子操作，防止写入中断导致数据损坏。
 * 失败时自动清理临时文件，防止敏感数据残留。
 */
function atomicWriteSync(filePath: string, data: Buffer | string, encoding?: BufferEncoding): void {
  const tmpPath = `${filePath}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    if (typeof data === "string") {
      writeFileSync(tmpPath, data, encoding ?? "utf8");
    } else {
      writeFileSync(tmpPath, data);
    }
    renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // 临时文件可能未创建，忽略清理失败
    }
    throw error;
  }
}

/**
 * 保存所有令牌（使用原子写入防止数据损坏）
 */
function saveTokens(tokens: Record<string, string>): void {
  try {
    const storagePath = getStoragePath();
    const userDataPath = app.getPath("userData");

    // 确保目录存在
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true });
    }

    const jsonData = JSON.stringify(tokens);

    if (!isEncryptionAvailable()) {
      console.warn("[secure-storage] Encryption not available, using base64 encoding (not secure)");
      const encodedData = Buffer.from(jsonData).toString("base64");
      atomicWriteSync(storagePath, encodedData, "utf8");
      return;
    }

    const encryptedData = safeStorage.encryptString(jsonData);
    atomicWriteSync(storagePath, encryptedData);
    console.info("[secure-storage] Tokens saved securely (atomic write)");
  } catch (error) {
    console.error("[secure-storage] Failed to save tokens:", error);
    throw new Error("Failed to save secure tokens");
  }
}

/**
 * 加密保存令牌
 * @param key - 令牌类型
 * @param value - 令牌值
 */
export function saveToken(key: TokenKey, value: string): void {
  if (!value || typeof value !== "string") {
    throw new Error("Token value must be a non-empty string");
  }

  const tokens = loadTokens();
  const updatedTokens = {
    ...tokens,
    [key]: value
  };

  saveTokens(updatedTokens);

  // 更新缓存
  tokenCache.set(key, value);
}

/**
 * 解密获取令牌
 * @param key - 令牌类型
 * @returns 令牌值，如果不存在则返回 null
 */
export function getToken(key: TokenKey): string | null {
  // 首先检查缓存
  if (tokenCache.has(key)) {
    return tokenCache.get(key) || null;
  }

  const tokens = loadTokens();
  const value = tokens[key] || null;

  // 缓存结果
  if (value) {
    tokenCache.set(key, value);
  }

  return value;
}

/**
 * 删除令牌
 * @param key - 令牌类型
 */
export function deleteToken(key: TokenKey): void {
  const tokens = loadTokens();

  if (key in tokens) {
    const { [key]: _, ...remainingTokens } = tokens;
    saveTokens(remainingTokens);
  }

  // 清除缓存
  tokenCache.delete(key);
}

/**
 * 删除所有令牌
 */
export function clearAllTokens(): void {
  try {
    const storagePath = getStoragePath();
    if (existsSync(storagePath)) {
      unlinkSync(storagePath);
      console.info("[secure-storage] All tokens cleared");
    }
  } catch (error) {
    console.error("[secure-storage] Failed to clear tokens:", error);
    throw new Error("Failed to clear secure tokens");
  }

  // 清除缓存
  tokenCache.clear();
}

/**
 * 检查令牌是否存在
 * @param key - 令牌类型
 */
export function hasToken(key: TokenKey): boolean {
  return getToken(key) !== null;
}

/**
 * 批量保存令牌
 * @param tokens - 令牌键值对
 */
export function saveTokens_batch(tokens: Partial<Record<TokenKey, string>>): void {
  const existingTokens = loadTokens();
  const updatedTokens = {
    ...existingTokens,
    ...tokens
  };

  // 移除 undefined 值
  const cleanedTokens = Object.fromEntries(
    Object.entries(updatedTokens).filter(([_, v]) => v !== undefined)
  );

  saveTokens(cleanedTokens);

  // 更新缓存
  for (const [key, value] of Object.entries(tokens)) {
    if (value) {
      tokenCache.set(key as TokenKey, value);
    }
  }
}

/**
 * 获取所有令牌（用于调试，生产环境不建议使用）
 */
export function getAllTokens(): Partial<Record<TokenKey, string>> {
  return loadTokens();
}
