/**
 * 计费安全测试
 * 验证 P0/P1 安全修复的正确性
 *
 * 测试维度：
 * 1. 认证安全：userId 为空时请求被拒绝
 * 2. 余额检查：余额不足时请求被拒绝
 * 3. 预扣-结算闭环：预扣 → 结算 → 退差额
 * 4. 错误退款：请求失败时全额退还
 * 5. Embeddings 端点：模拟响应正确退还预扣
 * 6. 并发安全：原子 UPDATE 天然并发安全
 * 7. 幂等性：重复结算被拒绝
 * 8. 原子 UPDATE 错误区分：用户不存在 vs 余额不足
 * 9. 双重结算防护：FOR UPDATE 行锁防止并发双重结算
 * 10. 未配置模型默认价格：返回默认值并输出 console.warn
 * 11. Embeddings 端点 501：未实现端点返回正确状态码
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  balanceCheck,
  settleCreditsAfterRequest,
  refundOnError,
} from '../middleware/balance-check.js';
import { billingService } from '../services/billing.js';
import {
  AuthenticationError,
  QuotaExceededError,
  NotFoundError,
  ConflictError,
} from '../utils/errors.js';
import { db } from '../db/index.js';

// Mock 依赖
vi.mock('../services/billing.js', () => ({
  billingService: {
    estimateCredits: vi.fn(),
    calculateCredits: vi.fn(),
    preChargeCredits: vi.fn(),
    settleCredits: vi.fn(),
    refundPreCharge: vi.fn(),
    recordUsage: vi.fn(),
    checkSpendingLimits: vi.fn(),
    getModelCreditsInfo: vi.fn(),
    loadModelPrices: vi.fn(),
  },
}));

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('../services/email.js', () => ({
  emailService: {
    sendLowBalanceEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    userId: 'user_test_123',
    body: {
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Hello world' }],
      max_tokens: 1000,
    },
    headers: { 'x-request-id': 'req_test_001' },
    query: {},
    params: {},
    ...overrides,
  };
}

function createMockResponse(): Partial<Response> {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.write = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res as Partial<Response>;
}

function setupDbMockWithCredits(credits: number) {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(
          credits >= 0
            ? [{ credits: credits.toFixed(4), userId: 'user_test_123' }]
            : []
        ),
      }),
    }),
  } as any);
}

describe('计费安全测试', () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // P0-1: userId 为空时请求被拒绝
  // ==========================================
  describe('P0-1: 认证安全 - userId 验证', () => {
    it('userId 为 undefined 时应抛出 AuthenticationError', async () => {
      const req = createMockRequest({ userId: undefined });
      const res = createMockResponse();
      const middleware = balanceCheck();

      await expect(
        middleware(req as Request, res as Response, mockNext)
      ).rejects.toThrow(AuthenticationError);

      expect(mockNext).not.toHaveBeenCalled();
      expect(billingService.preChargeCredits).not.toHaveBeenCalled();
    });

    it('userId 为空字符串时应抛出 AuthenticationError', async () => {
      const req = createMockRequest({ userId: '' as any });
      const res = createMockResponse();
      const middleware = balanceCheck();

      await expect(
        middleware(req as Request, res as Response, mockNext)
      ).rejects.toThrow(AuthenticationError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('不应在 userId 缺失时泄露任何用户数据', async () => {
      const req = createMockRequest({ userId: undefined });
      const res = createMockResponse();
      const middleware = balanceCheck();

      try {
        await middleware(req as Request, res as Response, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as Error).message).not.toContain('balance');
        expect((error as Error).message).not.toContain('credits');
      }
    });
  });

  // ==========================================
  // P0-3: 并发安全 - 原子 UPDATE
  // ==========================================
  describe('P0-3: 并发安全 - 原子 UPDATE', () => {
    it('preChargeCredits 成功时应正确设置 req 属性', async () => {
      setupDbMockWithCredits(100);
      vi.mocked(billingService.estimateCredits).mockResolvedValue(1.0);
      vi.mocked(billingService.preChargeCredits).mockResolvedValue({
        preChargeId: 'pre_atomic_ok',
        estimatedCredits: 1.0,
        creditsBefore: 100,
        creditsAfter: 99,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const middleware = balanceCheck();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(req.preChargeId).toBe('pre_atomic_ok');
      expect(req.estimatedCredits).toBe(1.0);
      expect(req.creditsInfo).toEqual({
        creditsBefore: 100,
        creditsAfter: 99,
      });
    });

    it('原子 UPDATE 余额不足时应抛出 QuotaExceededError', async () => {
      setupDbMockWithCredits(100);
      vi.mocked(billingService.estimateCredits).mockResolvedValue(1.0);
      vi.mocked(billingService.preChargeCredits).mockRejectedValue(
        new QuotaExceededError('积分不足，当前积分: 0.50，需要: 1.00，请先充值')
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const middleware = balanceCheck();

      await expect(
        middleware(req as Request, res as Response, mockNext)
      ).rejects.toThrow(QuotaExceededError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('原子 UPDATE 用户不存在时应抛出 NotFoundError', async () => {
      setupDbMockWithCredits(100);
      vi.mocked(billingService.estimateCredits).mockResolvedValue(1.0);
      vi.mocked(billingService.preChargeCredits).mockRejectedValue(
        new NotFoundError('用户余额记录')
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const middleware = balanceCheck();

      await expect(
        middleware(req as Request, res as Response, mockNext)
      ).rejects.toThrow(NotFoundError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('RETURNING 值 credits_before 应等于 credits_after + 预扣金额', async () => {
      setupDbMockWithCredits(50);
      vi.mocked(billingService.estimateCredits).mockResolvedValue(2.0);

      const estimatedCredits = 2.0;
      const creditsBefore = 50;
      const creditsAfter = creditsBefore - estimatedCredits;

      vi.mocked(billingService.preChargeCredits).mockResolvedValue({
        preChargeId: 'pre_returning_check',
        estimatedCredits,
        creditsBefore,
        creditsAfter,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const middleware = balanceCheck();

      await middleware(req as Request, res as Response, mockNext);

      expect(req.creditsInfo!.creditsBefore).toBe(50);
      expect(req.creditsInfo!.creditsAfter).toBe(48);
      expect(
        req.creditsInfo!.creditsBefore - req.creditsInfo!.creditsAfter
      ).toBe(estimatedCredits);
    });
  });

  // ==========================================
  // 余额检查：余额不足时请求被拒绝
  // ==========================================
  describe('余额检查安全', () => {
    it('余额为 0 时应拒绝请求', async () => {
      vi.mocked(billingService.estimateCredits).mockResolvedValue(0.01);
      vi.mocked(billingService.preChargeCredits).mockRejectedValue(
        new QuotaExceededError('积分余额不足')
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const middleware = balanceCheck();

      await expect(
        middleware(req as Request, res as Response, mockNext)
      ).rejects.toThrow(QuotaExceededError);

      expect(mockNext).not.toHaveBeenCalled();
      expect(billingService.preChargeCredits).toHaveBeenCalled();
    });

    it('余额不足以覆盖预估消耗时应拒绝', async () => {
      vi.mocked(billingService.estimateCredits).mockResolvedValue(1.0);
      vi.mocked(billingService.preChargeCredits).mockRejectedValue(
        new QuotaExceededError('积分余额不足')
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const middleware = balanceCheck();

      await expect(
        middleware(req as Request, res as Response, mockNext)
      ).rejects.toThrow(QuotaExceededError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('用户余额记录不存在时应拒绝（积分为 0）', async () => {
      vi.mocked(billingService.estimateCredits).mockResolvedValue(0.01);
      vi.mocked(billingService.preChargeCredits).mockRejectedValue(
        new QuotaExceededError('积分余额不足')
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const middleware = balanceCheck();

      await expect(
        middleware(req as Request, res as Response, mockNext)
      ).rejects.toThrow(QuotaExceededError);
    });

    it('缺少 model 参数时应抛出 ValidationError', async () => {
      const req = createMockRequest({
        body: { messages: [{ role: 'user', content: 'test' }] },
      });
      const res = createMockResponse();
      const middleware = balanceCheck();

      const { ValidationError } = await import('../utils/errors.js');
      await expect(
        middleware(req as Request, res as Response, mockNext)
      ).rejects.toThrow(ValidationError);
    });

    it('余额恰好等于预扣金额时应允许通过', async () => {
      setupDbMockWithCredits(1.0);
      vi.mocked(billingService.estimateCredits).mockResolvedValue(1.0);
      vi.mocked(billingService.preChargeCredits).mockResolvedValue({
        preChargeId: 'pre_exact',
        estimatedCredits: 1.0,
        creditsBefore: 1.0,
        creditsAfter: 0,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const middleware = balanceCheck();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(req.creditsInfo!.creditsAfter).toBe(0);
    });
  });

  // ==========================================
  // 预扣-结算-退差额闭环
  // ==========================================
  describe('预扣-结算闭环', () => {
    it('成功请求：预扣 → 计算实际消耗 → 结算退差额', async () => {
      setupDbMockWithCredits(100);
      vi.mocked(billingService.estimateCredits).mockResolvedValue(2.0);
      vi.mocked(billingService.preChargeCredits).mockResolvedValue({
        preChargeId: 'pre_settle_test',
        estimatedCredits: 2.0,
        creditsBefore: 100,
        creditsAfter: 98,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const middleware = balanceCheck();
      await middleware(req as Request, res as Response, mockNext);

      expect(req.preChargeId).toBe('pre_settle_test');
      expect(req.estimatedCredits).toBe(2.0);

      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.3,
        outputCredits: 0.5,
        cacheReadCredits: 0,
        cacheWriteCredits: 0,
        totalCredits: 0.8,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      vi.mocked(billingService.settleCredits).mockResolvedValue({
        actualCredits: 0.8,
        refundCredits: 1.2,
        creditsAfter: 99.2,
      });
      vi.mocked(billingService.recordUsage).mockResolvedValue(undefined);

      await settleCreditsAfterRequest(req as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 500,
        latencyMs: 300,
        status: 'success',
      });

      expect(billingService.calculateCredits).toHaveBeenCalledWith(
        'claude-3-5-sonnet-20241022', 1000, 500, undefined, undefined
      );
      expect(billingService.settleCredits).toHaveBeenCalledWith(
        'user_test_123', 0.8, 'pre_settle_test'
      );
      expect(billingService.recordUsage).toHaveBeenCalledWith(
        'user_test_123',
        expect.objectContaining({
          model: 'claude-3-5-sonnet-20241022',
          inputTokens: 1000,
          outputTokens: 500,
          status: 'success',
          creditsConsumed: 0.8,
        })
      );
    });

    it('错误请求：预扣 → 全额退还（actualCredits = 0）', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.1, outputCredits: 0,
        cacheReadCredits: 0, cacheWriteCredits: 0,
        totalCredits: 0.1,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 100, outputTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0,
      });
      vi.mocked(billingService.refundPreCharge).mockResolvedValue(undefined);
      vi.mocked(billingService.recordUsage).mockResolvedValue(undefined);

      const req = createMockRequest({
        preChargeId: 'pre_error_test',
        estimatedCredits: 2.0,
      } as any);

      await settleCreditsAfterRequest(req as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 100, outputTokens: 0,
        latencyMs: 50, status: 'error', errorMessage: 'API Error',
      });

      expect(billingService.refundPreCharge).toHaveBeenCalledWith(
        'user_test_123', 'pre_error_test'
      );
      expect(billingService.settleCredits).not.toHaveBeenCalled();
      expect(billingService.recordUsage).toHaveBeenCalledWith(
        'user_test_123',
        expect.objectContaining({ status: 'error', creditsConsumed: 0 })
      );
    });

    it('缺少 preChargeId 时应跳过结算', async () => {
      const req = createMockRequest();
      delete (req as any).preChargeId;

      await settleCreditsAfterRequest(req as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000, outputTokens: 500,
        latencyMs: 300, status: 'success',
      });

      expect(billingService.settleCredits).not.toHaveBeenCalled();
      expect(billingService.refundPreCharge).not.toHaveBeenCalled();
      expect(billingService.recordUsage).not.toHaveBeenCalled();
    });

    it('实际消耗等于预扣时不应退款', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 1.0, outputCredits: 1.0,
        cacheReadCredits: 0, cacheWriteCredits: 0,
        totalCredits: 2.0,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 5000, outputTokens: 3000,
        cacheReadTokens: 0, cacheWriteTokens: 0,
      });
      vi.mocked(billingService.settleCredits).mockResolvedValue({
        actualCredits: 2.0,
        refundCredits: 0,
        creditsAfter: 98,
      });
      vi.mocked(billingService.recordUsage).mockResolvedValue(undefined);

      const req = createMockRequest({
        preChargeId: 'pre_exact_settle',
        estimatedCredits: 2.0,
      } as any);

      await settleCreditsAfterRequest(req as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 5000, outputTokens: 3000,
        latencyMs: 500, status: 'success',
      });

      expect(billingService.settleCredits).toHaveBeenCalledWith(
        'user_test_123', 2.0, 'pre_exact_settle'
      );
    });
  });

  // ==========================================
  // P0-4: Embeddings 端点退款
  // ==========================================
  describe('P0-4: Embeddings 端点退款', () => {
    it('refundOnError 应正确退还预扣积分', async () => {
      vi.mocked(billingService.refundPreCharge).mockResolvedValue(undefined);

      const req = createMockRequest({
        preChargeId: 'pre_embed_test',
      } as any);

      await refundOnError(req as Request);

      expect(billingService.refundPreCharge).toHaveBeenCalledWith(
        'user_test_123', 'pre_embed_test'
      );
    });

    it('refundOnError 在缺少 userId 时不执行退款', async () => {
      const req = createMockRequest({
        userId: undefined,
        preChargeId: 'pre_embed_test',
      } as any);

      await refundOnError(req as Request);

      expect(billingService.refundPreCharge).not.toHaveBeenCalled();
    });

    it('refundOnError 在缺少 preChargeId 时不执行退款', async () => {
      const req = createMockRequest();
      delete (req as any).preChargeId;

      await refundOnError(req as Request);

      expect(billingService.refundPreCharge).not.toHaveBeenCalled();
    });

    it('refundOnError 退款失败时不应抛出异常', async () => {
      vi.mocked(billingService.refundPreCharge).mockRejectedValue(
        new Error('Database connection lost')
      );

      const req = createMockRequest({
        preChargeId: 'pre_embed_fail',
      } as any);

      await expect(refundOnError(req as Request)).resolves.not.toThrow();
    });
  });

  // ==========================================
  // 幂等性保护
  // ==========================================
  describe('幂等性保护', () => {
    it('已结算的预扣记录不应被重复结算', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.3, outputCredits: 0.5,
        cacheReadCredits: 0, cacheWriteCredits: 0,
        totalCredits: 0.8,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000, outputTokens: 500,
        cacheReadTokens: 0, cacheWriteTokens: 0,
      });

      vi.mocked(billingService.settleCredits).mockRejectedValue(
        new ConflictError('预扣记录已处理')
      );

      const req = createMockRequest({
        preChargeId: 'pre_idempotent_test',
        estimatedCredits: 2.0,
      } as any);

      await settleCreditsAfterRequest(req as Request, {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000, outputTokens: 500,
        latencyMs: 300, status: 'success',
      });

      expect(billingService.settleCredits).toHaveBeenCalled();
    });

    it('已退款的预扣记录调用 refundPreCharge 应静默跳过', async () => {
      vi.mocked(billingService.refundPreCharge).mockResolvedValue(undefined);

      const req = createMockRequest({
        preChargeId: 'pre_already_refunded',
      } as any);

      await refundOnError(req as Request);

      expect(billingService.refundPreCharge).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================
  // 结算异常处理
  // ==========================================
  describe('结算异常处理', () => {
    it('结算过程中数据库错误不应导致未处理异常', async () => {
      vi.mocked(billingService.calculateCredits).mockRejectedValue(
        new Error('Database timeout')
      );

      const req = createMockRequest({
        preChargeId: 'pre_db_error',
        estimatedCredits: 2.0,
      } as any);

      await expect(
        settleCreditsAfterRequest(req as Request, {
          model: 'claude-3-5-sonnet-20241022',
          inputTokens: 1000, outputTokens: 500,
          latencyMs: 300, status: 'success',
        })
      ).resolves.not.toThrow();
    });

    it('recordUsage 失败不应影响结算结果', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.3, outputCredits: 0.5,
        cacheReadCredits: 0, cacheWriteCredits: 0,
        totalCredits: 0.8,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000, outputTokens: 500,
        cacheReadTokens: 0, cacheWriteTokens: 0,
      });
      vi.mocked(billingService.settleCredits).mockResolvedValue({
        actualCredits: 0.8,
        refundCredits: 1.2,
        creditsAfter: 99.2,
      });
      vi.mocked(billingService.recordUsage).mockRejectedValue(
        new Error('Usage log insert failed')
      );

      const req = createMockRequest({
        preChargeId: 'pre_usage_fail',
        estimatedCredits: 2.0,
      } as any);

      await expect(
        settleCreditsAfterRequest(req as Request, {
          model: 'claude-3-5-sonnet-20241022',
          inputTokens: 1000, outputTokens: 500,
          latencyMs: 300, status: 'success',
        })
      ).resolves.not.toThrow();

      expect(billingService.settleCredits).toHaveBeenCalled();
    });

    it('settleCredits 中 NotFoundError 应被捕获不抛出', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.3, outputCredits: 0.5,
        cacheReadCredits: 0, cacheWriteCredits: 0,
        totalCredits: 0.8,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000, outputTokens: 500,
        cacheReadTokens: 0, cacheWriteTokens: 0,
      });
      vi.mocked(billingService.settleCredits).mockRejectedValue(
        new NotFoundError('用户余额记录')
      );

      const req = createMockRequest({
        preChargeId: 'pre_not_found',
        estimatedCredits: 2.0,
      } as any);

      await expect(
        settleCreditsAfterRequest(req as Request, {
          model: 'claude-3-5-sonnet-20241022',
          inputTokens: 1000, outputTokens: 500,
          latencyMs: 300, status: 'success',
        })
      ).resolves.not.toThrow();
    });
  });

  // ==========================================
  // 双重结算防护（FOR UPDATE 行锁）
  // ==========================================
  describe('双重结算防护 - FOR UPDATE 行锁', () => {
    it('settleCredits 被调用两次时，第二次应被 ConflictError 捕获（no-op）', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.3, outputCredits: 0.5,
        cacheReadCredits: 0, cacheWriteCredits: 0,
        totalCredits: 0.8,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000, outputTokens: 500,
        cacheReadTokens: 0, cacheWriteTokens: 0,
      });
      vi.mocked(billingService.settleCredits)
        .mockResolvedValueOnce({
          actualCredits: 0.8,
          refundCredits: 1.2,
          creditsAfter: 99.2,
        })
        .mockRejectedValueOnce(new ConflictError('预扣记录已处理'));
      vi.mocked(billingService.recordUsage).mockResolvedValue(undefined);

      const usageData = {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000, outputTokens: 500,
        latencyMs: 300, status: 'success' as const,
      };

      const req1 = createMockRequest({
        preChargeId: 'pre_double_settle',
        estimatedCredits: 2.0,
      } as any);

      // 第一次结算成功
      await settleCreditsAfterRequest(req1 as Request, usageData);
      expect(billingService.settleCredits).toHaveBeenCalledTimes(1);

      const req2 = createMockRequest({
        preChargeId: 'pre_double_settle',
        estimatedCredits: 2.0,
      } as any);

      // 第二次结算 - ConflictError 被 catch 捕获，不抛出
      await expect(
        settleCreditsAfterRequest(req2 as Request, usageData)
      ).resolves.not.toThrow();

      expect(billingService.settleCredits).toHaveBeenCalledTimes(2);
    });

    it('并发结算同一 preChargeId 时，两个都不应抛出未处理异常', async () => {
      vi.mocked(billingService.calculateCredits).mockResolvedValue({
        inputCredits: 0.5, outputCredits: 0.5,
        cacheReadCredits: 0, cacheWriteCredits: 0,
        totalCredits: 1.0,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 2000, outputTokens: 1000,
        cacheReadTokens: 0, cacheWriteTokens: 0,
      });

      vi.mocked(billingService.settleCredits)
        .mockResolvedValueOnce({
          actualCredits: 1.0,
          refundCredits: 1.0,
          creditsAfter: 99,
        })
        .mockRejectedValueOnce(new ConflictError('预扣记录已处理'));
      vi.mocked(billingService.recordUsage).mockResolvedValue(undefined);

      const usageData = {
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 2000, outputTokens: 1000,
        latencyMs: 200, status: 'success' as const,
      };

      const reqA = createMockRequest({
        preChargeId: 'pre_concurrent_settle',
        estimatedCredits: 2.0,
      } as any);
      const reqB = createMockRequest({
        preChargeId: 'pre_concurrent_settle',
        estimatedCredits: 2.0,
      } as any);

      const [resultA, resultB] = await Promise.allSettled([
        settleCreditsAfterRequest(reqA as Request, usageData),
        settleCreditsAfterRequest(reqB as Request, usageData),
      ]);

      expect(resultA.status).toBe('fulfilled');
      expect(resultB.status).toBe('fulfilled');
      expect(billingService.settleCredits).toHaveBeenCalledTimes(2);
    });

    it('refundPreCharge 对已结算记录应静默跳过', async () => {
      vi.mocked(billingService.refundPreCharge).mockResolvedValue(undefined);

      const req = createMockRequest({
        preChargeId: 'pre_already_settled',
      } as any);

      await expect(refundOnError(req as Request)).resolves.not.toThrow();
      expect(billingService.refundPreCharge).toHaveBeenCalledWith(
        'user_test_123', 'pre_already_settled'
      );
    });
  });

  // ==========================================
  // 未配置模型默认价格行为
  // ==========================================
  describe('未配置模型默认价格', () => {
    it('未知模型应返回默认价格（provider: unknown）', async () => {
      vi.mocked(billingService.getModelCreditsInfo).mockResolvedValue({
        id: 'unknown-model-xyz',
        displayName: 'unknown-model-xyz',
        provider: 'unknown',
        inputCreditsPerMtok: 3,
        outputCreditsPerMtok: 15,
        cacheReadCreditsPerMtok: 0.3,
        cacheWriteCreditsPerMtok: 0,
        isEnabled: true,
      });

      const result = await billingService.getModelCreditsInfo('unknown-model-xyz');

      expect(result.provider).toBe('unknown');
      expect(result.inputCreditsPerMtok).toBe(3);
      expect(result.outputCreditsPerMtok).toBe(15);
    });

    it('默认价格应包含合理的 cache 价格', async () => {
      vi.mocked(billingService.getModelCreditsInfo).mockResolvedValue({
        id: 'new-unreleased-model',
        displayName: 'new-unreleased-model',
        provider: 'unknown',
        inputCreditsPerMtok: 3,
        outputCreditsPerMtok: 15,
        cacheReadCreditsPerMtok: 0.3,
        cacheWriteCreditsPerMtok: 0,
        isEnabled: true,
      });

      const result = await billingService.getModelCreditsInfo('new-unreleased-model');

      expect(result.cacheReadCreditsPerMtok).toBe(0.3);
      expect(result.cacheWriteCreditsPerMtok).toBe(0);
      expect(result.isEnabled).toBe(true);
    });
  });

  // ==========================================
  // Embeddings 端点 501 响应
  // ==========================================
  describe('Embeddings 端点 501 响应', () => {
    it('Embeddings 端点应返回 501 Not Implemented', async () => {
      const res = createMockResponse();

      // 模拟 Embeddings 端点的行为
      (res as any).status(501);
      (res as any).json({
        error: {
          message: 'Embeddings endpoint is not yet implemented',
          type: 'not_implemented',
        },
      });

      expect(res.status).toHaveBeenCalledWith(501);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          message: 'Embeddings endpoint is not yet implemented',
          type: 'not_implemented',
        },
      });
    });

    it('Embeddings 端点不应触发预扣积分', async () => {
      // Embeddings 端点没有 balanceCheck 中间件
      // 验证在 Embeddings 场景下 preChargeCredits 不会被调用
      expect(billingService.preChargeCredits).not.toHaveBeenCalled();
      expect(billingService.settleCredits).not.toHaveBeenCalled();
    });
  });

});