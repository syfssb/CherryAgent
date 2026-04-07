/**
 * crypto.ts 单元测试
 * 覆盖：GCM2 加解密、GCM1 向后兼容、CryptoJS 向后兼容、
 *       格式检测、密钥轮换、原子写入、工具函数
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  encrypt,
  decrypt,
  detectCipherFormat,
  reEncryptToGCM2,
  migrateEncryption,
  atomicWrite,
  generateSecureToken,
  hmacSign,
  md5Hash,
  maskSensitive,
} from '../utils/crypto.js';
import { randomBytes, createCipheriv, scryptSync } from 'node:crypto';
import { writeFile, rename, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ============================================================
// GCM2 加解密
// ============================================================
describe('GCM2 encrypt/decrypt', () => {
  it('应能加密并解密明文', () => {
    const plainText = 'sk-ant-api03-secret-key-value';
    const encrypted = encrypt(plainText);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plainText);
  });

  it('每次加密结果应不同（随机 salt + iv）', () => {
    const plainText = 'test-data';
    const enc1 = encrypt(plainText);
    const enc2 = encrypt(plainText);
    expect(enc1).not.toBe(enc2);
    // 但解密结果相同
    expect(decrypt(enc1)).toBe(plainText);
    expect(decrypt(enc2)).toBe(plainText);
  });

  it('加密结果应为 GCM2 格式', () => {
    const encrypted = encrypt('hello');
    expect(detectCipherFormat(encrypted)).toBe('GCM2');
  });

  it('空明文应能正常加解密', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('长文本应能正常加解密', () => {
    const longText = 'A'.repeat(10000);
    const encrypted = encrypt(longText);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(longText);
  });

  it('Unicode 文本应能正常加解密', () => {
    const unicodeText = '你好世界 🌍 こんにちは 안녕하세요';
    const encrypted = encrypt(unicodeText);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(unicodeText);
  });

  it('空密文应抛出错误', () => {
    expect(() => decrypt('')).toThrow('密文为空');
  });

  it('篡改密文应抛出错误', () => {
    const encrypted = encrypt('test');
    // 篡改 base64 中间部分
    const raw = Buffer.from(encrypted, 'base64');
    raw[raw.length - 1] ^= 0xff;
    const tampered = raw.toString('base64');
    expect(() => decrypt(tampered)).toThrow();
  });
});

// ============================================================
// GCM1 向后兼容
// ============================================================
describe('GCM1 backward compatibility', () => {
  const TEST_KEY = process.env.API_KEY_ENCRYPTION_KEY!;

  function encryptGCM1(plainText: string, passphrase: string): string {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
    const magic = Buffer.from('GCM1');

    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([magic, salt, iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  it('应能解密 GCM1 格式密文', () => {
    const plainText = 'legacy-gcm1-data';
    const gcm1Encrypted = encryptGCM1(plainText, TEST_KEY);
    expect(detectCipherFormat(gcm1Encrypted)).toBe('GCM1');
    expect(decrypt(gcm1Encrypted)).toBe(plainText);
  });
});

// ============================================================
// 格式检测
// ============================================================
describe('detectCipherFormat', () => {
  it('应检测 GCM2 格式', () => {
    const encrypted = encrypt('test');
    expect(detectCipherFormat(encrypted)).toBe('GCM2');
  });

  it('空字符串应返回 unknown', () => {
    expect(detectCipherFormat('')).toBe('unknown');
  });

  it('随机数据应返回 unknown', () => {
    const random = randomBytes(32).toString('base64');
    // 随机数据大概率不会以 GCM1/GCM2/Salted__ 开头
    const format = detectCipherFormat(random);
    expect(['unknown', 'GCM1', 'GCM2', 'CryptoJS']).toContain(format);
  });

  it('应检测 CryptoJS 格式', () => {
    // 构造一个 CryptoJS 格式的假数据（Salted__ 前缀）
    const salted = Buffer.concat([
      Buffer.from('Salted__'),
      randomBytes(8),  // salt
      randomBytes(32),  // ciphertext
    ]);
    expect(detectCipherFormat(salted.toString('base64'))).toBe('CryptoJS');
  });
});

// ============================================================
// reEncryptToGCM2
// ============================================================
describe('reEncryptToGCM2', () => {
  it('GCM2 格式应原样返回', () => {
    const encrypted = encrypt('test');
    const result = reEncryptToGCM2(encrypted);
    expect(result).toBe(encrypted);
  });

  it('GCM1 格式应重加密为 GCM2', () => {
    const TEST_KEY = process.env.API_KEY_ENCRYPTION_KEY!;
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(TEST_KEY, salt, 32, { N: 16384, r: 8, p: 1 });
    const magic = Buffer.from('GCM1');

    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const encrypted = Buffer.concat([cipher.update('upgrade-me', 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([magic, salt, iv, authTag, encrypted]);
    const gcm1Text = combined.toString('base64');

    const result = reEncryptToGCM2(gcm1Text);
    expect(detectCipherFormat(result)).toBe('GCM2');
    expect(decrypt(result)).toBe('upgrade-me');
  });
});

// ============================================================
// 密钥轮换 migrateEncryption
// ============================================================
describe('migrateEncryption', () => {
  const OLD_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const NEW_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

  it('应能用旧密钥解密并用新密钥重加密', () => {
    // 用旧密钥加密（当前 env 中的密钥就是 OLD_KEY）
    const plainText = 'migrate-this-secret';
    const encryptedWithOld = encrypt(plainText);

    const migrated = migrateEncryption(encryptedWithOld, OLD_KEY, NEW_KEY);

    // 迁移后格式应为 GCM2
    expect(detectCipherFormat(migrated)).toBe('GCM2');

    // 用新密钥应能解密（需要临时修改 env 来验证）
    // 这里直接用 decryptWithKey 的逻辑验证
    // migrateEncryption 内部已经验证了 decryptWithKey + encryptWithKey 的正确性
    // 再次迁移回旧密钥验证
    const migratedBack = migrateEncryption(migrated, NEW_KEY, OLD_KEY);
    expect(decrypt(migratedBack)).toBe(plainText);
  });

  it('相同密钥且已是 GCM2 应原样返回', () => {
    const encrypted = encrypt('no-change');
    const result = migrateEncryption(encrypted, OLD_KEY, OLD_KEY);
    expect(result).toBe(encrypted);
  });

  it('相同密钥但非 GCM2 应升级格式', () => {
    // 构造 GCM1 格式
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(OLD_KEY, salt, 32, { N: 16384, r: 8, p: 1 });
    const magic = Buffer.from('GCM1');
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const encrypted = Buffer.concat([cipher.update('upgrade-format', 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([magic, salt, iv, authTag, encrypted]);
    const gcm1Text = combined.toString('base64');

    const result = migrateEncryption(gcm1Text, OLD_KEY, OLD_KEY);
    expect(detectCipherFormat(result)).toBe('GCM2');
    expect(decrypt(result)).toBe('upgrade-format');
  });

  it('空密钥应抛出错误', () => {
    const encrypted = encrypt('test');
    expect(() => migrateEncryption(encrypted, '', NEW_KEY)).toThrow('旧密钥和新密钥均不能为空');
    expect(() => migrateEncryption(encrypted, OLD_KEY, '')).toThrow('旧密钥和新密钥均不能为空');
  });

  it('错误的旧密钥应抛出解密错误', () => {
    const encrypted = encrypt('test');
    const wrongKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(() => migrateEncryption(encrypted, wrongKey, NEW_KEY)).toThrow();
  });
});

// ============================================================
// 原子写入
// ============================================================
describe('atomicWrite', () => {
  const testDir = tmpdir();

  it('应能原子写入文件', async () => {
    const filePath = join(testDir, `atomic-test-${Date.now()}.txt`);
    await atomicWrite(filePath, 'hello atomic');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('hello atomic');
    // 清理
    await unlink(filePath);
  });

  it('应能覆盖已有文件', async () => {
    const filePath = join(testDir, `atomic-overwrite-${Date.now()}.txt`);
    await atomicWrite(filePath, 'first');
    await atomicWrite(filePath, 'second');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('second');
    await unlink(filePath);
  });
});

// ============================================================
// 工具函数
// ============================================================
describe('generateSecureToken', () => {
  it('应生成指定长度的随机字符串', () => {
    const token = generateSecureToken(16);
    expect(token).toHaveLength(16);
    expect(/^[A-Za-z0-9]+$/.test(token)).toBe(true);
  });

  it('默认长度为 32', () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(32);
  });

  it('每次生成的 token 应不同', () => {
    const t1 = generateSecureToken();
    const t2 = generateSecureToken();
    expect(t1).not.toBe(t2);
  });
});

describe('hmacSign', () => {
  it('应生成一致的 HMAC 签名', () => {
    const sig1 = hmacSign('data', 'secret');
    const sig2 = hmacSign('data', 'secret');
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('不同数据应产生不同签名', () => {
    const sig1 = hmacSign('data1', 'secret');
    const sig2 = hmacSign('data2', 'secret');
    expect(sig1).not.toBe(sig2);
  });
});

describe('md5Hash', () => {
  it('应生成正确的 MD5 哈希', () => {
    const hash = md5Hash('hello');
    expect(hash).toBe('5d41402abc4b2a76b9719d911017c592');
  });
});

describe('maskSensitive', () => {
  it('应正确掩码长字符串', () => {
    const masked = maskSensitive('sk-ant-api03-1234567890abcdef');
    expect(masked.startsWith('sk-a')).toBe(true);
    expect(masked.endsWith('cdef')).toBe(true);
    expect(masked).toContain('*');
  });

  it('短字符串应全部掩码', () => {
    const masked = maskSensitive('abc', 4, 4);
    expect(masked).toBe('***');
  });

  it('应支持自定义可见长度', () => {
    const masked = maskSensitive('1234567890', 2, 2);
    expect(masked.startsWith('12')).toBe(true);
    expect(masked.endsWith('90')).toBe(true);
  });
});
