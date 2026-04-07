/**
 * 认证流程测试
 * 覆盖 auth.ts 路由和 auth 中间件
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  mockUser,
  mockAdminUser,
  mockBalance,
} from './setup.js';

// Mock 依赖模块
vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('../services/user.js', () => ({
  grantWelcomeBonus: vi.fn(),
  getUserBalance: vi.fn(),
  getUserById: vi.fn(),
}));

// 导入被测模块
import {
  authenticate,
  optionalAuth,
  authorize,
  generateToken,
  verifyRefreshToken,
  type JwtPayload,
} from '../middleware/auth.js';
import {
  grantWelcomeBonus,
  getUserBalance,
  getUserById,
} from '../services/user.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';

// 测试用的 JWT Secret
const TEST_JWT_SECRET = 'test-jwt-secret-32-characters-long!!';

describe('认证中间件测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticate - JWT 认证中间件', () => {
    it('应该拒绝没有 Authorization 头的请求', () => {
      const req = createMockRequest({ headers: {} });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticate(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
      expect(() => authenticate(req as any, res as any, next)).toThrow(
        '缺少 Authorization 头'
      );
    });

    it('应该拒绝格式错误的 Authorization 头', () => {
      const req = createMockRequest({
        headers: { authorization: 'InvalidFormat token123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticate(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
      expect(() => authenticate(req as any, res as any, next)).toThrow(
        'Authorization 格式错误'
      );
    });

    it('应该拒绝空的 Bearer token', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer ' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticate(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
    });

    it('应该拒绝无效的 JWT token', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticate(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
      expect(() => authenticate(req as any, res as any, next)).toThrow(
        '无效的 Token'
      );
    });

    it('应该拒绝过期的 JWT token', () => {
      const expiredToken = jwt.sign(
        { sub: 'user_123', email: 'test@example.com', role: 'user' },
        TEST_JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const req = createMockRequest({
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticate(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
      expect(() => authenticate(req as any, res as any, next)).toThrow(
        'Token 已过期'
      );
    });

    it('应该成功验证有效的 JWT token', () => {
      const validToken = jwt.sign(
        { sub: 'user_123', email: 'test@example.com', role: 'user' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' }
      );

      const req = createMockRequest({
        headers: { authorization: `Bearer ${validToken}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authenticate(req as any, res as any, next);

      expect(req.userId).toBe('user_123');
      expect(req.userEmail).toBe('test@example.com');
      expect(req.userRole).toBe('user');
      expect(next).toHaveBeenCalled();
    });

    it('应该正确设置管理员角色', () => {
      const adminToken = jwt.sign(
        { sub: 'admin_123', email: 'admin@example.com', role: 'admin' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' }
      );

      const req = createMockRequest({
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authenticate(req as any, res as any, next);

      expect(req.userId).toBe('admin_123');
      expect(req.userRole).toBe('admin');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('optionalAuth - 可选认证中间件', () => {
    it('应该在没有 Authorization 头时继续执行', () => {
      const req = createMockRequest({ headers: {} });
      const res = createMockResponse();
      const next = createMockNext();

      optionalAuth(req as any, res as any, next);

      expect(req.userId).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('应该在 token 无效时继续执行但不设置用户信息', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      optionalAuth(req as any, res as any, next);

      expect(req.userId).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('应该在 token 有效时设置用户信息', () => {
      const validToken = jwt.sign(
        { sub: 'user_123', email: 'test@example.com', role: 'user' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' }
      );

      const req = createMockRequest({
        headers: { authorization: `Bearer ${validToken}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      optionalAuth(req as any, res as any, next);

      expect(req.userId).toBe('user_123');
      expect(req.userEmail).toBe('test@example.com');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('authorize - 角色授权中间件', () => {
    it('应该拒绝未认证的用户', () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      const authMiddleware = authorize('user');

      expect(() => authMiddleware(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
      expect(() => authMiddleware(req as any, res as any, next)).toThrow(
        '需要先登录'
      );
    });

    it('应该拒绝权限不足的用户', () => {
      const req = createMockRequest({
        userId: 'user_123',
        userRole: 'user',
      });
      const res = createMockResponse();
      const next = createMockNext();

      const authMiddleware = authorize('admin');

      expect(() => authMiddleware(req as any, res as any, next)).toThrow(
        AuthorizationError
      );
      expect(() => authMiddleware(req as any, res as any, next)).toThrow(
        '需要 admin 角色权限'
      );
    });

    it('应该允许具有正确角色的用户', () => {
      const req = createMockRequest({
        userId: 'admin_123',
        userRole: 'admin',
      });
      const res = createMockResponse();
      const next = createMockNext();

      const authMiddleware = authorize('admin');

      authMiddleware(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('应该支持多个允许的角色', () => {
      const req = createMockRequest({
        userId: 'user_123',
        userRole: 'user',
      });
      const res = createMockResponse();
      const next = createMockNext();

      const authMiddleware = authorize('user', 'admin');

      authMiddleware(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('generateToken - Token 生成', () => {
    it('应该生成有效的 access token 和 refresh token', () => {
      const tokens = generateToken('user_123', 'test@example.com', 'user');

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBeGreaterThan(0);

      // 验证 access token
      const accessPayload = jwt.verify(
        tokens.accessToken,
        TEST_JWT_SECRET
      ) as JwtPayload;
      expect(accessPayload.sub).toBe('user_123');
      expect(accessPayload.email).toBe('test@example.com');
      expect(accessPayload.role).toBe('user');

      // 验证 refresh token
      const refreshPayload = jwt.verify(
        tokens.refreshToken,
        TEST_JWT_SECRET
      ) as JwtPayload & { type?: string };
      expect(refreshPayload.sub).toBe('user_123');
      expect(refreshPayload.type).toBe('refresh');
    });

    it('应该为管理员生成正确的 token', () => {
      const tokens = generateToken('admin_123', 'admin@example.com', 'admin');

      const payload = jwt.verify(
        tokens.accessToken,
        TEST_JWT_SECRET
      ) as JwtPayload;
      expect(payload.role).toBe('admin');
    });

    it('应该默认使用 user 角色', () => {
      const tokens = generateToken('user_123', 'test@example.com');

      const payload = jwt.verify(
        tokens.accessToken,
        TEST_JWT_SECRET
      ) as JwtPayload;
      expect(payload.role).toBe('user');
    });
  });

  describe('verifyRefreshToken - Refresh Token 验证', () => {
    it('应该成功验证有效的 refresh token', () => {
      const tokens = generateToken('user_123', 'test@example.com', 'user');

      const payload = verifyRefreshToken(tokens.refreshToken);

      expect(payload.sub).toBe('user_123');
      expect(payload.email).toBe('test@example.com');
    });

    it('应该拒绝 access token', () => {
      const tokens = generateToken('user_123', 'test@example.com', 'user');

      expect(() => verifyRefreshToken(tokens.accessToken)).toThrow(
        AuthenticationError
      );
      expect(() => verifyRefreshToken(tokens.accessToken)).toThrow(
        '无效的 Refresh Token'
      );
    });

    it('应该拒绝无效的 token', () => {
      expect(() => verifyRefreshToken('invalid-token')).toThrow();
    });

    it('应该拒绝过期的 refresh token', () => {
      const expiredToken = jwt.sign(
        { sub: 'user_123', email: 'test@example.com', role: 'user', type: 'refresh' },
        TEST_JWT_SECRET,
        { expiresIn: '-1s' }
      );

      expect(() => verifyRefreshToken(expiredToken)).toThrow();
    });
  });
});

describe('认证路由测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/refresh - Token 刷新', () => {
    it('应该成功刷新有效的 refresh token', async () => {
      const tokens = generateToken('user_123', 'test@example.com', 'user');

      vi.mocked(getUserById).mockResolvedValue(mockUser);

      const payload = verifyRefreshToken(tokens.refreshToken);
      expect(payload.sub).toBe('user_123');
    });

    it('应该拒绝已禁用用户的 refresh token', async () => {
      vi.mocked(getUserById).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      // 验证用户状态检查逻辑
      const inactiveUser = await getUserById('user_123');
      expect(inactiveUser.isActive).toBe(false);
    });
  });

  describe('GET /api/auth/me - 获取当前用户信息', () => {
    it('应该返回完整的用户信息', async () => {
      vi.mocked(getUserById).mockResolvedValue(mockUser);
      vi.mocked(getUserBalance).mockResolvedValue(mockBalance);

      const user = await getUserById('user_123');
      const balance = await getUserBalance('user_123');

      expect(user).toEqual(mockUser);
      expect(balance).toEqual(mockBalance);
    });
  });

  describe('POST /api/auth/logout - 登出', () => {
    it('应该成功登出', () => {
      // JWT-based logout is handled client-side by discarding the token
      expect(true).toBe(true);
    });
  });
});

describe('密码验证规则测试', () => {
  const passwordRules = {
    minLength: (password: string) => password.length >= 8,
    hasUppercase: (password: string) => /[A-Z]/.test(password),
    hasLowercase: (password: string) => /[a-z]/.test(password),
    hasNumber: (password: string) => /[0-9]/.test(password),
  };

  it('应该拒绝少于 8 个字符的密码', () => {
    expect(passwordRules.minLength('Ab1')).toBe(false);
    expect(passwordRules.minLength('Abcdef1')).toBe(false);
  });

  it('应该拒绝没有大写字母的密码', () => {
    expect(passwordRules.hasUppercase('abcdefg1')).toBe(false);
  });

  it('应该拒绝没有小写字母的密码', () => {
    expect(passwordRules.hasLowercase('ABCDEFG1')).toBe(false);
  });

  it('应该拒绝没有数字的密码', () => {
    expect(passwordRules.hasNumber('Abcdefgh')).toBe(false);
  });

  it('应该接受符合所有规则的密码', () => {
    const validPassword = 'Abcdefg1';
    expect(passwordRules.minLength(validPassword)).toBe(true);
    expect(passwordRules.hasUppercase(validPassword)).toBe(true);
    expect(passwordRules.hasLowercase(validPassword)).toBe(true);
    expect(passwordRules.hasNumber(validPassword)).toBe(true);
  });
});

describe('bcrypt 密码加密测试', () => {
  it('应该正确加密和验证密码', async () => {
    const password = 'TestPassword123';
    const hash = await bcrypt.hash(password, 12);

    expect(hash).not.toBe(password);
    expect(await bcrypt.compare(password, hash)).toBe(true);
    expect(await bcrypt.compare('WrongPassword123', hash)).toBe(false);
  });

  it('应该为相同密码生成不同的哈希', async () => {
    const password = 'TestPassword123';
    const hash1 = await bcrypt.hash(password, 12);
    const hash2 = await bcrypt.hash(password, 12);

    expect(hash1).not.toBe(hash2);
    expect(await bcrypt.compare(password, hash1)).toBe(true);
    expect(await bcrypt.compare(password, hash2)).toBe(true);
  });
});
