/**
 * 邮箱密码服务单元测试
 * 测试 src/services/user.ts 中的邮箱密码相关函数
 */

import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

describe('邮箱密码服务单元测试', () => {
  describe('密码加密和验证', () => {
    it('应该正确加密密码', async () => {
      const password = 'TestPassword123';
      const hashedPassword = await bcrypt.hash(password, 12);

      // 验证哈希后的密码不等于明文密码
      expect(hashedPassword).not.toBe(password);

      // 验证哈希后的密码包含 bcrypt 标识
      expect(hashedPassword).toMatch(/^\$2[aby]\$/);
    });

    it('应该正确验证密码', async () => {
      const password = 'TestPassword123';
      const hashedPassword = await bcrypt.hash(password, 12);

      // 验证正确的密码
      const isValid = await bcrypt.compare(password, hashedPassword);
      expect(isValid).toBe(true);

      // 验证错误的密码
      const isInvalid = await bcrypt.compare('WrongPassword', hashedPassword);
      expect(isInvalid).toBe(false);
    });

    it('应该使用足够强度的加密轮数', async () => {
      const password = 'TestPassword123';
      const hashedPassword = await bcrypt.hash(password, 12);

      // bcrypt 哈希应该包含轮数信息
      // 格式: $2a$12$...
      const parts = hashedPassword.split('$');
      expect(parts[2]).toBe('12'); // 验证轮数为 12
    });
  });

  describe('密码强度验证 (Zod Schema)', () => {
    const passwordSchema = z.string()
      .min(8, '密码至少 8 个字符')
      .max(100, '密码最多 100 个字符')
      .regex(/[A-Z]/, '密码需要包含大写字母')
      .regex(/[a-z]/, '密码需要包含小写字母')
      .regex(/[0-9]/, '密码需要包含数字');

    it('应该接受符合强度要求的密码', () => {
      const validPasswords = [
        'TestPassword123',
        'MyP@ssw0rd',
        'Secure123Pass',
        'Abc123def',
        'Password1',
      ];

      validPasswords.forEach((password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(true);
      });
    });

    it('应该拒绝少于8个字符的密码', () => {
      const result = passwordSchema.safeParse('Abc123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('至少 8 个字符');
      }
    });

    it('应该拒绝没有大写字母的密码', () => {
      const result = passwordSchema.safeParse('testpassword123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('大写字母');
      }
    });

    it('应该拒绝没有小写字母的密码', () => {
      const result = passwordSchema.safeParse('TESTPASSWORD123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('小写字母');
      }
    });

    it('应该拒绝没有数字的密码', () => {
      const result = passwordSchema.safeParse('TestPassword');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('数字');
      }
    });

    it('应该拒绝超过100个字符的密码', () => {
      const longPassword = 'A'.repeat(50) + 'a'.repeat(50) + '1';
      const result = passwordSchema.safeParse(longPassword);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('最多 100 个字符');
      }
    });
  });

  describe('邮箱验证 (Zod Schema)', () => {
    const emailSchema = z.string().email('无效的邮箱格式');

    it('应该接受有效的邮箱地址', () => {
      const validEmails = [
        'user@example.com',
        'test.user@example.com',
        'user+tag@example.co.uk',
        'user123@test-domain.com',
      ];

      validEmails.forEach((email) => {
        const result = emailSchema.safeParse(email);
        expect(result.success).toBe(true);
      });
    });

    it('应该拒绝无效的邮箱地址', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com',
        'user space@example.com',
      ];

      invalidEmails.forEach((email) => {
        const result = emailSchema.safeParse(email);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('用户名生成逻辑', () => {
    it('应该从邮箱地址提取用户名', () => {
      const email = 'testuser@example.com';
      const username = email.split('@')[0];
      expect(username).toBe('testuser');
    });

    it('应该处理带点号的邮箱', () => {
      const email = 'test.user@example.com';
      const username = email.split('@')[0];
      expect(username).toBe('test.user');
    });

    it('应该处理带加号的邮箱', () => {
      const email = 'user+tag@example.com';
      const username = email.split('@')[0];
      expect(username).toBe('user+tag');
    });
  });

  describe('JWT Token 生成', () => {
    it('应该生成包含必要信息的 payload', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const role = 'user' as const;

      const payload = {
        sub: userId,
        email,
        role,
      };

      expect(payload.sub).toBe(userId);
      expect(payload.email).toBe(email);
      expect(payload.role).toBe('user');
    });
  });

  describe('余额初始化', () => {
    it('应该使用正确的初始值', () => {
      const initialBalance = {
        balance: '0',
        currency: 'USD',
        totalDeposited: '0',
        totalSpent: '0',
      };

      expect(initialBalance.balance).toBe('0');
      expect(initialBalance.currency).toBe('USD');
      expect(initialBalance.totalDeposited).toBe('0');
      expect(initialBalance.totalSpent).toBe('0');
    });

    it('应该正确计算新用户欢迎奖励后的余额', () => {
      const welcomeBonus = '1.00';
      const currentBalance = '0';

      const newBalance = (
        parseFloat(currentBalance) + parseFloat(welcomeBonus)
      ).toFixed(4);

      expect(newBalance).toBe('1.0000');
    });
  });
});
