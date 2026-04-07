import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { billingService } from '../services/billing.js';
import { AuthenticationError, QuotaExceededError, ValidationError } from '../utils/errors.js';

// Mock db 模块 - balance-check.ts 直接使用 db 查询 userBalances
const mockDbSelect = vi.fn();
const mockDbFrom = vi.fn();
const mockDbWhere = vi.fn();
const mockDbLimit = vi.fn();

vi.mock('../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => {
      mockDbSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockDbFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockDbWhere(...wArgs);
              return {
                limit: (...lArgs: unknown[]) => {
                  mockDbLimit(...lArgs);
                  return mockDbLimit._resultPromise ?? Promise.resolve([]);
                },
              };
            },
          };
        },
      };
    },
  },
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('../db/schema.js', () => ({
  userBalances: { userId: 'userId', credits: 'credits' },
  users: { id: 'id', email: 'email', name: 'name' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ col: _col, val })),
}));

// Mock 依赖
vi.mock('../services/billing.js', () => ({
  billingService: {
    estimateCredits: vi.fn(),
    calculateCredits: vi.fn(),
    preChargeCredits: vi.fn(),
    settleCredits: vi.fn(),
    refundPreCharge: vi.fn(),
    recordUsage: vi.fn(),
  },
}));

vi.mock('../services/email.js', () => ({
  emailService: {
    sendLowBalanceEmail: vi.fn(),
  },
}));

vi.mock('../services/config.js', () => ({
  getSystemConfig: vi.fn().mockResolvedValue(''),
}));

// 辅助函数：设置 db 查询返回的余额
function mockDbBalance(credits: number) {
  mockDbLimit._resultPromise = Promise.resolve(
    credits >= 0 ? [{ credits: credits.toFixed(4) }] : []
  );
}

// 延迟导入，确保 mock 先生效
let balanceCheck: typeof import('../middleware/balance-check.js').balanceCheck;
let settleCreditsAfterRequest: typeof import('../middleware/balance-check.js').settleCreditsAfterRequest;
let refundOnError: typeof import('../middleware/balance-check.js').refundOnError;
let checkCredits: typeof import('../middleware/balance-check.js').checkCredits;

beforeAll(async () => {
  const mod = await import('../middleware/balance-check.js');
  balanceCheck = mod.balanceCheck;
  settleCreditsAfterRequest = mod.settleCreditsAfterRequest;
  refundOnError = mod.refundOnError;
  checkCredits = mod.checkCredits;
});

describe('Balance Check Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // 重置所有 mocks
    vi.clearAllMocks();
    mockDbLimit._resultPromise = Promise.resolve([]);

    // 创建 mock request/response
    mockRequest = {
      userId: 'test-user-id',
      body: {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'Hello, this is a test message!' },
        ],
        max_tokens: 1000,
      },
      headers: {},
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('balanceCheck()', () => {
    it('应该在余额充足时允许请求继续', async () => {
      // 设置 mock 返回值 - 余额 10
      mockDbBalance(10.0);

      vi.mocked(billingService.estimateCredits).mockResolvedValue(0.05);

      vi.mocked(billingService.preChargeCredits).mockResolvedValue({
        preChargeId: 'pre_test123',
        estimatedCredits: 0.05,
        creditsBefore: 10.0,
        creditsAfter: 9.95,
      });

      // 执行中间件
      const middleware = balanceCheck();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // 验证
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRequest.preChargeId).toBe('pre_test123');
      expect(mockRequest.estimatedCredits).toBe(0.05);
      expect(mockRequest.creditsInfo).toEqual({
        creditsBefore: 10.0,
        creditsAfter: 9.95,
      });
    });

    it('应该在余额不足时拒绝请求', async () => {
      vi.mocked(billingService.estimateCredits).mockResolvedValue(0.05);
      vi.mocked(billingService.preChargeCredits).mockRejectedValue(
        new QuotaExceededError('积分余额不足')
      );

      const middleware = balanceCheck();

      await expect(
        middleware(mockRequest as Request, mockResponse as Response, mockNext)
      ).rejects.toThrow(QuotaExceededError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该在余额为0时拒绝请求', async () => {
      vi.mocked(billingService.estimateCredits).mockResolvedValue(0.001);
      vi.mocked(billingService.preChargeCredits).mockRejectedValue(
        new QuotaExceededError('积分余额不足')
      );

      const middleware = balanceCheck();

      await expect(
        middleware(mockRequest as Request, mockResponse as Response, mockNext)
      ).rejects.toThrow(QuotaExceededError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该在缺少模型参数时抛出错误', async () => {
      // 移除模型参数
      mockRequest.body = {
        messages: [{ role: 'user', content: 'test' }],
      };

      mockDbBalance(10.0);

      const middleware = balanceCheck();

      await expect(
        middleware(mockRequest as Request, mockResponse as Response, mockNext)
      ).rejects.toThrow(ValidationError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该在没有userId时抛出认证错误', async () => {
      // 移除 userId
      mockRequest.userId = undefined;

      const middleware = balanceCheck();

      await expect(
        middleware(mockRequest as Request, mockResponse as Response, mockNext)
      ).rejects.toThrow(AuthenticationError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该正确估算输入tokens', async () => {
      // 设置一个较长的消息
      mockRequest.body = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'A'.repeat(3000), // 3000 字符，约 1000 tokens
          },
        ],
      };

      mockDbBalance(10.0);

      vi.mocked(billingService.estimateCredits).mockResolvedValue(0.05);

      vi.mocked(billingService.preChargeCredits).mockResolvedValue({
        preChargeId: 'pre_test123',
        estimatedCredits: 0.05,
        creditsBefore: 10.0,
        creditsAfter: 9.95,
      });

      const middleware = balanceCheck();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // 3000 个 ASCII 字符按 0.25 token/字符估算，约为 750 tokens
      expect(billingService.estimateCredits).toHaveBeenCalledWith(
        'claude-3-5-sonnet-20241022',
        expect.any(Number),
        expect.any(Number),
      );

      const call = vi.mocked(billingService.estimateCredits).mock.calls[0];
      const inputTokens = call[1] as number;
      expect(inputTokens).toBeGreaterThan(700);
      expect(inputTokens).toBeLessThan(800);
    });

    it('应该使用 max_tokens 作为输出估算', async () => {
      mockRequest.body = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 8000,
      };

      mockDbBalance(10.0);

      vi.mocked(billingService.estimateCredits).mockResolvedValue(0.05);

      vi.mocked(billingService.preChargeCredits).mockResolvedValue({
        preChargeId: 'pre_test123',
        estimatedCredits: 0.05,
        creditsBefore: 10.0,
        creditsAfter: 9.95,
      });

      const middleware = balanceCheck();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // max_tokens 仅作为上限，预扣阶段按 20% 估算输出
      const call = vi.mocked(billingService.estimateCredits).mock.calls[0];
      const outputTokens = call[2] as number;
      expect(outputTokens).toBe(1600);
    });

    it('应该应用最小预扣金额', async () => {
      // 设置一个非常小的消息，估算费用会很低
      mockRequest.body = {
        model: 'claude-3-5-haiku-20241022', // 便宜的模型
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
      };

      mockDbBalance(10.0);

      // 估算费用非常低
      vi.mocked(billingService.estimateCredits).mockResolvedValue(0.0005);

      vi.mocked(billingService.preChargeCredits).mockResolvedValue({
        preChargeId: 'pre_test123',
        estimatedCredits: 0.01, // 应该使用最小预扣金额
        creditsBefore: 10.0,
        creditsAfter: 9.99,
      });

      const middleware = balanceCheck();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // 验证实际预扣金额是最小值 (DEFAULT_CONFIG.minPreChargeCredits = 0.01)
      expect(billingService.preChargeCredits).toHaveBeenCalledWith(
        'test-user-id',
        0.01
      );
    });
  });

  describe('settleCreditsAfterRequest()', () => {
    beforeEach(() => {
      // 设置预扣信息
      mockRequest.userId = 'test-user-id';
      mockRequest.preChargeId = 'pre_test123';
      mockRequest.estimatedCredits = 0.05;
      mockRequest.headers = {
        'x-request-id': 'req_test123',
      };
    });

    it('应该在成功请求后正确结算', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.003,
        outputCredits: 0.015,
        cacheReadCredits: 0,
        cacheWriteCredits: 0,
        totalCredits: 0.018,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });

      vi.mocked(billingService.settleCredits).mockResolvedValue({
        actualCredits: 0.018,
        refundCredits: 0.032, // 预扣 0.05 - 实际 0.018
        creditsAfter: 9.982,
        quotaUsed: 0,
      });

      await settleCreditsAfterRequest(mockRequest as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 1000,
        latencyMs: 500,
        status: 'success',
      });

      // 验证调用
      expect(billingService.calculateCredits).toHaveBeenCalledWith(
        'claude-3-5-sonnet-20241022',
        1000,
        1000,
        undefined,
        undefined,
      );

      expect(billingService.settleCredits).toHaveBeenCalledWith(
        'test-user-id',
        0.018,
        'pre_test123'
      );

      expect(billingService.recordUsage).toHaveBeenCalled();
    });

    it('应该在错误请求后全额退款', async () => {
      vi.mocked(billingService.refundPreCharge).mockResolvedValue(undefined);

      await settleCreditsAfterRequest(mockRequest as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 100,
        outputTokens: 0,
        latencyMs: 200,
        status: 'error',
        errorMessage: 'API Error',
      });

      // 验证退款
      expect(billingService.refundPreCharge).toHaveBeenCalledWith(
        'test-user-id',
        'pre_test123'
      );

      // 不应该调用 settleCredits
      expect(billingService.settleCredits).not.toHaveBeenCalled();
    });

    it('应该在缺少预扣ID时跳过结算', async () => {
      // 移除预扣ID
      delete mockRequest.preChargeId;

      await settleCreditsAfterRequest(mockRequest as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 1000,
        latencyMs: 500,
        status: 'success',
      });

      // 不应该调用任何结算函数
      expect(billingService.settleCredits).not.toHaveBeenCalled();
      expect(billingService.refundPreCharge).not.toHaveBeenCalled();
      expect(billingService.recordUsage).not.toHaveBeenCalled();
    });

    it('应该记录完整的使用信息', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.003,
        outputCredits: 0.015,
        cacheReadCredits: 0,
        cacheWriteCredits: 0,
        totalCredits: 0.018,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });

      vi.mocked(billingService.settleCredits).mockResolvedValue({
        actualCredits: 0.018,
        refundCredits: 0.032,
        creditsAfter: 9.982,
        quotaUsed: 0,
      });

      await settleCreditsAfterRequest(mockRequest as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 1000,
        latencyMs: 500,
        status: 'success',
      });

      // 验证记录使用信息
      expect(billingService.recordUsage).toHaveBeenCalledWith(
        'test-user-id',
        {
          requestId: 'req_test123',
          model: 'claude-3-5-sonnet-20241022',
          provider: 'anthropic',
          inputTokens: 1000,
          outputTokens: 1000,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
          latencyMs: 500,
          status: 'success',
          errorMessage: undefined,
          creditsConsumed: 0.018,
          quotaUsed: 0,
          metadata: {
            preChargeId: 'pre_test123',
            estimatedCredits: 0.05,
            channelId: undefined,
            balanceCreditsConsumed: 0,
          },
        }
      );
    });

    // ------------------------------------------
    // 新增：异常边界测试（P6）
    // ------------------------------------------

    it('settleCredits 抛错时应调用 refundPreCharge 兜底', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.003,
        outputCredits: 0.015,
        cacheReadCredits: 0,
        cacheWriteCredits: 0,
        totalCredits: 0.018,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });

      vi.mocked(billingService.settleCredits).mockRejectedValueOnce(
        new Error('DB connection lost')
      );

      await settleCreditsAfterRequest(mockRequest as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 500,
        latencyMs: 300,
        status: 'success',
      });

      // 应调用兜底退款
      expect(billingService.refundPreCharge).toHaveBeenCalledWith(
        'test-user-id',
        'pre_test123'
      );
      // 应仍然记录 usage（creditsConsumed=0, quotaUsed=0）
      expect(billingService.recordUsage).toHaveBeenCalled();
      const usageArg = vi.mocked(billingService.recordUsage).mock.calls[0][1] as Record<string, unknown>;
      expect(usageArg.creditsConsumed).toBe(0);
      expect(usageArg.quotaUsed).toBe(0);
    });

    it('recordUsage 抛错时不应触发 refundPreCharge', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.003,
        outputCredits: 0.015,
        cacheReadCredits: 0,
        cacheWriteCredits: 0,
        totalCredits: 0.018,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });

      vi.mocked(billingService.settleCredits).mockResolvedValue({
        actualCredits: 0.018,
        refundCredits: 0,
        creditsAfter: 9.982,
        quotaUsed: 0,
      });

      vi.mocked(billingService.recordUsage).mockRejectedValueOnce(
        new Error('Usage log insert failed')
      );

      await settleCreditsAfterRequest(mockRequest as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 500,
        latencyMs: 300,
        status: 'success',
      });

      // settleCredits 正常调用
      expect(billingService.settleCredits).toHaveBeenCalled();
      // refundPreCharge 不应被调用（结算已完成）
      expect(billingService.refundPreCharge).not.toHaveBeenCalled();
    });

    it('status: success + outputTokens=0 时应退款而非结算', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.003,
        outputCredits: 0,
        cacheReadCredits: 0,
        cacheWriteCredits: 0,
        totalCredits: 0.003,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });

      await settleCreditsAfterRequest(mockRequest as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 0,
        latencyMs: 200,
        status: 'success',
      });

      // 不应调用 settleCredits
      expect(billingService.settleCredits).not.toHaveBeenCalled();
      // 应调用退款
      expect(billingService.refundPreCharge).toHaveBeenCalledWith(
        'test-user-id',
        'pre_test123'
      );
      // recordUsage 中 creditsConsumed=0
      expect(billingService.recordUsage).toHaveBeenCalled();
      const usageArg = vi.mocked(billingService.recordUsage).mock.calls[0][1] as Record<string, unknown>;
      expect(usageArg.creditsConsumed).toBe(0);
    });

    it('兜底退款成功后 recordUsage 应记 creditsConsumed=0 且 quotaUsed=0', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.003,
        outputCredits: 0.015,
        cacheReadCredits: 0,
        cacheWriteCredits: 0,
        totalCredits: 0.018,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });

      vi.mocked(billingService.settleCredits).mockRejectedValueOnce(
        new Error('Serialization failure')
      );

      await settleCreditsAfterRequest(mockRequest as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 500,
        latencyMs: 300,
        status: 'success',
      });

      expect(billingService.refundPreCharge).toHaveBeenCalled();
      expect(billingService.recordUsage).toHaveBeenCalled();
      const usageArg = vi.mocked(billingService.recordUsage).mock.calls[0][1] as Record<string, unknown>;
      expect(usageArg.creditsConsumed).toBe(0);
      expect(usageArg.quotaUsed).toBe(0);
    });
  });

  describe('refundOnError()', () => {
    it('应该退还预扣', async () => {
      mockRequest.userId = 'test-user-id';
      mockRequest.preChargeId = 'pre_test123';

      vi.mocked(billingService.refundPreCharge).mockResolvedValue(undefined);

      await refundOnError(mockRequest as Request);

      expect(billingService.refundPreCharge).toHaveBeenCalledWith(
        'test-user-id',
        'pre_test123'
      );
    });

    it('应该在缺少信息时不执行任何操作', async () => {
      mockRequest.userId = undefined;

      await refundOnError(mockRequest as Request);

      expect(billingService.refundPreCharge).not.toHaveBeenCalled();
    });

    it('应该处理退款失败', async () => {
      mockRequest.userId = 'test-user-id';
      mockRequest.preChargeId = 'pre_test123';

      vi.mocked(billingService.refundPreCharge).mockRejectedValue(
        new Error('Refund failed')
      );

      // 不应该抛出错误
      await expect(refundOnError(mockRequest as Request)).resolves.not.toThrow();
    });
  });

  describe('checkCredits()', () => {
    it('应该返回积分充足状态', async () => {
      mockDbBalance(10.0);

      const result = await checkCredits('test-user-id', 0.01);

      expect(result).toEqual({
        hasCredits: true,
        currentCredits: 10.0,
      });
    });

    it('应该返回积分不足状态', async () => {
      mockDbBalance(0.005);

      const result = await checkCredits('test-user-id', 0.01);

      expect(result).toEqual({
        hasCredits: false,
        currentCredits: 0.005,
      });
    });

    it('应该使用默认的最小金额', async () => {
      mockDbBalance(0.002);

      const result = await checkCredits('test-user-id');

      expect(result).toEqual({
        hasCredits: false, // 0.002 < 0.01 (默认 requiredCredits)
        currentCredits: 0.002,
      });
    });
  });

  describe('并发场景', () => {
    it('应该处理预扣冲突', async () => {
      mockDbBalance(0.05);

      vi.mocked(billingService.estimateCredits).mockResolvedValue(0.05);

      // 第一次预扣失败（并发冲突）
      vi.mocked(billingService.preChargeCredits)
        .mockRejectedValueOnce(new Error('余额更新冲突，请重试'));

      const middleware = balanceCheck();

      await expect(
        middleware(mockRequest as Request, mockResponse as Response, mockNext)
      ).rejects.toThrow('余额更新冲突，请重试');

      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
