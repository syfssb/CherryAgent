import 'express-async-errors';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/error-handler.js';

const { mockClient, mockPool } = vi.hoisted(() => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };

  return {
    mockClient: client,
    mockPool: {
      query: vi.fn(),
      connect: vi.fn(),
    },
  };
});

vi.mock('../db/index.js', () => ({
  pool: mockPool,
}));

vi.mock('../middleware/auth.js', () => ({
  authenticate: (req: { userId?: string }, _res: unknown, next: () => void) => {
    req.userId = 'user_test_123';
    next();
  },
}));

import { referralsRouter } from '../routes/referrals.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/referrals', referralsRouter);
  app.use(errorHandler);
  return app;
}

describe('referrals 安全回归测试', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.connect.mockResolvedValue(mockClient as never);
  });

  it('stats 应该扣除已打款提现金额，防止重复提现额度回流', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        total_referrals: '3',
        total_commission: '180.00',
        available_commission: '100.00',
        pending_commission: '30.00',
        paid_commission: '50.00',
        withdrawing_amount: '20.00',
        paid_withdrawal_amount: '50.00',
      }],
    } as never);

    const res = await request(app).get('/api/referrals/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.availableForWithdrawal).toBe(30);
    expect(res.body.data.withdrawingAmount).toBe(20);
    expect(res.body.data.withdrawnAmount).toBe(50);
  });

  it('withdraw 应该在事务内校验并扣减 paid，禁止重复提现', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] } as never) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'user_test_123' }] } as never) // lock user
      .mockResolvedValueOnce({ rows: [{ min_withdrawal: '10.00', is_enabled: true }] } as never) // config
      .mockResolvedValueOnce({ rows: [{ approved_commission: '100.00' }] } as never) // approved
      .mockResolvedValueOnce({ rows: [{ withdrawal_total: '100.00' }] } as never) // withdrawals total
      .mockResolvedValueOnce({ rows: [] } as never); // ROLLBACK

    const res = await request(app)
      .post('/api/referrals/withdraw')
      .send({
        amount: 10,
        paymentMethod: 'alipay',
        paymentAccount: 'test@example.com',
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toContain('可提现金额不足');
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('pending', 'approved', 'paid')"),
      ['user_test_123']
    );
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('apply 应该使用 FOR UPDATE + ON CONFLICT + 条件更新防并发绕过', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ is_enabled: true }],
    } as never);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] } as never) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'code_1',
          user_id: 'referrer_1',
          usage_count: 0,
          max_usage: 1,
          is_active: true,
        }],
      } as never) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 'rel_1' }] } as never) // INSERT relation
      .mockResolvedValueOnce({ rows: [{ usage_count: 1 }] } as never) // UPDATE usage_count
      .mockResolvedValueOnce({ rows: [{ max_levels: 1 }] } as never) // config check
      .mockResolvedValueOnce({ rows: [] } as never); // COMMIT

    const res = await request(app)
      .post('/api/referrals/apply')
      .send({ code: 'abc123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(mockClient.query.mock.calls[1]?.[0]).toContain('FOR UPDATE');
    expect(mockClient.query.mock.calls[2]?.[0]).toContain('ON CONFLICT (referred_id) DO NOTHING');
    expect(mockClient.query.mock.calls[3]?.[0]).toContain('AND (max_usage IS NULL OR usage_count < max_usage)');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('apply 在并发重复绑定时应回滚并返回已使用提示', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ is_enabled: true }],
    } as never);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] } as never) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'code_1',
          user_id: 'referrer_1',
          usage_count: 0,
          max_usage: 10,
          is_active: true,
        }],
      } as never) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [] } as never) // INSERT relation conflict -> no rows
      .mockResolvedValueOnce({ rows: [] } as never); // ROLLBACK

    const res = await request(app)
      .post('/api/referrals/apply')
      .send({ code: 'abc123' });

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toBe('您已使用过邀请码');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

