import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  createHash,
  createHmac,
} from 'node:crypto';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { env } from './env.js';

// ============================================================
// AES-256-GCM 加密常量
// ============================================================
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

// 格式标识前缀（base64 解码后前 4 字节）
const GCM1_MAGIC = Buffer.from('GCM1');
const GCM2_MAGIC = Buffer.from('GCM2');

/**
 * 使用 scrypt 从 passphrase 派生 AES-256 密钥
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 });
}

/**
 * GCM2 密钥派生：仅使用 passphrase（API_KEY_ENCRYPTION_KEY）通过 scrypt 派生。
 * 不依赖机器指纹/machine-id，确保 Docker/Zeabur 等容器部署环境下
 * hostname/CPU/MAC 变化不会导致数据不可解密。
 */
function deriveKeyV2(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 });
}

// ============================================================
// CryptoJS 兼容解密（向后兼容旧数据）
// CryptoJS.AES.encrypt(text, passphrase) 内部使用 EVP_BytesToKey(MD5)
// 输出格式: "Salted__" + salt(8) + ciphertext，整体 base64
// ============================================================
function evpBytesToKey(
  password: Buffer,
  salt: Buffer,
  keyLen: number,
  ivLen: number
): { key: Buffer; iv: Buffer } {
  const totalLen = keyLen + ivLen;
  const result: Buffer[] = [];
  let currentLen = 0;
  let prev = Buffer.alloc(0);

  while (currentLen < totalLen) {
    const data = Buffer.concat([prev, password, salt]);
    prev = createHash('md5').update(data).digest();
    result.push(prev);
    currentLen += prev.length;
  }

  const derived = Buffer.concat(result, totalLen);
  return {
    key: derived.subarray(0, keyLen),
    iv: derived.subarray(keyLen, keyLen + ivLen),
  };
}

function decryptLegacyCryptoJS(cipherText: string, passphrase: string): string {
  const raw = Buffer.from(cipherText, 'base64');

  // CryptoJS "Salted__" 前缀 = 0x53616c7465645f5f
  const salted = raw.subarray(0, 8);
  if (salted.toString('utf8') !== 'Salted__') {
    throw new Error('解密失败：不是有效的 CryptoJS 格式');
  }

  const salt = raw.subarray(8, 16);
  const cipherBytes = raw.subarray(16);

  // CryptoJS 默认 AES-256-CBC，keyLen=32, ivLen=16
  const { key, iv } = evpBytesToKey(Buffer.from(passphrase, 'utf8'), salt, 32, 16);

  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(cipherBytes), decipher.final()]);
  return decrypted.toString('utf8');
}

// ============================================================
// GCM2: AES-256-GCM + scrypt 密钥派生 + AAD 头部保护
// 格式: base64( GCM2_MAGIC[4] + salt[16] + iv[12] + authTag[16] + ciphertext )
// AAD = GCM2_MAGIC + salt，由 GCM 认证标签保护，防止头部篡改
// ============================================================

/**
 * 使用 AES-256-GCM 加密敏感数据（GCM2 格式）
 * - 密钥由 API_KEY_ENCRYPTION_KEY 通过 scrypt 派生（不依赖机器指纹）
 * - 使用 GCM AAD 保护头部（magic + salt），无需额外 HMAC
 */
export function encrypt(plainText: string): string {
  const passphrase = env.API_KEY_ENCRYPTION_KEY;
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKeyV2(passphrase, salt);

  // AAD = GCM2_MAGIC + salt，GCM 认证标签会覆盖 AAD 的完整性
  const aad = Buffer.concat([GCM2_MAGIC, salt]);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // GCM2_MAGIC(4) + salt(16) + iv(12) + authTag(16) + ciphertext
  const combined = Buffer.concat([GCM2_MAGIC, salt, iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * 解密数据（自动检测格式，向后兼容）
 * - GCM2：scrypt 密钥派生 + AAD 头部保护
 * - GCM1：原始 AES-256-GCM
 * - CryptoJS：旧版 AES-CBC（Salted__ 前缀）
 */
export function decrypt(cipherText: string): string {
  if (!cipherText) {
    throw new Error('密文为空');
  }

  const raw = Buffer.from(cipherText, 'base64');

  // 检测 GCM2 格式：前 4 字节为 GCM2_MAGIC
  if (raw.length >= GCM2_MAGIC.length && raw.subarray(0, GCM2_MAGIC.length).equals(GCM2_MAGIC)) {
    return decryptGCM2(raw, env.API_KEY_ENCRYPTION_KEY);
  }

  // 检测 GCM1 格式：前 4 字节为 GCM1_MAGIC
  if (raw.length >= GCM1_MAGIC.length && raw.subarray(0, GCM1_MAGIC.length).equals(GCM1_MAGIC)) {
    return decryptGCM1(raw, env.API_KEY_ENCRYPTION_KEY);
  }

  // 回退到旧 CryptoJS 格式
  try {
    return decryptLegacyCryptoJS(cipherText, env.API_KEY_ENCRYPTION_KEY);
  } catch {
    throw new Error('解密失败：密钥不匹配或密文损坏');
  }
}

/**
 * GCM2 解密：使用 AAD 验证头部完整性，scrypt 派生密钥解密
 */
function decryptGCM2(raw: Buffer, passphrase: string): string {
  // 最小长度：magic(4) + salt(16) + iv(12) + authTag(16) = 48，ciphertext 可为 0（空明文）
  const minLen = GCM2_MAGIC.length + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  if (raw.length < minLen) {
    throw new Error('解密失败：GCM2 密文数据不完整');
  }

  let offset = GCM2_MAGIC.length;
  const salt = raw.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = raw.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const authTag = raw.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;
  const cipherBytes = raw.subarray(offset);

  const key = deriveKeyV2(passphrase, salt);

  // AAD 必须与加密时一致
  const aad = Buffer.concat([GCM2_MAGIC, salt]);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(cipherBytes), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('解密失败：密钥不匹配或密文损坏');
  }
}

/**
 * GCM1 解密（向后兼容旧版 GCM 格式）
 */
function decryptGCM1(raw: Buffer, passphrase: string): string {
  // 最小长度：magic(4) + salt(16) + iv(12) + authTag(16) = 48，ciphertext 可为 0（空明文）
  const minLen = GCM1_MAGIC.length + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  if (raw.length < minLen) {
    throw new Error('解密失败：GCM1 密文数据不完整');
  }

  let offset = GCM1_MAGIC.length;
  const salt = raw.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = raw.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const authTag = raw.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;
  const cipherBytes = raw.subarray(offset);

  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(cipherBytes), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('解密失败：密钥不匹配或密文损坏');
  }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 生成安全的随机字符串
 */
export function generateSecureToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);

  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[(bytes[i] as number) % chars.length];
  }

  return result;
}

/**
 * 计算 HMAC-SHA256 签名
 */
export function hmacSign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * 计算 MD5 哈希 (用于某些支付接口)
 */
export function md5Hash(data: string): string {
  return createHash('md5').update(data).digest('hex');
}

/**
 * 掩码敏感信息 (如 API Key)
 */
export function maskSensitive(value: string, visibleStart: number = 4, visibleEnd: number = 4): string {
  if (value.length <= visibleStart + visibleEnd) {
    return '*'.repeat(value.length);
  }

  const start = value.substring(0, visibleStart);
  const end = value.substring(value.length - visibleEnd);
  const masked = '*'.repeat(Math.min(value.length - visibleStart - visibleEnd, 8));

  return `${start}${masked}${end}`;
}

// ============================================================
// 原子写入
// ============================================================

/**
 * 原子写入文件：先写临时文件，再 rename 替换目标文件。
 * rename 在同一文件系统上是原子操作，可防止写入中断导致数据损坏。
 * 失败时自动清理临时文件，防止敏感数据残留。
 */
export async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmpPath, data, 'utf-8');
    await rename(tmpPath, filePath);
  } catch (error) {
    try {
      await unlink(tmpPath);
    } catch {
      // 临时文件可能未创建，忽略清理失败
    }
    throw error;
  }
}

// ============================================================
// 密文格式迁移
// ============================================================

/**
 * 检测密文格式版本
 * 返回 'GCM2' | 'GCM1' | 'CryptoJS' | 'unknown'
 */
export function detectCipherFormat(cipherText: string): 'GCM2' | 'GCM1' | 'CryptoJS' | 'unknown' {
  if (!cipherText) return 'unknown';

  const raw = Buffer.from(cipherText, 'base64');

  if (raw.length >= GCM2_MAGIC.length && raw.subarray(0, GCM2_MAGIC.length).equals(GCM2_MAGIC)) {
    return 'GCM2';
  }

  if (raw.length >= GCM1_MAGIC.length && raw.subarray(0, GCM1_MAGIC.length).equals(GCM1_MAGIC)) {
    return 'GCM1';
  }

  if (raw.length >= 8 && raw.subarray(0, 8).toString('utf8') === 'Salted__') {
    return 'CryptoJS';
  }

  return 'unknown';
}

/**
 * 将旧格式密文重加密为 GCM2 格式。
 * 如果已经是 GCM2 格式则原样返回。
 * 用于数据迁移场景。
 */
export function reEncryptToGCM2(cipherText: string): string {
  const format = detectCipherFormat(cipherText);
  if (format === 'GCM2') {
    return cipherText;
  }

  const plainText = decrypt(cipherText);
  return encrypt(plainText);
}

// ============================================================
// 密钥轮换
// ============================================================

/**
 * 使用指定的旧密钥解密密文（支持所有格式：GCM2、GCM1、CryptoJS）
 */
function decryptWithKey(cipherText: string, passphrase: string): string {
  if (!cipherText) {
    throw new Error('密文为空');
  }

  const raw = Buffer.from(cipherText, 'base64');

  if (raw.length >= GCM2_MAGIC.length && raw.subarray(0, GCM2_MAGIC.length).equals(GCM2_MAGIC)) {
    return decryptGCM2(raw, passphrase);
  }

  if (raw.length >= GCM1_MAGIC.length && raw.subarray(0, GCM1_MAGIC.length).equals(GCM1_MAGIC)) {
    return decryptGCM1(raw, passphrase);
  }

  // 回退到旧 CryptoJS 格式
  return decryptLegacyCryptoJS(cipherText, passphrase);
}

/**
 * 使用指定的新密钥加密明文为 GCM2 格式
 */
function encryptWithKey(plainText: string, passphrase: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKeyV2(passphrase, salt);

  const aad = Buffer.concat([GCM2_MAGIC, salt]);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([GCM2_MAGIC, salt, iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * 密钥轮换：用旧密钥解密，再用新密钥重新加密为 GCM2 格式。
 *
 * 使用场景：
 * 1. 运维需要轮换 API_KEY_ENCRYPTION_KEY 时
 * 2. 批量迁移数据库中的加密字段
 *
 * @param cipherText - 用旧密钥加密的密文
 * @param oldKey - 旧的加密密钥（API_KEY_ENCRYPTION_KEY 的旧值）
 * @param newKey - 新的加密密钥（API_KEY_ENCRYPTION_KEY 的新值）
 * @returns 用新密钥加密的 GCM2 格式密文
 * @throws 如果旧密钥无法解密密文，抛出错误
 */
export function migrateEncryption(cipherText: string, oldKey: string, newKey: string): string {
  if (!oldKey || !newKey) {
    throw new Error('密钥轮换：旧密钥和新密钥均不能为空');
  }

  if (oldKey === newKey) {
    // 密钥相同，仅做格式升级
    const format = detectCipherFormat(cipherText);
    if (format === 'GCM2') {
      return cipherText;
    }
  }

  const plainText = decryptWithKey(cipherText, oldKey);
  return encryptWithKey(plainText, newKey);
}
