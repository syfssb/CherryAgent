/**
 * 邮箱密码认证测试
 * 测试任务 B01: 实现邮箱密码登录功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db/index.js';
import { users, userBalances, balanceTransactions } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// 创建测试用的 app 实例
const app = createApp();

describe('邮箱密码认证功能测试', () => {
  // 测试数据
  const testUser = {
    email: 'test@example.com',
    password: 'TestPassword123',
    name: 'Test User',
  };

  const weakPassword = {
    email: 'weak@example.com',
    password: 'weak', // 不符合密码强度要求
  };

  const invalidEmail = {
    email: 'invalid-email', // 无效邮箱格式
    password: 'TestPassword123',
  };

  // 清理测试数据
  beforeEach(async () => {
    // 删除测试用户数据
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, testUser.email));

    if (existingUsers.length > 0) {
      const userId = existingUsers[0].id;

      // 删除关联数据
      await db.delete(balanceTransactions).where(eq(balanceTransactions.userId, userId));
      await db.delete(userBalances).where(eq(userBalances.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  describe('POST /api/auth/register - 用户注册', () => {
    it('应该成功注册新用户', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            email: testUser.email,
            name: testUser.name,
            role: 'user',
          },
          isNewUser: true,
        },
      });

      // 验证返回了 token
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();

      // 验证返回了余额信息
      expect(response.body.data.balance).toBeDefined();
      expect(parseFloat(response.body.data.balance.balance)).toBeGreaterThan(0);

      // 验证返回了欢迎奖励
      expect(response.body.data.welcomeBonus).toBeDefined();
      expect(parseFloat(response.body.data.welcomeBonus)).toBeGreaterThan(0);
    });

    it('应该拒绝重复注册相同邮箱', async () => {
      // 第一次注册
      await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      // 第二次注册相同邮箱
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(409); // Conflict

      expect(response.body).toMatchObject({
        success: false,
        error: '该邮箱已被注册',
      });
    });

    it('应该拒绝弱密码', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(weakPassword)
        .expect(400); // Bad Request

      expect(response.body).toMatchObject({
        success: false,
      });
    });

    it('应该拒绝无效邮箱格式', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidEmail)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
      });
    });

    it('注册时如果未提供名称，应该使用邮箱前缀', async () => {
      const userWithoutName = {
        email: 'noname@example.com',
        password: 'TestPassword123',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userWithoutName)
        .expect(201);

      expect(response.body.data.user.name).toBe('noname');

      // 清理数据
      const existingUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, userWithoutName.email));

      if (existingUsers.length > 0) {
        const userId = existingUsers[0].id;
        await db.delete(balanceTransactions).where(eq(balanceTransactions.userId, userId));
        await db.delete(userBalances).where(eq(userBalances.userId, userId));
        await db.delete(users).where(eq(users.id, userId));
      }
    });
  });

  describe('POST /api/auth/login/password - 邮箱密码登录', () => {
    beforeEach(async () => {
      // 先注册一个用户
      await request(app)
        .post('/api/auth/register')
        .send(testUser);
    });

    it('应该成功登录已注册用户', async () => {
      const response = await request(app)
        .post('/api/auth/login/password')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            email: testUser.email,
            name: testUser.name,
            role: 'user',
          },
        },
      });

      // 验证返回了 token
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();

      // 验证返回了 API Key 信息
      expect(response.body.data.keyInfo).toBeDefined();

      // 验证返回了余额信息
      expect(response.body.data.balance).toBeDefined();
    });

    it('应该拒绝错误的密码', async () => {
      const response = await request(app)
        .post('/api/auth/login/password')
        .send({
          email: testUser.email,
          password: 'WrongPassword123',
        })
        .expect(401); // Unauthorized

      expect(response.body).toMatchObject({
        success: false,
        error: '邮箱或密码错误',
      });
    });

    it('应该拒绝不存在的邮箱', async () => {
      const response = await request(app)
        .post('/api/auth/login/password')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: '邮箱或密码错误',
      });
    });

    it('应该拒绝空密码', async () => {
      const response = await request(app)
        .post('/api/auth/login/password')
        .send({
          email: testUser.email,
          password: '',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
      });
    });

    it('登录后不应该重复发放欢迎奖励', async () => {
      const response = await request(app)
        .post('/api/auth/login/password')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      // 登录响应中不应该有 welcomeBonus 字段
      expect(response.body.data.welcomeBonus).toBeUndefined();
    });
  });

  describe('POST /api/auth/change-password - 修改密码', () => {
    let accessToken: string;

    beforeEach(async () => {
      // 先注册并登录
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      accessToken = registerResponse.body.data.accessToken;
    });

    it('应该成功修改密码', async () => {
      const newPassword = 'NewPassword456';

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: newPassword,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: '密码修改成功',
        },
      });

      // 验证可以用新密码登录
      const loginResponse = await request(app)
        .post('/api/auth/login/password')
        .send({
          email: testUser.email,
          password: newPassword,
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);

      // 验证旧密码不能登录
      await request(app)
        .post('/api/auth/login/password')
        .send({
          email: testUser.email,
          password: testUser.password, // 旧密码
        })
        .expect(401);
    });

    it('应该拒绝错误的当前密码', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'WrongPassword123',
          newPassword: 'NewPassword456',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: '当前密码错误',
      });
    });

    it('应该拒绝不符合强度要求的新密码', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: 'weak', // 弱密码
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
      });
    });

    it('应该拒绝未登录用户修改密码', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: testUser.password,
          newPassword: 'NewPassword456',
        })
        .expect(401); // 未提供 Authorization

      expect(response.body).toMatchObject({
        success: false,
      });
    });
  });

  describe('密码强度验证', () => {
    it('应该拒绝少于8个字符的密码', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test1@example.com',
          password: 'Abc123', // 只有 6 个字符
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('应该拒绝没有大写字母的密码', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test2@example.com',
          password: 'testpassword123', // 没有大写字母
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('应该拒绝没有小写字母的密码', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test3@example.com',
          password: 'TESTPASSWORD123', // 没有小写字母
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('应该拒绝没有数字的密码', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test4@example.com',
          password: 'TestPassword', // 没有数字
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('应该接受符合所有要求的密码', async () => {
      const validPasswords = [
        'TestPassword123',
        'MyP@ssw0rd',
        'Secure123Pass',
        'Abc123def',
      ];

      for (const password of validPasswords) {
        const email = `test-${password}@example.com`;
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email,
            password,
          })
          .expect(201);

        expect(response.body.success).toBe(true);

        // 清理数据
        const existingUsers = await db
          .select()
          .from(users)
          .where(eq(users.email, email));

        if (existingUsers.length > 0) {
          const userId = existingUsers[0].id;
          await db.delete(balanceTransactions).where(eq(balanceTransactions.userId, userId));
          await db.delete(userBalances).where(eq(userBalances.userId, userId));
          await db.delete(users).where(eq(users.id, userId));
        }
      }
    });
  });
});
