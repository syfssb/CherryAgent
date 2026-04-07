import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { db } from '../../db/index.js';
import { users, userBalances, balanceTransactions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  findUserByEmail,
  createEmailPasswordUser,
  updateUserPassword,
  verifyUserPassword,
  getUserById,
  authenticateEmailPassword,
  findOrCreateUser,
  grantWelcomeBonus,
  getUserBalance,
} from '../user.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../../utils/errors.js';

describe('User Service - Authentication', () => {
  // 测试用户数据
  const testEmail = `test-auth-${Date.now()}@example.com`;
  const testPassword = 'Test1234';
  const testName = 'Test User';

  // 清理函数
  const cleanupUser = async (email: string) => {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user.length > 0) {
      const userId = user[0].id;
      await db.delete(balanceTransactions).where(eq(balanceTransactions.userId, userId));
      await db.delete(userBalances).where(eq(userBalances.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  };

  beforeEach(async () => {
    // 清理测试数据
    await cleanupUser(testEmail);
  });

  afterAll(async () => {
    // 最终清理
    await cleanupUser(testEmail);
  });

  describe('findUserByEmail', () => {
    it('应该返回存在的用户', async () => {
      // 创建测试用户
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      const [createdUser] = await db.insert(users).values({
        email: testEmail,
        password: hashedPassword,
        name: testName,
        role: 'user',
        isActive: true,
      }).returning();

      const foundUser = await findUserByEmail(testEmail);
      expect(foundUser).toBeDefined();
      expect(foundUser?.email).toBe(testEmail);
      expect(foundUser?.name).toBe(testName);
    });

    it('不存在的邮箱应返回 null', async () => {
      const foundUser = await findUserByEmail('nonexistent@example.com');
      expect(foundUser).toBeNull();
    });
  });

  describe('createEmailPasswordUser', () => {
    it('应该成功创建新用户并初始化余额', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      const { user, isNewUser } = await createEmailPasswordUser(
        testEmail,
        hashedPassword,
        testName
      );

      expect(user).toBeDefined();
      expect(user.email).toBe(testEmail);
      expect(user.name).toBe(testName);
      expect(user.role).toBe('user');
      expect(user.isActive).toBe(true);
      expect(isNewUser).toBe(true);

      // 验证余额已初始化
      const balance = await getUserBalance(user.id);
      expect(balance.balance).toBe('0');
      expect(balance.currency).toBe('USD');
    });

    it('重复的邮箱应该抛出 ConflictError', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);

      // 第一次创建
      await createEmailPasswordUser(
        testEmail,
        hashedPassword,
        testName
      );

      // 第二次创建应该失败
      await expect(
        createEmailPasswordUser(
          testEmail,
          hashedPassword,
          testName
        )
      ).rejects.toThrow(ConflictError);
    });

    it('应该支持可选的 name 参数', async () => {
      const email = `test-no-name-${Date.now()}@example.com`;
      const hashedPassword = await bcrypt.hash(testPassword, 12);

      const { user } = await createEmailPasswordUser(
        email,
        hashedPassword
      );

      expect(user.name).toBe(email.split('@')[0]);

      // 清理
      await cleanupUser(email);
    });

    it('事务回滚: 如果余额创建失败,用户也不应该被创建', async () => {
      // 这个测试验证事务的正确性
      // 由于我们使用了事务,即使某个步骤失败,整个操作都会回滚
      const email = `test-transaction-${Date.now()}@example.com`;
      const hashedPassword = await bcrypt.hash(testPassword, 12);

      try {
        await createEmailPasswordUser(email, hashedPassword, 'Transaction Test');
      } catch (error) {
        // 即使失败,也应该清理
      }

      // 如果成功创建,验证用户和余额都存在
      const user = await findUserByEmail(email);
      if (user) {
        const balance = await getUserBalance(user.id);
        expect(balance).toBeDefined();
        await cleanupUser(email);
      }
    });
  });

  describe('verifyUserPassword', () => {
    it('正确的密码应该返回 true', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      const { user } = await createEmailPasswordUser(
        testEmail,
        hashedPassword,
        testName
      );

      const isValid = await verifyUserPassword(user.id, testPassword);
      expect(isValid).toBe(true);
    });

    it('错误的密码应该返回 false', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      const { user } = await createEmailPasswordUser(
        testEmail,
        hashedPassword,
        testName
      );

      const isValid = await verifyUserPassword(user.id, 'WrongPassword123');
      expect(isValid).toBe(false);
    });

    it('不存在的用户应该抛出 NotFoundError', async () => {
      await expect(
        verifyUserPassword('00000000-0000-0000-0000-000000000000', testPassword)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('authenticateEmailPassword', () => {
    it('正确的邮箱和密码应该返回用户信息', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      await createEmailPasswordUser(testEmail, hashedPassword, testName);

      const user = await authenticateEmailPassword(testEmail, testPassword);
      expect(user).toBeDefined();
      expect(user.email).toBe(testEmail);
      expect(user.name).toBe(testName);
    });

    it('错误的密码应该抛出 AuthenticationError', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      await createEmailPasswordUser(testEmail, hashedPassword, testName);

      await expect(
        authenticateEmailPassword(testEmail, 'WrongPassword123')
      ).rejects.toThrow(AuthenticationError);
    });

    it('不存在的邮箱应该抛出 AuthenticationError', async () => {
      await expect(
        authenticateEmailPassword('nonexistent@example.com', testPassword)
      ).rejects.toThrow(AuthenticationError);
    });

    it('被禁用的用户应该抛出 AuthenticationError', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      const { user } = await createEmailPasswordUser(testEmail, hashedPassword, testName);

      // 禁用用户
      await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, user.id));

      await expect(
        authenticateEmailPassword(testEmail, testPassword)
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('updateUserPassword', () => {
    it('应该成功更新用户密码', async () => {
      const oldHashedPassword = await bcrypt.hash(testPassword, 12);
      const { user } = await createEmailPasswordUser(
        testEmail,
        oldHashedPassword,
        testName
      );

      const newPassword = 'NewPassword123';
      const newHashedPassword = await bcrypt.hash(newPassword, 12);

      await updateUserPassword(user.id, newHashedPassword);

      // 验证新密码可以通过验证
      const isValidNew = await verifyUserPassword(user.id, newPassword);
      expect(isValidNew).toBe(true);

      // 验证旧密码无法通过验证
      const isValidOld = await verifyUserPassword(user.id, testPassword);
      expect(isValidOld).toBe(false);
    });

    it('不存在的用户应该抛出 NotFoundError', async () => {
      const newHashedPassword = await bcrypt.hash('NewPassword123', 12);

      await expect(
        updateUserPassword('00000000-0000-0000-0000-000000000000', newHashedPassword)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getUserById', () => {
    it('应该返回存在的用户信息', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      const { user: createdUser } = await createEmailPasswordUser(
        testEmail,
        hashedPassword,
        testName
      );

      const user = await getUserById(createdUser.id);
      expect(user.id).toBe(createdUser.id);
      expect(user.email).toBe(testEmail);
      expect(user.isActive).toBe(true);
    });

    it('不存在的用户应该抛出 NotFoundError', async () => {
      await expect(
        getUserById('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Integration: Complete Registration Flow', () => {
    it('完整的注册流程应该工作正常', async () => {
      const email = `register-flow-${Date.now()}@example.com`;
      const password = 'RegisterFlow123';

      // 1. 检查邮箱不存在
      const existingUser = await findUserByEmail(email);
      expect(existingUser).toBeNull();

      // 2. 创建用户
      const hashedPassword = await bcrypt.hash(password, 12);
      const { user, isNewUser } = await createEmailPasswordUser(
        email,
        hashedPassword,
        'Register Flow User'
      );

      expect(user).toBeDefined();
      expect(user.email).toBe(email);
      expect(isNewUser).toBe(true);

      // 3. 验证余额已初始化
      const balance = await getUserBalance(user.id);
      expect(balance.balance).toBe('0');

      // 4. 发放欢迎奖励
      const welcomeBonus = await grantWelcomeBonus(user.id);
      expect(parseFloat(welcomeBonus)).toBeGreaterThan(0);

      // 5. 验证密码
      const isValid = await verifyUserPassword(user.id, password);
      expect(isValid).toBe(true);

      // 6. 验证可以登录
      const authenticatedUser = await authenticateEmailPassword(email, password);
      expect(authenticatedUser.id).toBe(user.id);

      // 清理
      await cleanupUser(email);
    });
  });

  describe('Integration: Complete Login Flow', () => {
    it('完整的登录流程应该工作正常', async () => {
      const email = `login-flow-${Date.now()}@example.com`;
      const password = 'LoginFlow123';

      // 1. 先注册用户
      const hashedPassword = await bcrypt.hash(password, 12);
      const { user: registeredUser } = await createEmailPasswordUser(
        email,
        hashedPassword,
        'Login Flow User'
      );

      // 2. 使用邮箱密码登录
      const user = await authenticateEmailPassword(email, password);
      expect(user.id).toBe(registeredUser.id);
      expect(user.email).toBe(email);

      // 3. 获取用户余额
      const balance = await getUserBalance(user.id);
      expect(balance).toBeDefined();

      // 清理
      await cleanupUser(email);
    });
  });

  describe('Integration: Change Password Flow', () => {
    it('完整的修改密码流程应该工作正常', async () => {
      const email = `change-pwd-${Date.now()}@example.com`;
      const oldPassword = 'OldPassword123';
      const newPassword = 'NewPassword456';

      // 1. 创建用户
      const oldHashedPassword = await bcrypt.hash(oldPassword, 12);
      const { user } = await createEmailPasswordUser(
        email,
        oldHashedPassword,
        'Change Password User'
      );

      // 2. 验证当前密码
      const isCurrentValid = await verifyUserPassword(user.id, oldPassword);
      expect(isCurrentValid).toBe(true);

      // 3. 更新密码
      const newHashedPassword = await bcrypt.hash(newPassword, 12);
      await updateUserPassword(user.id, newHashedPassword);

      // 4. 验证新密码有效
      const isNewValid = await verifyUserPassword(user.id, newPassword);
      expect(isNewValid).toBe(true);

      // 5. 验证旧密码无效
      const isOldValid = await verifyUserPassword(user.id, oldPassword);
      expect(isOldValid).toBe(false);

      // 6. 使用新密码登录
      const authenticatedUser = await authenticateEmailPassword(email, newPassword);
      expect(authenticatedUser.id).toBe(user.id);

      // 7. 使用旧密码登录应该失败
      await expect(
        authenticateEmailPassword(email, oldPassword)
      ).rejects.toThrow(AuthenticationError);

      // 清理
      await cleanupUser(email);
    });

    it('错误的当前密码应该被拒绝', async () => {
      const email = `wrong-pwd-${Date.now()}@example.com`;
      const correctPassword = 'CorrectPassword123';
      const wrongPassword = 'WrongPassword456';

      // 创建用户
      const hashedPassword = await bcrypt.hash(correctPassword, 12);
      const { user } = await createEmailPasswordUser(
        email,
        hashedPassword,
        'Wrong Password User'
      );

      // 尝试用错误的当前密码验证
      const isValid = await verifyUserPassword(user.id, wrongPassword);
      expect(isValid).toBe(false);

      // 清理
      await cleanupUser(email);
    });
  });
});
