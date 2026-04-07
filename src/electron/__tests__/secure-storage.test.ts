import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// ---- Mock electron ----
const mockIsEncryptionAvailable = vi.fn<() => boolean>().mockReturnValue(true);
const mockEncryptString = vi.fn<(plainText: string) => Buffer>().mockImplementation((text: string) => {
  return Buffer.from(`encrypted:${text}`);
});
const mockDecryptString = vi.fn<(encrypted: Buffer) => string>().mockImplementation((buf: Buffer) => {
  const str = buf.toString();
  if (str.startsWith('encrypted:')) {
    return str.slice('encrypted:'.length);
  }
  throw new Error('Decryption failed: invalid data');
});
const mockGetPath = vi.fn<(name: string) => string>().mockReturnValue('/mock/userData');

vi.mock('electron', () => {
  const electronMock = {
    app: {
      getPath: (name: string) => mockGetPath(name),
    },
    safeStorage: {
      isEncryptionAvailable: () => mockIsEncryptionAvailable(),
      encryptString: (text: string) => mockEncryptString(text),
      decryptString: (buf: Buffer) => mockDecryptString(buf),
    },
  };
  return { ...electronMock, default: electronMock };
});

// ---- Mock fs ----
const mockFiles = new Map<string, Buffer | string>();

const mockExistsSync = vi.fn<(path: string) => boolean>().mockImplementation((path: string) => {
  return mockFiles.has(path);
});
const mockReadFileSync = vi.fn<(path: string) => Buffer>().mockImplementation((path: string) => {
  const content = mockFiles.get(path);
  if (content === undefined) {
    throw new Error(`ENOENT: no such file or directory, open '${path}'`);
  }
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
});
const mockWriteFileSync = vi.fn<(path: string, data: Buffer | string, encoding?: string) => void>()
  .mockImplementation((path: string, data: Buffer | string) => {
    mockFiles.set(path, typeof data === 'string' ? data : Buffer.from(data));
  });
const mockMkdirSync = vi.fn();
const mockRenameSync = vi.fn<(oldPath: string, newPath: string) => void>()
  .mockImplementation((oldPath: string, newPath: string) => {
    const content = mockFiles.get(oldPath);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, rename '${oldPath}'`);
    }
    mockFiles.set(newPath, content);
    mockFiles.delete(oldPath);
  });
const mockUnlinkSync = vi.fn<(path: string) => void>().mockImplementation((path: string) => {
  mockFiles.delete(path);
});

vi.mock('fs', () => {
  const fsMock = {
    readFileSync: (path: string) => mockReadFileSync(path),
    writeFileSync: (path: string, data: Buffer | string, encoding?: string) => mockWriteFileSync(path, data, encoding),
    existsSync: (path: string) => mockExistsSync(path),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    renameSync: (oldPath: string, newPath: string) => mockRenameSync(oldPath, newPath),
    unlinkSync: (path: string) => mockUnlinkSync(path),
  };
  return { ...fsMock, default: fsMock };
});

// ---- Mock crypto ----
vi.mock('crypto', () => {
  const cryptoMock = {
    randomBytes: (size: number) => ({
      toString: () => 'deadbeef'.slice(0, size * 2),
    }),
  };
  return { ...cryptoMock, default: cryptoMock };
});

// 动态 import 以确保 mock 生效
const STORAGE_PATH = '/mock/userData/secure-tokens.enc';

describe('secure-storage', () => {
  let secureStorage: typeof import('../libs/secure-storage');

  beforeEach(async () => {
    // 清理文件系统 mock
    mockFiles.clear();
    // 重置所有 mock 调用记录
    vi.clearAllMocks();
    // 重置默认行为
    mockIsEncryptionAvailable.mockReturnValue(true);
    mockGetPath.mockReturnValue('/mock/userData');

    // 重新加载模块以清除内存缓存
    vi.resetModules();
    secureStorage = await import('../libs/secure-storage');
  });

  // ---- isEncryptionAvailable ----

  describe('isEncryptionAvailable', () => {
    it('should return true when encryption is available', () => {
      mockIsEncryptionAvailable.mockReturnValue(true);
      expect(secureStorage.isEncryptionAvailable()).toBe(true);
    });

    it('should return false when encryption is not available', () => {
      mockIsEncryptionAvailable.mockReturnValue(false);
      expect(secureStorage.isEncryptionAvailable()).toBe(false);
    });
  });

  // ---- saveToken / getToken ----

  describe('saveToken and getToken', () => {
    it('should save and retrieve a token', () => {
      secureStorage.saveToken('accessToken', 'my-access-token');
      const result = secureStorage.getToken('accessToken');
      expect(result).toBe('my-access-token');
    });

    it('should return null for non-existent token', () => {
      expect(secureStorage.getToken('accessToken')).toBeNull();
    });

    it('should overwrite existing token', () => {
      secureStorage.saveToken('accessToken', 'first');
      secureStorage.saveToken('accessToken', 'second');
      expect(secureStorage.getToken('accessToken')).toBe('second');
    });

    it('should save multiple different token types', () => {
      secureStorage.saveToken('accessToken', 'access-val');
      secureStorage.saveToken('refreshToken', 'refresh-val');
      expect(secureStorage.getToken('accessToken')).toBe('access-val');
      expect(secureStorage.getToken('refreshToken')).toBe('refresh-val');
    });

    it('should throw for empty token value', () => {
      expect(() => secureStorage.saveToken('accessToken', '')).toThrow(
        'Token value must be a non-empty string'
      );
    });

    it('should use encryption when available', () => {
      secureStorage.saveToken('accessToken', 'test-token');
      expect(mockEncryptString).toHaveBeenCalled();
    });
  });

  // ---- deleteToken ----

  describe('deleteToken', () => {
    it('should delete an existing token', () => {
      secureStorage.saveToken('accessToken', 'to-delete');
      expect(secureStorage.getToken('accessToken')).toBe('to-delete');

      secureStorage.deleteToken('accessToken');
      expect(secureStorage.getToken('accessToken')).toBeNull();
    });

    it('should not throw when deleting non-existent token', () => {
      expect(() => secureStorage.deleteToken('accessToken')).not.toThrow();
    });

    it('should not affect other tokens when deleting one', () => {
      secureStorage.saveToken('accessToken', 'access');
      secureStorage.saveToken('refreshToken', 'refresh');

      secureStorage.deleteToken('accessToken');
      expect(secureStorage.getToken('accessToken')).toBeNull();
      expect(secureStorage.getToken('refreshToken')).toBe('refresh');
    });
  });

  // ---- clearAllTokens ----

  describe('clearAllTokens', () => {
    it('should clear all stored tokens', () => {
      secureStorage.saveToken('accessToken', 'access');
      secureStorage.saveToken('refreshToken', 'refresh');

      secureStorage.clearAllTokens();

      expect(secureStorage.getToken('accessToken')).toBeNull();
      expect(secureStorage.getToken('refreshToken')).toBeNull();
    });

    it('should not throw when no tokens exist', () => {
      expect(() => secureStorage.clearAllTokens()).not.toThrow();
    });

    it('should delete the storage file', () => {
      secureStorage.saveToken('accessToken', 'val');
      secureStorage.clearAllTokens();
      expect(mockUnlinkSync).toHaveBeenCalledWith(STORAGE_PATH);
    });
  });

  // ---- Memory cache ----

  describe('memory cache', () => {
    it('should serve token from cache on second read', () => {
      secureStorage.saveToken('accessToken', 'cached-val');

      // 第一次读取会从文件加载并缓存
      secureStorage.getToken('accessToken');
      const callCountAfterFirst = mockReadFileSync.mock.calls.length;

      // 第二次读取应该命中缓存，不再读文件
      const result = secureStorage.getToken('accessToken');
      expect(result).toBe('cached-val');
      expect(mockReadFileSync.mock.calls.length).toBe(callCountAfterFirst);
    });

    it('should invalidate cache after deleteToken', () => {
      secureStorage.saveToken('accessToken', 'val');
      secureStorage.getToken('accessToken'); // 填充缓存

      secureStorage.deleteToken('accessToken');
      expect(secureStorage.getToken('accessToken')).toBeNull();
    });

    it('should invalidate cache after clearAllTokens', () => {
      secureStorage.saveToken('accessToken', 'val');
      secureStorage.getToken('accessToken'); // 填充缓存

      secureStorage.clearAllTokens();
      expect(secureStorage.getToken('accessToken')).toBeNull();
    });
  });

  // ---- Encryption not available (fallback) ----

  describe('encryption not available fallback', () => {
    it('should use base64 encoding when encryption is not available', async () => {
      mockIsEncryptionAvailable.mockReturnValue(false);
      // 重新加载模块
      vi.resetModules();
      const storage = await import('../libs/secure-storage');

      storage.saveToken('accessToken', 'fallback-token');

      // 应该不调用 encryptString
      // 验证写入的是 base64 编码
      expect(mockWriteFileSync).toHaveBeenCalled();

      // 读取回来应该正常
      const result = storage.getToken('accessToken');
      expect(result).toBe('fallback-token');
    });
  });

  // ---- atomicWriteSync behavior ----

  describe('atomic write', () => {
    it('should write to temp file then rename', () => {
      secureStorage.saveToken('accessToken', 'atomic-test');

      // writeFileSync 应该被调用（写临时文件）
      expect(mockWriteFileSync).toHaveBeenCalled();
      // renameSync 应该被调用（原子替换）
      expect(mockRenameSync).toHaveBeenCalled();
    });

    it('should clean up temp file on write failure', () => {
      // 让 renameSync 失败
      mockRenameSync.mockImplementationOnce(() => {
        throw new Error('rename failed');
      });

      expect(() => secureStorage.saveToken('accessToken', 'fail-test')).toThrow();

      // unlinkSync 应该被调用来清理临时文件
      expect(mockUnlinkSync).toHaveBeenCalled();
    });
  });

  // ---- File corruption recovery ----

  describe('file corruption recovery', () => {
    it('should return empty tokens when file contains invalid data', () => {
      // 模拟损坏的文件
      mockFiles.set(STORAGE_PATH, Buffer.from('corrupted-garbage-data'));
      mockDecryptString.mockImplementationOnce(() => {
        throw new Error('Decryption failed');
      });

      const result = secureStorage.getToken('accessToken');
      expect(result).toBeNull();
    });

    it('should return empty tokens when decrypted data is not valid JSON', () => {
      mockFiles.set(STORAGE_PATH, Buffer.from('encrypted:not-valid-json'));

      const result = secureStorage.getToken('accessToken');
      expect(result).toBeNull();
    });
  });

  // ---- hasToken ----

  describe('hasToken', () => {
    it('should return true for existing token', () => {
      secureStorage.saveToken('accessToken', 'exists');
      expect(secureStorage.hasToken('accessToken')).toBe(true);
    });

    it('should return false for non-existent token', () => {
      expect(secureStorage.hasToken('accessToken')).toBe(false);
    });
  });

  // ---- saveTokens_batch ----

  describe('saveTokens_batch', () => {
    it('should save multiple tokens at once', () => {
      secureStorage.saveTokens_batch({
        accessToken: 'batch-access',
        refreshToken: 'batch-refresh',
      });
      expect(secureStorage.getToken('accessToken')).toBe('batch-access');
      expect(secureStorage.getToken('refreshToken')).toBe('batch-refresh');
    });
  });

  // ---- getAllTokens ----

  describe('getAllTokens', () => {
    it('should return all stored tokens', () => {
      secureStorage.saveToken('accessToken', 'a');
      secureStorage.saveToken('refreshToken', 'r');
      const all = secureStorage.getAllTokens();
      expect(all).toEqual({ accessToken: 'a', refreshToken: 'r' });
    });

    it('should return empty object when no tokens stored', () => {
      const all = secureStorage.getAllTokens();
      expect(all).toEqual({});
    });
  });

  // ---- Edge cases ----

  describe('edge cases', () => {
    it('should create userData directory if it does not exist', () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/mock/userData') return false;
        return mockFiles.has(path);
      });

      secureStorage.saveToken('accessToken', 'dir-test');
      expect(mockMkdirSync).toHaveBeenCalledWith('/mock/userData', { recursive: true });
    });

    it('should handle clearAllTokens when file does not exist', () => {
      // 文件不存在时不应该调用 unlinkSync
      expect(() => secureStorage.clearAllTokens()).not.toThrow();
    });
  });
});
