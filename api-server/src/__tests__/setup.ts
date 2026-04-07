/**
 * Vitest 测试环境设置
 * 这个文件在所有测试之前运行
 */

import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Mock 环境变量
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.API_BASE_URL = 'http://localhost:3001';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.STRIPE_SECRET_KEY = 'sk_test_1234567890';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_1234567890';
process.env.XUNHUPAY_APPID = 'test-appid';
process.env.XUNHUPAY_APPSECRET = 'test-appsecret';
process.env.XUNHUPAY_GATEWAY_URL = 'https://api.xunhupay.com/payment/do.html';
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long!!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.API_KEY_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX_REQUESTS = '100';
process.env.LOG_LEVEL = 'error';
process.env.CORS_ORIGINS = 'http://localhost:3000';

// 全局 Mock
beforeAll(() => {
  // 禁用控制台噪音
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllTimers();
});

// 全局测试辅助函数
export const createMockRequest = (overrides = {}) => ({
  headers: {},
  body: {},
  query: {},
  params: {},
  userId: undefined,
  userEmail: undefined,
  userRole: undefined,
  user: undefined,
  ...overrides,
});

export const createMockResponse = () => {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.write = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  return res;
};

export const createMockNext = (): ReturnType<typeof vi.fn> => vi.fn();

// Mock 用户数据
export const mockUser = {
  id: 'user_test_123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user' as const,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date('2025-01-01'),
};

export const mockAdminUser = {
  id: 'admin_test_123',
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'admin' as const,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date('2025-01-01'),
};

export const mockBalance = {
  balance: '100.0000',
  currency: 'USD',
  totalDeposited: '150.0000',
  totalSpent: '50.0000',
};
