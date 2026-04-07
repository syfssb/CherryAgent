import bcrypt from 'bcryptjs';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  users,
  userBalances,
  balanceTransactions,
} from '../db/schema.js';
import {
  AuthenticationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
} from '../utils/errors.js';
import { getSystemConfig, getSystemConfigNumber } from './config.js';

/**
 * OAuth 用户信息（替代原 Supabase 用户信息）
 */
export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}

/**
 * 用户信息类型
 */
export interface UserInfo {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatarUrl: string | null;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

/**
 * 用户余额信息
 */
export interface BalanceInfo {
  balance: string;
  currency: string;
  totalDeposited: string;
  totalSpent: string;
  credits: number;
  totalCreditsPurchased: number;
  totalCreditsConsumed: number;
}

/**
 * 欢迎奖励积分默认值（配置不存在时的 fallback）
 * 优先从 system_configs 表的 welcome_credits 读取（单位：积分，直接使用）
 * 兼容旧配置 welcome_bonus_cents（单位：分，需除以 100）
 */
const DEFAULT_WELCOME_BONUS_CREDITS = 10;

/**
 * 查找或创建用户
 * 根据 OAuth 用户信息查找本地用户，不存在则创建
 * @param oauthUser - OAuth 用户信息
 * @returns 用户信息和是否为新用户
 */
export async function findOrCreateUser(
  oauthUser: OAuthUserInfo
): Promise<{ user: UserInfo; isNewUser: boolean }> {
  // 首先尝试通过 supabaseId 查找（向后兼容）
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.supabaseId, oauthUser.id))
    .limit(1);

  if (existingUser.length > 0) {
    const user = existingUser[0]!;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        isActive: user.isActive,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
      },
      isNewUser: false,
    };
  }

  // 检查邮箱是否已存在 (可能是通过其他方式注册的)
  const existingEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, oauthUser.email))
    .limit(1);

  if (existingEmail.length > 0) {
    const existingEmailUser = existingEmail[0]!;
    // 更新现有用户的 supabaseId（向后兼容字段名）
    const updated = await db
      .update(users)
      .set({
        supabaseId: oauthUser.id,
        avatarUrl: oauthUser.avatarUrl ?? existingEmailUser.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingEmailUser.id))
      .returning();

    if (updated.length === 0) {
      throw new DatabaseError('更新用户信息失败');
    }

    const user = updated[0]!;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        isActive: user.isActive,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
      },
      isNewUser: false,
    };
  }

  // 创建新用户
  const newUser = await db
    .insert(users)
    .values({
      email: oauthUser.email,
      password: '', // OAuth 用户不需要本地密码
      name: oauthUser.name ?? oauthUser.email.split('@')[0],
      role: 'user',
      supabaseId: oauthUser.id,
      avatarUrl: oauthUser.avatarUrl,
      isActive: true,
      emailVerifiedAt: oauthUser.emailVerified ? new Date() : null,
    })
    .returning();

  if (newUser.length === 0) {
    throw new DatabaseError('创建用户失败');
  }

  const user = newUser[0]!;

  // 初始化用户余额
  await db.insert(userBalances).values({
    userId: user.id,
    balance: '0',
    currency: 'CNY',
    totalDeposited: '0',
    totalSpent: '0',
    credits: '0',
    totalCreditsPurchased: '0',
    totalCreditsConsumed: '0',
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    },
    isNewUser: true,
  };
}

/**
 * 查找或创建 OAuth 用户（Google 等第三方登录）
 * 通过 email 查找本地用户，不存在则创建
 * @param oauthUser - OAuth 提供商返回的用户信息
 * @returns 用户信息和是否为新用户
 */
export async function findOrCreateOAuthUser(
  oauthUser: OAuthUserInfo
): Promise<{ user: UserInfo; isNewUser: boolean }> {
  // 通过 email 查找现有用户
  const existingEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, oauthUser.email))
    .limit(1);

  if (existingEmail.length > 0) {
    const existing = existingEmail[0]!;

    // 更新头像和名称（如果 OAuth 提供了更新的信息）
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (oauthUser.avatarUrl && !existing.avatarUrl) {
      updates.avatarUrl = oauthUser.avatarUrl;
    }
    if (oauthUser.name && !existing.name) {
      updates.name = oauthUser.name;
    }
    if (oauthUser.emailVerified && !existing.emailVerifiedAt) {
      updates.emailVerifiedAt = new Date();
    }

    const updated = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, existing.id))
      .returning();

    const user = updated[0] ?? existing;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        isActive: user.isActive,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
      },
      isNewUser: false,
    };
  }

  // 创建新用户
  const newUser = await db
    .insert(users)
    .values({
      email: oauthUser.email,
      password: '', // OAuth 用户不需要本地密码
      name: oauthUser.name ?? oauthUser.email.split('@')[0],
      role: 'user',
      avatarUrl: oauthUser.avatarUrl,
      isActive: true,
      emailVerifiedAt: oauthUser.emailVerified ? new Date() : null,
    })
    .returning();

  if (newUser.length === 0) {
    throw new DatabaseError('创建用户失败');
  }

  const user = newUser[0]!;

  // 初始化用户余额
  await db.insert(userBalances).values({
    userId: user.id,
    balance: '0',
    currency: 'CNY',
    totalDeposited: '0',
    totalSpent: '0',
    credits: '0',
    totalCreditsPurchased: '0',
    totalCreditsConsumed: '0',
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    },
    isNewUser: true,
  };
}

/**
 * 发放欢迎奖励
 * @param userId - 用户 ID
 * @returns 奖励金额
 */
export async function grantWelcomeBonus(userId: string): Promise<string> {
  console.log(`[WelcomeBonus] 开始为用户 ${userId} 发放欢迎奖励`);

  // 优先从 welcome_credits 读取（单位：积分，直接使用）
  // 兼容旧配置 welcome_bonus_cents（单位：分，需除以 100）
  const welcomeCreditsRaw = await getSystemConfig('welcome_credits', '');
  let welcomeBonusCredits: number;

  console.log(`[WelcomeBonus] welcome_credits 配置值: "${welcomeCreditsRaw}" (type: ${typeof welcomeCreditsRaw})`);

  if (welcomeCreditsRaw && !isNaN(parseFloat(welcomeCreditsRaw)) && parseFloat(welcomeCreditsRaw) > 0) {
    welcomeBonusCredits = parseFloat(welcomeCreditsRaw);
    console.log(`[WelcomeBonus] 使用 welcome_credits 配置: ${welcomeBonusCredits} 积分`);
  } else {
    const welcomeBonusCents = await getSystemConfigNumber('welcome_bonus_cents', DEFAULT_WELCOME_BONUS_CREDITS * 100);
    welcomeBonusCredits = welcomeBonusCents / 100;
    console.log(`[WelcomeBonus] 使用 welcome_bonus_cents 配置: ${welcomeBonusCents} 分 = ${welcomeBonusCredits} 积分`);
  }

  if (welcomeBonusCredits <= 0) {
    console.log(`[WelcomeBonus] 奖励积分 <= 0，跳过发放`);
    return '0';
  }

  // 检查用户是否已经领取过欢迎奖励
  // 注意：签到奖励也使用 type='bonus'，所以必须同时匹配 description 来精确区分
  const existingBonus = await db
    .select()
    .from(balanceTransactions)
    .where(
      and(
        eq(balanceTransactions.userId, userId),
        eq(balanceTransactions.type, 'bonus'),
        sql`${balanceTransactions.description} LIKE '%欢迎奖励%'`
      )
    )
    .limit(1);

  if (existingBonus.length > 0) {
    console.log(`[WelcomeBonus] 用户 ${userId} 已领取过欢迎奖励，跳过`);
    return '0';
  }

  // 获取当前积分
  const balanceResult = await db
    .select()
    .from(userBalances)
    .where(eq(userBalances.userId, userId))
    .limit(1);

  let currentCredits = 0;

  if (balanceResult.length === 0) {
    console.log(`[WelcomeBonus] 用户 ${userId} 无余额记录，创建初始记录`);
    await db.insert(userBalances).values({
      userId,
      balance: '0',
      currency: 'CNY',
      totalDeposited: '0',
      totalSpent: '0',
      credits: '0',
      totalCreditsPurchased: '0',
      totalCreditsConsumed: '0',
    });
  } else {
    currentCredits = parseFloat(balanceResult[0]!.credits);
  }

  const newCredits = Number((currentCredits + welcomeBonusCredits).toFixed(2));

  console.log(`[WelcomeBonus] 用户 ${userId}: 当前积分=${currentCredits}, 奖励=${welcomeBonusCredits}, 更新后=${newCredits}`);

  // 更新积分
  await db
    .update(userBalances)
    .set({
      credits: newCredits.toString(),
      totalCreditsPurchased: sql`${userBalances.totalCreditsPurchased}::decimal + ${welcomeBonusCredits.toFixed(2)}::decimal`,
      updatedAt: new Date(),
    })
    .where(eq(userBalances.userId, userId));

  // 记录交易
  await db.insert(balanceTransactions).values({
    userId,
    type: 'bonus',
    amount: '0',
    balanceBefore: '0',
    balanceAfter: '0',
    creditsAmount: welcomeBonusCredits.toFixed(2),
    creditsBefore: currentCredits.toFixed(2),
    creditsAfter: newCredits.toFixed(2),
    description: `新用户欢迎奖励 ${welcomeBonusCredits} 积分`,
  });

  console.log(`[WelcomeBonus] 用户 ${userId} 欢迎奖励发放成功: ${welcomeBonusCredits} 积分`);
  return welcomeBonusCredits.toString();
}

/**
 * 获取用户余额
 * @param userId - 用户 ID
 * @returns 余额信息
 */
export async function getUserBalance(userId: string): Promise<BalanceInfo> {
  const result = await db
    .select()
    .from(userBalances)
    .where(eq(userBalances.userId, userId))
    .limit(1);

  if (result.length === 0) {
    // 初始化余额记录
    await db.insert(userBalances).values({
      userId,
      balance: '0',
      currency: 'CNY',
      totalDeposited: '0',
      totalSpent: '0',
      credits: '0',
      totalCreditsPurchased: '0',
      totalCreditsConsumed: '0',
    });

    return {
      balance: '0',
      currency: 'CNY',
      totalDeposited: '0',
      totalSpent: '0',
      credits: 0,
      totalCreditsPurchased: 0,
      totalCreditsConsumed: 0,
    };
  }

  const balance = result[0]!;
  return {
    balance: balance.balance,
    currency: balance.currency,
    totalDeposited: balance.totalDeposited,
    totalSpent: balance.totalSpent,
    credits: parseFloat(balance.credits),
    totalCreditsPurchased: parseFloat(balance.totalCreditsPurchased),
    totalCreditsConsumed: parseFloat(balance.totalCreditsConsumed),
  };
}

/**
 * 获取用户信息
 * @param userId - 用户 ID
 * @returns 用户信息
 */
export async function getUserById(userId: string): Promise<UserInfo> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('用户');
  }

  const user = result[0]!;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

/**
 * 通过邮箱查找用户
 * @param email - 用户邮箱
 * @returns 用户信息，如果不存在返回 null
 */
export async function findUserByEmail(email: string): Promise<UserInfo | null> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const user = result[0]!;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

/**
 * 创建邮箱密码用户
 * 使用事务确保用户和余额同时创建
 * @param email - 用户邮箱
 * @param hashedPassword - bcrypt 加密后的密码
 * @param name - 用户名称（可选）
 * @returns 用户信息和是否为新用户
 */
export async function createEmailPasswordUser(
  email: string,
  hashedPassword: string,
  name?: string
): Promise<{ user: UserInfo; isNewUser: boolean }> {
  // 检查邮箱是否已存在
  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    // 已验证的用户不允许重复注册
    if (existingUser.emailVerifiedAt) {
      throw new ConflictError('该邮箱已被注册');
    }

    // 未验证的用户：更新密码和名称，允许重新走注册流程
    const updates: Record<string, unknown> = {
      password: hashedPassword,
      updatedAt: new Date(),
    };
    if (name) {
      updates.name = name;
    }

    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, existingUser.id));

    return {
      user: {
        ...existingUser,
        name: name ?? existingUser.name,
      },
      isNewUser: false,
    };
  }

  // 使用事务创建用户和初始化余额
  const result = await db.transaction(async (tx) => {
    // 创建新用户
    const [newUser] = await tx
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        name: name ?? email.split('@')[0],
        role: 'user',
        isActive: true,
        emailVerifiedAt: null, // 邮箱密码注册默认未验证
      })
      .returning();

    if (!newUser) {
      throw new DatabaseError('创建用户失败');
    }

    // 初始化用户余额
    await tx.insert(userBalances).values({
      userId: newUser.id,
      balance: '0',
      currency: 'CNY',
      totalDeposited: '0',
      totalSpent: '0',
      credits: '0',
      totalCreditsPurchased: '0',
      totalCreditsConsumed: '0',
    });

    return newUser;
  });

  return {
    user: {
      id: result.id,
      email: result.email,
      name: result.name,
      role: result.role,
      avatarUrl: result.avatarUrl,
      isActive: result.isActive,
      emailVerifiedAt: result.emailVerifiedAt,
      createdAt: result.createdAt,
    },
    isNewUser: true,
  };
}

/**
 * 验证用户密码
 * @param email - 用户邮箱
 * @param password - 明文密码
 * @returns 用户信息
 * @throws AuthenticationError 如果邮箱或密码错误
 */
export async function authenticateEmailPassword(
  email: string,
  password: string
): Promise<UserInfo> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (result.length === 0) {
    throw new AuthenticationError('邮箱或密码错误');
  }

  const user = result[0]!;

  // 检查用户是否激活
  if (!user.isActive) {
    throw new AuthenticationError('用户已被禁用');
  }

  // 验证密码
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new AuthenticationError('邮箱或密码错误');
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

/**
 * 更新用户密码
 * @param userId - 用户 ID
 * @param newHashedPassword - 新的 bcrypt 加密密码
 */
export async function updateUserPassword(
  userId: string,
  newHashedPassword: string
): Promise<void> {
  const result = await db
    .update(users)
    .set({
      password: newHashedPassword,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (result.length === 0) {
    throw new NotFoundError('用户');
  }
}

/**
 * 验证用户当前密码
 * @param userId - 用户 ID
 * @param currentPassword - 当前密码
 * @returns 是否验证成功
 */
export async function verifyUserPassword(
  userId: string,
  currentPassword: string
): Promise<boolean> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('用户');
  }

  const user = result[0]!;
  return await bcrypt.compare(currentPassword, user.password);
}

