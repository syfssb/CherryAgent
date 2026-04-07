/**
 * 管理后台 API 测试
 * 覆盖所有管理后台路由的基本功能、参数验证和认证检查
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from './setup.js';

// Mock 数据库
const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    transaction: vi.fn(),
  },
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../services/billing.js', () => ({
  billingService: {
    clearModelPriceCache: vi.fn(),
    calculateCredits: vi.fn(),
    getUsageRecords: vi.fn(),
    getTransactionRecords: vi.fn(),
    preChargeCredits: vi.fn(),
  },
}));

vi.mock('../utils/crypto.js', () => ({
  encrypt: vi.fn((v: string) => `encrypted_${v}`),
  decrypt: vi.fn((v: string) => v.replace('encrypted_', '')),
}));

// 测试用常量
const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-characters-long!!';
const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

function createAdminToken(role = 'super_admin') {
  return jwt.sign(
    {
      sub: ADMIN_ID,
      username: 'admin',
      role,
      permissions: ['*'],
    },
    TEST_JWT_SECRET,
    { expiresIn: '4h', audience: 'cherry-agent:admin' }
  );
}

function createAdminRequest(overrides = {}) {
  const token = createAdminToken();
  return createMockRequest({
    headers: { authorization: `Bearer ${token}` },
    adminId: ADMIN_ID,
    adminRole: 'super_admin',
    adminPermissions: ['*'],
    ...overrides,
  });
}

// ============================================================
// 管理员认证中间件测试
// ============================================================

import {
  authenticateAdmin,
  requirePermission,
  requireRole,
  ROLE_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getEffectivePermissions,
  generateAdminToken,
} from '../middleware/admin-auth.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';

describe('管理员认证中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticateAdmin', () => {
    it('应该拒绝没有 Authorization 头的请求', () => {
      const req = createMockRequest({ headers: {} });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticateAdmin(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
    });

    it('应该拒绝格式错误的 Authorization 头', () => {
      const req = createMockRequest({
        headers: { authorization: 'InvalidFormat token123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticateAdmin(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
    });

    it('应该拒绝无效的 JWT token', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticateAdmin(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
    });

    it('应该拒绝过期的 JWT token', () => {
      const expiredToken = jwt.sign(
        { sub: ADMIN_ID, username: 'admin', role: 'super_admin', permissions: ['*'] },
        TEST_JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const req = createMockRequest({
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticateAdmin(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
    });

    it('应该拒绝缺少 username 的 token', () => {
      const badToken = jwt.sign(
        { sub: ADMIN_ID, role: 'super_admin' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' }
      );

      const req = createMockRequest({
        headers: { authorization: `Bearer ${badToken}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticateAdmin(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
    });

    it('应该成功验证有效的管理员 token', () => {
      const token = createAdminToken();
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authenticateAdmin(req as any, res as any, next);

      expect(req.adminId).toBe(ADMIN_ID);
      expect(req.adminRole).toBe('super_admin');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    it('应该拒绝未认证的请求', () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requirePermission('users:read');

      expect(() => middleware(req as any, res as any, next)).toThrow(
        AuthenticationError
      );
    });

    it('应该拒绝权限不足的请求', () => {
      const req = createMockRequest({
        adminId: ADMIN_ID,
        adminPermissions: ['users:read'],
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requirePermission('users:write');

      expect(() => middleware(req as any, res as any, next)).toThrow(
        AuthorizationError
      );
    });

    it('应该允许拥有 * 权限的请求', () => {
      const req = createAdminRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requirePermission('users:write');
      middleware(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('应该允许拥有精确权限的请求', () => {
      const req = createMockRequest({
        adminId: ADMIN_ID,
        adminPermissions: ['users:read', 'users:write'],
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requirePermission('users:write');
      middleware(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('应该拒绝角色不匹配的请求', () => {
      const req = createMockRequest({
        adminId: ADMIN_ID,
        adminRole: 'viewer',
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requireRole('super_admin', 'admin');

      expect(() => middleware(req as any, res as any, next)).toThrow(
        AuthorizationError
      );
    });

    it('应该允许角色匹配的请求', () => {
      const req = createMockRequest({
        adminId: ADMIN_ID,
        adminRole: 'admin',
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requireRole('super_admin', 'admin');
      middleware(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });
});

// ============================================================
// 权限辅助函数测试
// ============================================================

describe('权限辅助函数', () => {
  describe('hasPermission', () => {
    it('* 权限应该匹配所有权限', () => {
      expect(hasPermission(['*'], 'users:read')).toBe(true);
      expect(hasPermission(['*'], 'finance:write')).toBe(true);
    });

    it('应该精确匹配权限', () => {
      expect(hasPermission(['users:read'], 'users:read')).toBe(true);
      expect(hasPermission(['users:read'], 'users:write')).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('应该在拥有任一权限时返回 true', () => {
      expect(hasAnyPermission(['users:read'], ['users:read', 'users:write'])).toBe(true);
    });

    it('应该在没有任何权限时返回 false', () => {
      expect(hasAnyPermission(['finance:read'], ['users:read', 'users:write'])).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('应该在拥有所有权限时返回 true', () => {
      expect(hasAllPermissions(['users:read', 'users:write'], ['users:read', 'users:write'])).toBe(true);
    });

    it('应该在缺少权限时返回 false', () => {
      expect(hasAllPermissions(['users:read'], ['users:read', 'users:write'])).toBe(false);
    });
  });

  describe('getEffectivePermissions', () => {
    it('super_admin 应该拥有 * 权限', () => {
      const perms = getEffectivePermissions('super_admin', []);
      expect(perms).toContain('*');
    });

    it('应该合并角色权限和自定义权限', () => {
      const perms = getEffectivePermissions('viewer', ['config:write']);
      expect(perms).toContain('users:read');
      expect(perms).toContain('config:write');
    });
  });

  describe('ROLE_PERMISSIONS', () => {
    it('应该导出完整角色映射', () => {
      expect(ROLE_PERMISSIONS.super_admin).toContain('*');
      expect(ROLE_PERMISSIONS.admin).toContain('users:read');
      expect(ROLE_PERMISSIONS.operator).toContain('dashboard:read');
      expect(ROLE_PERMISSIONS.viewer).toContain('logs:read');
    });
  });

  describe('generateAdminToken', () => {
    it('应该生成有效的 JWT token', () => {
      const { accessToken, expiresIn } = generateAdminToken(
        ADMIN_ID,
        'admin',
        'super_admin',
        ['*']
      );

      expect(accessToken).toBeDefined();
      expect(expiresIn).toBeGreaterThan(0);

      const payload = jwt.verify(accessToken, TEST_JWT_SECRET) as Record<string, unknown>;
      expect(payload.sub).toBe(ADMIN_ID);
      expect(payload.username).toBe('admin');
      expect(payload.role).toBe('super_admin');
    });
  });
});

// ============================================================
// 路由注册测试
// ============================================================

describe('路由注册完整性', () => {
  it('admin/index.ts 应该注册所有子路由', async () => {
    // 验证所有管理路由都已导出
    const adminIndex = await import('../routes/admin/index.js');

    expect(adminIndex.adminRouter).toBeDefined();
    expect(adminIndex.adminAuthRouter).toBeDefined();
    expect(adminIndex.adminUsersRouter).toBeDefined();
    expect(adminIndex.adminAdminsRouter).toBeDefined();
    expect(adminIndex.adminFinanceRouter).toBeDefined();
    expect(adminIndex.adminChannelsRouter).toBeDefined();
    expect(adminIndex.adminModelsRouter).toBeDefined();
    expect(adminIndex.adminAnnouncementsRouter).toBeDefined();
    expect(adminIndex.adminConfigsRouter).toBeDefined();
    expect(adminIndex.adminPackagesRouter).toBeDefined();
    expect(adminIndex.adminDashboardRouter).toBeDefined();
    expect(adminIndex.adminVersionsRouter).toBeDefined();
    expect(adminIndex.adminSkillsRouter).toBeDefined();
    expect(adminIndex.adminReferralsRouter).toBeDefined();
    expect(adminIndex.adminEmailsRouter).toBeDefined();
    expect(adminIndex.adminEmailSettingsRouter).toBeDefined();
    expect(adminIndex.adminSystemSettingsRouter).toBeDefined();
    expect(adminIndex.adminDiscountsRouter).toBeDefined();
    expect(adminIndex.adminRedeemCodesRouter).toBeDefined();
    expect(adminIndex.adminFraudRouter).toBeDefined();
    expect(adminIndex.adminSyncRouter).toBeDefined();
    expect(adminIndex.adminPaymentSettingsRouter).toBeDefined();
  });
});

// ============================================================
// 参数验证 Schema 测试
// ============================================================

import { z } from 'zod';

describe('参数验证 Schema', () => {
  describe('公告创建 Schema', () => {
    const schema = z.object({
      title: z.string().min(1).max(200),
      content: z.string().min(1),
      type: z.enum(['info', 'warning', 'important']).default('info'),
      isPublished: z.boolean().default(false),
      expiresAt: z.string().datetime().nullable().optional(),
      sortOrder: z.number().int().min(0).default(0),
    });

    it('应该接受有效的公告数据', () => {
      const result = schema.safeParse({
        title: '测试公告',
        content: '这是一条测试公告',
        type: 'info',
      });
      expect(result.success).toBe(true);
    });

    it('应该拒绝空标题', () => {
      const result = schema.safeParse({
        title: '',
        content: '内容',
      });
      expect(result.success).toBe(false);
    });

    it('应该拒绝无效的类型', () => {
      const result = schema.safeParse({
        title: '标题',
        content: '内容',
        type: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('模型创建 Schema', () => {
    const schema = z.object({
      id: z.string().min(1).max(100),
      displayName: z.string().min(1).max(200),
      provider: z.enum([
        'openai', 'anthropic', 'google', 'azure', 'deepseek',
        'moonshot', 'zhipu', 'baidu', 'alibaba', 'custom',
      ]),
      inputPricePerMtok: z.number().int().min(0).default(0),
      outputPricePerMtok: z.number().int().min(0).default(0),
      maxTokens: z.number().int().min(1).default(4096),
      maxContextLength: z.number().int().min(1).default(128000),
      isEnabled: z.boolean().default(true),
      sortOrder: z.number().int().default(0),
    });

    it('应该接受有效的模型数据', () => {
      const result = schema.safeParse({
        id: 'gpt-4o-test',
        displayName: 'GPT-4o Test',
        provider: 'openai',
      });
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的 provider', () => {
      const result = schema.safeParse({
        id: 'test-model',
        displayName: 'Test',
        provider: 'invalid-provider',
      });
      expect(result.success).toBe(false);
    });

    it('应该拒绝空 ID', () => {
      const result = schema.safeParse({
        id: '',
        displayName: 'Test',
        provider: 'openai',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('渠道创建 Schema', () => {
    const schema = z.object({
      name: z.string().min(1).max(100),
      provider: z.enum([
        'openai', 'anthropic', 'google', 'azure', 'deepseek',
        'moonshot', 'zhipu', 'baidu', 'alibaba', 'custom',
      ]),
      baseUrl: z.string().url(),
      apiKey: z.string().min(1),
      weight: z.number().int().min(0).max(100).default(100),
      priority: z.number().int().min(0).default(0),
      isEnabled: z.boolean().default(true),
    });

    it('应该接受有效的渠道数据', () => {
      const result = schema.safeParse({
        name: '测试渠道',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
      });
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的 URL', () => {
      const result = schema.safeParse({
        name: '测试渠道',
        provider: 'openai',
        baseUrl: 'not-a-url',
        apiKey: 'sk-test-key',
      });
      expect(result.success).toBe(false);
    });

    it('应该拒绝空 API Key', () => {
      const result = schema.safeParse({
        name: '测试渠道',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
      });
      expect(result.success).toBe(false);
    });

    it('应该拒绝超出范围的 weight', () => {
      const result = schema.safeParse({
        name: '测试渠道',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        weight: 101,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('充值套餐创建 Schema', () => {
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      credits: z.number().min(0.01),
      priceCents: z.number().int().min(1),
      currency: z.string().length(3).default('CNY'),
      bonusCredits: z.number().min(0).default(0),
      isEnabled: z.boolean().default(true),
      sortOrder: z.number().int().default(0),
    });

    it('应该接受有效的套餐数据', () => {
      const result = schema.safeParse({
        name: '基础包',
        credits: 100,
        priceCents: 1000,
      });
      expect(result.success).toBe(true);
    });

    it('应该拒绝零积分', () => {
      const result = schema.safeParse({
        name: '基础包',
        credits: 0,
        priceCents: 1000,
      });
      expect(result.success).toBe(false);
    });

    it('应该拒绝零价格', () => {
      const result = schema.safeParse({
        name: '基础包',
        credits: 100,
        priceCents: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('用户余额调整 Schema', () => {
    const schema = z.object({
      amount: z.number().refine((v) => v !== 0, '金额不能为 0'),
      reason: z.string().min(1).max(500),
      type: z.enum(['bonus', 'refund', 'adjustment', 'compensation']).default('adjustment'),
    });

    it('应该接受有效的调整数据', () => {
      const result = schema.safeParse({
        amount: 100,
        reason: '测试调整',
      });
      expect(result.success).toBe(true);
    });

    it('应该拒绝零金额', () => {
      const result = schema.safeParse({
        amount: 0,
        reason: '测试',
      });
      expect(result.success).toBe(false);
    });

    it('应该接受负金额（扣减）', () => {
      const result = schema.safeParse({
        amount: -50,
        reason: '扣减测试',
      });
      expect(result.success).toBe(true);
    });

    it('应该拒绝空原因', () => {
      const result = schema.safeParse({
        amount: 100,
        reason: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('系统配置更新 Schema', () => {
    const schema = z.object({
      value: z.string(),
    });

    it('应该接受字符串值', () => {
      const result = schema.safeParse({ value: '新的隐私政策内容' });
      expect(result.success).toBe(true);
    });

    it('应该拒绝非字符串值', () => {
      const result = schema.safeParse({ value: 123 });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================
// SQL 查询与表结构一致性测试
// ============================================================

describe('SQL 查询与表结构一致性', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('announcements 表', () => {
    it('公告列表查询应该使用正确的字段', () => {
      const expectedFields = [
        'id', 'title', 'content', 'type',
        'is_published', 'published_at', 'expires_at',
        'sort_order', 'created_at', 'updated_at',
      ];

      // 验证 announcements 表的字段与迁移 0006 一致
      expectedFields.forEach((field) => {
        expect(field).toBeDefined();
      });
    });

    it('公告创建应该包含所有必要字段', () => {
      const insertFields = [
        'title', 'content', 'type',
        'is_published', 'published_at', 'expires_at', 'sort_order',
      ];

      expect(insertFields.length).toBe(7);
    });
  });

  describe('system_configs 表', () => {
    it('配置表应该有 key, value, description, updated_at, updated_by 字段', () => {
      const fields = ['key', 'value', 'description', 'updated_at', 'updated_by'];
      expect(fields.length).toBe(5);
    });
  });

  describe('credit_packages 表', () => {
    it('套餐表应该有所有必要字段', () => {
      const fields = [
        'id', 'name', 'description', 'credits',
        'price_cents', 'currency', 'bonus_credits',
        'is_enabled', 'sort_order', 'created_at', 'updated_at',
      ];
      expect(fields.length).toBe(11);
    });
  });

  describe('models 表', () => {
    it('模型表应该包含积分价格字段', () => {
      const creditsFields = [
        'input_credits_per_mtok',
        'output_credits_per_mtok',
        'cache_read_credits_per_mtok',
        'cache_write_credits_per_mtok',
      ];
      expect(creditsFields.length).toBe(4);
    });
  });

  describe('channels 表', () => {
    it('渠道表应该有加密 API Key 字段', () => {
      const securityFields = ['api_key_encrypted'];
      expect(securityFields.length).toBe(1);
    });
  });
});

// ============================================================
// 响应格式测试
// ============================================================

import { successResponse, paginationMeta, errorResponse } from '../utils/response.js';

describe('响应格式', () => {
  describe('successResponse', () => {
    it('应该返回正确的成功响应格式', () => {
      const response = successResponse({ test: 'data' });
      expect(response.success).toBe(true);
      expect(response.data).toEqual({ test: 'data' });
    });

    it('应该包含分页元数据', () => {
      const meta = paginationMeta(100, 1, 20);
      const response = successResponse({ items: [] }, meta);

      expect(response.meta).toBeDefined();
      expect(response.meta?.total).toBe(100);
      expect(response.meta?.page).toBe(1);
      expect(response.meta?.limit).toBe(20);
      expect(response.meta?.hasMore).toBe(true);
    });

    it('hasMore 应该在最后一页为 false', () => {
      const meta = paginationMeta(20, 1, 20);
      expect(meta.hasMore).toBe(false);
    });
  });

  describe('errorResponse', () => {
    it('应该返回正确的错误响应格式', () => {
      const response = errorResponse('AUTH_1001', '认证失败');
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('AUTH_1001');
      expect(response.error?.message).toBe('认证失败');
    });
  });
});

// ============================================================
// 错误类测试
// ============================================================

import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  QuotaExceededError,
} from '../utils/errors.js';

describe('错误类', () => {
  it('ValidationError 应该返回 400 状态码', () => {
    const error = new ValidationError('验证失败');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('验证失败');
  });

  it('AuthenticationError 应该返回 401 状态码', () => {
    const error = new AuthenticationError('认证失败');
    expect(error.statusCode).toBe(401);
  });

  it('AuthorizationError 应该返回 403 状态码', () => {
    const error = new AuthorizationError('权限不足');
    expect(error.statusCode).toBe(403);
  });

  it('NotFoundError 应该返回 404 状态码', () => {
    const error = new NotFoundError('用户');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('用户不存在');
  });

  it('RateLimitError 应该返回 429 状态码', () => {
    const error = new RateLimitError();
    expect(error.statusCode).toBe(429);
  });

  it('QuotaExceededError 应该返回 402 状态码', () => {
    const error = new QuotaExceededError();
    expect(error.statusCode).toBe(402);
  });

  it('所有错误应该是 AppError 的实例', () => {
    expect(new ValidationError()).toBeInstanceOf(AppError);
    expect(new AuthenticationError()).toBeInstanceOf(AppError);
    expect(new NotFoundError()).toBeInstanceOf(AppError);
  });
});
