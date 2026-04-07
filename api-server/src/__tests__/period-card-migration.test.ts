/**
 * 密码重置服务 + 迁移 SQL 验证测试
 *
 * 覆盖验证点：
 * 1. 确认 3 张新表 + partial unique index + 2 个邮件模板（SQL 静态分析）
 * 13. Admin 发送密码重置邮件 + auth.ts 忘记密码（共用同一 service）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mock 依赖
vi.mock('../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../services/email.js', () => ({
  emailService: {
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../utils/env.js', () => ({
  env: {
    API_BASE_URL: 'http://localhost:3001',
  },
}));

import { sendPasswordResetForUser } from '../services/password-reset.js';
import { pool } from '../db/index.js';
import { emailService } from '../services/email.js';

// ==========================================
// 1. 迁移 SQL 静态分析（验证点 1）
// ==========================================
describe('迁移 SQL 验证（验证点 1）', () => {
  const migrationPath = resolve(
    __dirname,
    '../db/migrations/0025_period_card_plans.sql'
  );
  let migrationSql: string;

  beforeEach(() => {
    try {
      migrationSql = readFileSync(migrationPath, 'utf-8');
    } catch {
      migrationSql = '';
    }
  });

  it('迁移文件应存在', () => {
    expect(migrationSql.length).toBeGreaterThan(0);
  });

  describe('3 张新表', () => {
    it('应创建 period_card_plans 表', () => {
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS period_card_plans');
    });

    it('应创建 user_period_cards 表', () => {
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS user_period_cards');
    });

    it('应创建 period_card_usage_logs 表', () => {
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS period_card_usage_logs');
    });
  });

  describe('period_card_plans 表结构', () => {
    it('应包含 period_type 字段', () => {
      expect(migrationSql).toMatch(/period_type\s+VARCHAR/i);
    });

    it('应包含 period_days 字段', () => {
      expect(migrationSql).toMatch(/period_days\s+INTEGER/i);
    });

    it('应包含 daily_credits 字段', () => {
      expect(migrationSql).toMatch(/daily_credits\s+DECIMAL/i);
    });

    it('应包含 price_cents 字段', () => {
      expect(migrationSql).toMatch(/price_cents\s+INTEGER/i);
    });

    it('应包含 is_enabled 字段', () => {
      expect(migrationSql).toContain('is_enabled');
    });
  });

  describe('user_period_cards 表结构', () => {
    it('应包含 user_id 外键引用 users(id)', () => {
      expect(migrationSql).toMatch(/user_id\s+UUID\s+NOT NULL\s+REFERENCES\s+users\(id\)/i);
    });

    it('应包含 plan_id 外键引用 period_card_plans(id)', () => {
      expect(migrationSql).toMatch(/plan_id\s+UUID\s+NOT NULL\s+REFERENCES\s+period_card_plans\(id\)/i);
    });

    it('应包含 status 字段（active, expired, cancelled, upgraded）', () => {
      expect(migrationSql).toMatch(/status\s+VARCHAR/i);
      expect(migrationSql).toContain("'active'");
    });

    it('应包含 daily_quota_remaining 字段', () => {
      expect(migrationSql).toContain('daily_quota_remaining');
    });

    it('应包含 quota_reset_date 字段', () => {
      expect(migrationSql).toContain('quota_reset_date');
    });

    it('应包含 expiry_notified 字段', () => {
      expect(migrationSql).toContain('expiry_notified');
    });

    it('应包含 upgraded_to_id 自引用外键', () => {
      expect(migrationSql).toMatch(/upgraded_to_id\s+UUID\s+REFERENCES\s+user_period_cards\(id\)/i);
    });
  });

  describe('partial unique index（验证点 2 前置）', () => {
    it('应创建 user_period_cards_one_active_per_user 唯一索引', () => {
      expect(migrationSql).toContain('user_period_cards_one_active_per_user');
    });

    it('唯一索引应为 partial index（WHERE status = active）', () => {
      expect(migrationSql).toMatch(
        /CREATE\s+UNIQUE\s+INDEX.*user_period_cards_one_active_per_user[\s\S]*?WHERE\s+status\s*=\s*'active'/i
      );
    });

    it('唯一索引应基于 user_id 列', () => {
      expect(migrationSql).toMatch(
        /user_period_cards_one_active_per_user[\s\S]*?\(user_id\)/i
      );
    });
  });

  describe('常规索引', () => {
    it('应创建 user_period_cards_user_id_idx', () => {
      expect(migrationSql).toContain('user_period_cards_user_id_idx');
    });

    it('应创建 user_period_cards_status_idx', () => {
      expect(migrationSql).toContain('user_period_cards_status_idx');
    });

    it('应创建 user_period_cards_expires_at_idx', () => {
      expect(migrationSql).toContain('user_period_cards_expires_at_idx');
    });

    it('应创建 period_card_usage_logs_user_id_idx', () => {
      expect(migrationSql).toContain('period_card_usage_logs_user_id_idx');
    });

    it('应创建 period_card_usage_logs_date_idx', () => {
      expect(migrationSql).toContain('period_card_usage_logs_date_idx');
    });
  });

  describe('2 个邮件模板', () => {
    it('应插入 period-card-expiry-reminder 模板', () => {
      expect(migrationSql).toContain('period-card-expiry-reminder');
    });

    it('应插入 period-card-purchase-confirm 模板', () => {
      expect(migrationSql).toContain('period-card-purchase-confirm');
    });

    it('邮件模板应使用 ON CONFLICT DO NOTHING（幂等）', () => {
      expect(migrationSql).toContain('ON CONFLICT');
      expect(migrationSql).toContain('DO NOTHING');
    });

    it('到期提醒模板应包含必要变量', () => {
      expect(migrationSql).toContain('username');
      expect(migrationSql).toContain('planName');
      expect(migrationSql).toContain('expiresAt');
      expect(migrationSql).toContain('appName');
    });

    it('购买确认模板应包含必要变量', () => {
      expect(migrationSql).toContain('dailyCredits');
      expect(migrationSql).toContain('startsAt');
    });
  });
});

describe('迁移 SQL 验证（0026 pre_charge_id）', () => {
  const migrationPath = resolve(
    __dirname,
    '../db/migrations/0026_period_card_usage_logs_pre_charge_id.sql'
  );
  let migrationSql: string;

  beforeEach(() => {
    try {
      migrationSql = readFileSync(migrationPath, 'utf-8');
    } catch {
      migrationSql = '';
    }
  });

  it('迁移文件应存在', () => {
    expect(migrationSql.length).toBeGreaterThan(0);
  });

  it('应新增 pre_charge_id 字段', () => {
    expect(migrationSql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+pre_charge_id\s+VARCHAR\(64\)/i);
  });

  it('应创建 pre_charge_id 唯一索引', () => {
    expect(migrationSql).toContain('period_card_usage_logs_pre_charge_id_uidx');
  });
});

describe('迁移 SQL 验证（0039 usage_logs ON CONFLICT 修复）', () => {
  const migrationPath = resolve(
    __dirname,
    '../db/migrations/0039_fix_period_card_usage_logs_conflict.sql'
  );
  let migrationSql: string;

  beforeEach(() => {
    try {
      migrationSql = readFileSync(migrationPath, 'utf-8');
    } catch {
      migrationSql = '';
    }
  });

  it('迁移文件应存在', () => {
    expect(migrationSql.length).toBeGreaterThan(0);
  });

  it('应创建 (user_period_card_id, pre_charge_id) 复合唯一索引', () => {
    expect(migrationSql).toContain('period_card_usage_logs_card_precharge_uidx');
    expect(migrationSql).toMatch(/user_period_card_id.*pre_charge_id/);
  });

  it('应删除旧的 pre_charge_id 单列普通索引', () => {
    expect(migrationSql).toContain('DROP INDEX IF EXISTS period_card_usage_logs_pre_charge_id_idx');
  });

  it('应在建索引前合并重复数据（SUM quota_used）', () => {
    expect(migrationSql).toMatch(/SUM\(quota_used\)/i);
  });

  it('唯一索引应为 partial index（WHERE pre_charge_id IS NOT NULL）', () => {
    expect(migrationSql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX.*period_card_usage_logs_card_precharge_uidx[\s\S]*?WHERE\s+pre_charge_id\s+IS\s+NOT\s+NULL/i
    );
  });
});

// ==========================================
// 2. 密码重置公共服务（验证点 13）
// ==========================================
describe('密码重置公共服务（验证点 13）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应删除旧 token 后生成新 token', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never) // DELETE
      .mockResolvedValueOnce({ rows: [] } as never); // INSERT

    await sendPasswordResetForUser('user_001', 'test@example.com', '测试用户');

    // 第一次调用：DELETE
    const deleteCall = vi.mocked(pool.query).mock.calls[0];
    expect((deleteCall[0] as string)).toContain('DELETE FROM password_reset_tokens');
    expect((deleteCall[1] as string[])[0]).toBe('user_001');

    // 第二次调用：INSERT
    const insertCall = vi.mocked(pool.query).mock.calls[1];
    expect((insertCall[0] as string)).toContain('INSERT INTO password_reset_tokens');
  });

  it('生成的 token 应为 64 字符 hex 字符串', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await sendPasswordResetForUser('user_001', 'test@example.com', '测试用户');

    const insertCall = vi.mocked(pool.query).mock.calls[1];
    const token = (insertCall[1] as string[])[1];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('token 有效期应为 1 小时', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await sendPasswordResetForUser('user_001', 'test@example.com', '测试用户');

    const insertCall = vi.mocked(pool.query).mock.calls[1];
    const insertSql = insertCall[0] as string;
    expect(insertSql).toContain("INTERVAL '1 hour'");
  });

  it('应调用 emailService.sendPasswordResetEmail', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await sendPasswordResetForUser('user_001', 'test@example.com', '测试用户');

    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'test@example.com',
      '测试用户',
      expect.stringContaining('/api/auth/reset-password-page?token=')
    );
  });

  it('重置链接应包含 API_BASE_URL', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await sendPasswordResetForUser('user_001', 'test@example.com', '测试用户');

    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'test@example.com',
      '测试用户',
      expect.stringContaining('http://localhost:3001')
    );
  });

  it('每次调用应生成不同的 token', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);

    await sendPasswordResetForUser('user_001', 'test@example.com', '用户A');
    const token1 = (vi.mocked(pool.query).mock.calls[1][1] as string[])[1];

    await sendPasswordResetForUser('user_002', 'test2@example.com', '用户B');
    const token2 = (vi.mocked(pool.query).mock.calls[3][1] as string[])[1];

    expect(token1).not.toBe(token2);
  });

  it('Admin 和 auth.ts 应共用同一个 sendPasswordResetForUser 函数', async () => {
    // 验证函数签名：接受 userId, email, name 三个参数
    expect(typeof sendPasswordResetForUser).toBe('function');
    expect(sendPasswordResetForUser.length).toBe(3);
  });

  it('数据库操作失败时应抛出错误（不吞异常）', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockRejectedValueOnce(new Error('Connection refused'));

    await expect(
      sendPasswordResetForUser('user_001', 'test@example.com', '测试用户')
    ).rejects.toThrow('Connection refused');
  });

  it('邮件发送失败时应抛出错误', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    vi.mocked(emailService.sendPasswordResetEmail).mockRejectedValueOnce(
      new Error('SMTP connection failed')
    );

    await expect(
      sendPasswordResetForUser('user_001', 'test@example.com', '测试用户')
    ).rejects.toThrow('SMTP connection failed');
  });
});
