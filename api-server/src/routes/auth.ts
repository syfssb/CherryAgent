import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { successResponse } from '../utils/response.js';
import { validateBody } from '../middleware/validate.js';
import {
  authenticate,
  generateToken,
  verifyRefreshToken,
} from '../middleware/auth.js';
import { AuthenticationError, ValidationError, RateLimitError } from '../utils/errors.js';
import { emailService } from '../services/email.js';
import { pool } from '../db/index.js';
import { env } from '../utils/env.js';
import { createOAuthState, verifyOAuthState } from '../utils/oauth-state.js';
import {
  grantWelcomeBonus,
  getUserBalance,
  getUserById,
  findUserByEmail,
  createEmailPasswordUser,
  authenticateEmailPassword,
  verifyUserPassword,
  updateUserPassword,
  findOrCreateOAuthUser,
} from '../services/user.js';
import { preRegistrationCheck, recordRegistration } from '../services/fraud.js';
import { sendPasswordResetForUser } from '../services/password-reset.js';
import { verifyCaptchaFromConfig } from '../services/captcha.js';

export const authRouter = Router();

/**
 * 注册请求 Schema
 */
const registerSchema = z.object({
  email: z.string().email('无效的邮箱格式'),
  password: z.string()
    .min(8, '密码至少 8 个字符')
    .max(100, '密码最多 100 个字符')
    .regex(/[A-Z]/, '密码需要包含大写字母')
    .regex(/[a-z]/, '密码需要包含小写字母')
    .regex(/[0-9]/, '密码需要包含数字'),
  name: z.string().min(2, '名称至少 2 个字符').max(50, '名称最多 50 个字符').optional(),
  referralCode: z.string().min(1).max(20).trim().optional(),
  captchaTicket: z.string().optional(),
  captchaRandstr: z.string().optional(),
});

/**
 * 登录请求 Schema
 */
const loginSchema = z.object({
  email: z.string().email('无效的邮箱格式'),
  password: z.string().min(1, '密码不能为空'),
  captchaTicket: z.string().optional(),
  captchaRandstr: z.string().optional(),
});

/**
 * 刷新 Token Schema
 */
const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh Token 不能为空'),
});

/**
 * 刷新 Token
 * POST /api/auth/refresh
 */
authRouter.post(
  '/refresh',
  validateBody(refreshSchema),
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    try {
      const payload = verifyRefreshToken(refreshToken);

      // 验证用户是否仍然有效
      const user = await getUserById(payload.sub);

      if (!user.isActive) {
        throw new AuthenticationError('用户已被禁用');
      }

      // 生成新的 Token
      const tokens = generateToken(
        user.id,
        user.email,
        user.role as 'user' | 'admin'
      );

      res.json(successResponse(tokens));
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('无效的 Refresh Token');
    }
  }
);

/**
 * 登出
 * POST /api/auth/logout
 */
authRouter.post(
  '/logout',
  authenticate,
  async (_req: Request, res: Response) => {
    res.json(successResponse({ message: '登出成功' }));
  }
);

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
authRouter.get(
  '/me',
  authenticate,
  async (req: Request, res: Response) => {
    const user = await getUserById(req.userId!);
    const balance = await getUserBalance(req.userId!);

    res.json(successResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      balance,
    }));
  }
);

/**
 * 绑定邀请码（内部辅助函数）
 * 注意：此函数不抛出异常，失败时仅记录日志
 */
async function bindReferralCode(userId: string, referralCode: string): Promise<void> {
  try {
    // 检查分销功能是否启用
    const configResult = await pool.query(
      `SELECT is_enabled FROM referral_config LIMIT 1`
    );
    if (configResult.rows.length > 0 && !(configResult.rows[0] as { is_enabled: boolean }).is_enabled) {
      console.log(`[Auth] 邀请码绑定跳过: 分销功能未启用`);
      return;
    }

    const normalizedCode = referralCode.toUpperCase();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 锁定邀请码行，避免并发绕过 max_usage
      const codeResult = await client.query(
        `SELECT id, user_id, usage_count, max_usage, is_active
         FROM referral_codes
         WHERE code = $1
         FOR UPDATE`,
        [normalizedCode]
      );

      if (!codeResult.rows || codeResult.rows.length === 0) {
        console.log(`[Auth] 邀请码绑定失败: 邀请码 ${normalizedCode} 不存在`);
        await client.query('ROLLBACK');
        return;
      }

      const referralCodeData = codeResult.rows[0] as {
        id: string;
        user_id: string;
        usage_count: number;
        max_usage: number | null;
        is_active: boolean;
      };

      if (!referralCodeData.is_active) {
        console.log(`[Auth] 邀请码绑定失败: 邀请码 ${normalizedCode} 已失效`);
        await client.query('ROLLBACK');
        return;
      }

      if (referralCodeData.max_usage !== null && referralCodeData.usage_count >= referralCodeData.max_usage) {
        console.log(`[Auth] 邀请码绑定失败: 邀请码 ${normalizedCode} 已达到使用上限`);
        await client.query('ROLLBACK');
        return;
      }

      // 不能自己推荐自己
      if (referralCodeData.user_id === userId) {
        console.log(`[Auth] 邀请码绑定失败: 用户 ${userId} 不能使用自己的邀请码`);
        await client.query('ROLLBACK');
        return;
      }

      // 通过 ON CONFLICT 防并发重复绑定
      const relationInsert = await client.query(
        `INSERT INTO referral_relations (referrer_id, referred_id, referral_code_id, level)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (referred_id) DO NOTHING
         RETURNING id`,
        [referralCodeData.user_id, userId, referralCodeData.id]
      );

      if (!relationInsert.rows || relationInsert.rows.length === 0) {
        console.log(`[Auth] 邀请码绑定失败: 用户 ${userId} 已使用过邀请码`);
        await client.query('ROLLBACK');
        return;
      }

      // 原子更新使用次数，双保险避免 max_usage 并发穿透
      const usageUpdate = await client.query(
        `UPDATE referral_codes
         SET usage_count = usage_count + 1
         WHERE id = $1
           AND (max_usage IS NULL OR usage_count < max_usage)
         RETURNING usage_count`,
        [referralCodeData.id]
      );

      if (!usageUpdate.rows || usageUpdate.rows.length === 0) {
        console.log(`[Auth] 邀请码绑定失败: 邀请码 ${normalizedCode} 已达到使用上限`);
        await client.query('ROLLBACK');
        return;
      }

      // 检查是否需要创建二级推荐关系
      const configCheck = await client.query(
        `SELECT max_levels FROM referral_config LIMIT 1`
      );
      if (configCheck.rows.length > 0) {
        const maxLevels = (configCheck.rows[0] as { max_levels: number }).max_levels;
        if (maxLevels >= 2) {
          // 查找推荐人的推荐人
          const parentRelation = await client.query(
            `SELECT referrer_id FROM referral_relations WHERE referred_id = $1 AND level = 1`,
            [referralCodeData.user_id]
          );
          if (parentRelation.rows && parentRelation.rows.length > 0) {
            // 二级推荐关系通过佣金记录来体现，而不是再插入 referral_relations
            // parentRelation.rows[0].referrer_id 为祖父推荐人 ID
          }
        }
      }

      await client.query('COMMIT');
      console.log(`[Auth] 邀请码绑定成功: 用户 ${userId} 使用邀请码 ${normalizedCode}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`[Auth] 邀请码绑定异常:`, error);
  }
}

/**
 * 用户注册 (传统邮箱密码方式)
 * POST /api/auth/register
 */
authRouter.post(
  '/register',
  validateBody(registerSchema),
  async (req: Request, res: Response) => {
    const { email, password, name, referralCode, captchaTicket, captchaRandstr } = req.body;

    // 获取客户端 IP
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';

    // 验证码检查（在防刷检查之前，减少数据库查询）
    await verifyCaptchaFromConfig(captchaTicket, captchaRandstr, clientIp);

    // 防刷检查：一次性邮箱 + IP 频率限制
    await preRegistrationCheck(email, clientIp);

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 12);

    // 创建用户（内部处理未验证邮箱用户的重新注册）
    const { user, isNewUser } = await createEmailPasswordUser(
      email,
      hashedPassword,
      name
    );

    // 记录注册信息（IP、一次性邮箱标记）— 不阻塞注册流程
    try {
      await recordRegistration(user.id, email, clientIp);
    } catch (err) {
      console.error('[Auth] 记录注册信息失败（不影响注册）:', err);
    }

    // 发放新用户欢迎奖励（不阻塞注册流程）
    if (isNewUser) {
      try {
        const bonus = await grantWelcomeBonus(user.id);
        console.log(`[Auth] 用户 ${user.id} (${email}) 欢迎奖励: ${bonus} 积分`);
      } catch (err) {
        console.error('[Auth] 发放欢迎奖励失败:', err);
      }
    } else {
      console.log(`[Auth] 用户 ${user.id} (${email}) 非新用户，跳过欢迎奖励`);
    }

    // 绑定邀请码（不阻塞注册流程）
    if (referralCode) {
      bindReferralCode(user.id, referralCode)
        .catch((err) => {
          console.error('[Auth] 邀请码绑定异常:', err);
        });
    }

    // 异步发送邮箱验证邮件
    sendVerificationEmailForUser(user.id, user.email, user.name ?? user.email.split('@')[0] ?? 'user')
      .catch((err) => {
        console.error('[Auth] 发送邮箱验证邮件失败:', err);
      });

    res.status(201).json(successResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      isNewUser,
      emailVerificationSent: true,
      message: '注册成功，请查收验证邮件并点击链接完成验证',
    }));
  }
);

/**
 * 传统邮箱密码登录
 * POST /api/auth/login/password
 */
authRouter.post(
  '/login/password',
  validateBody(loginSchema),
  async (req: Request, res: Response) => {
    const { email, password, captchaTicket, captchaRandstr } = req.body;

    // 验证码检查
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
    await verifyCaptchaFromConfig(captchaTicket, captchaRandstr, clientIp);

    // 验证用户邮箱和密码
    const user = await authenticateEmailPassword(email, password);

    // 检查邮箱是否已验证
    if (!user.emailVerifiedAt) {
      // 重新发送验证邮件
      sendVerificationEmailForUser(user.id, user.email, user.name ?? user.email.split('@')[0] ?? 'user')
        .catch((err) => {
          console.error('[Auth] 重新发送邮箱验证邮件失败:', err);
        });

      res.status(403).json({
        success: false,
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: '请先验证邮箱，验证邮件已重新发送到您的邮箱',
        },
      });
      return;
    }

    // 获取用户余额
    const balance = await getUserBalance(user.id);

    // 生成 JWT tokens
    const tokens = generateToken(user.id, user.email, user.role as 'user' | 'admin');

    res.json(successResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      balance,
      ...tokens,
    }));
  }
);

/**
 * 修改密码
 * POST /api/auth/change-password
 */
authRouter.post(
  '/change-password',
  authenticate,
  validateBody(z.object({
    currentPassword: z.string().min(1, '当前密码不能为空'),
    newPassword: z.string()
      .min(8, '新密码至少 8 个字符')
      .max(100, '新密码最多 100 个字符')
      .regex(/[A-Z]/, '密码需要包含大写字母')
      .regex(/[a-z]/, '密码需要包含小写字母')
      .regex(/[0-9]/, '密码需要包含数字'),
  })),
  async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    // 验证当前密码
    const isValid = await verifyUserPassword(req.userId!, currentPassword);
    if (!isValid) {
      throw new AuthenticationError('当前密码错误');
    }

    // 加密新密码并更新
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await updateUserPassword(req.userId!, hashedPassword);

    res.json(successResponse({ message: '密码修改成功' }));
  }
);

/**
 * 验证 Token 有效性
 * GET /api/auth/verify
 */
authRouter.get(
  '/verify',
  authenticate,
  async (_req: Request, res: Response) => {
    res.json(successResponse({ valid: true }));
  }
);

// ============================================================
// 邮箱验证相关
// ============================================================

/**
 * 为用户生成验证 token 并发送验证邮件（内部辅助函数）
 */
async function sendVerificationEmailForUser(
  userId: string,
  email: string,
  username: string
): Promise<void> {
  // 删除该用户之前的验证 token
  await pool.query(
    `DELETE FROM email_verification_tokens WHERE user_id = $1`,
    [userId]
  );

  // 生成新 token（64 字节 hex = 128 字符）
  const token = crypto.randomBytes(64).toString('hex');

  // 插入新 token，有效期 24 小时
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
    [userId, token]
  );

  // 构建验证链接
  const verifyLink = `${env.API_BASE_URL}/api/auth/verify-email/${token}`;

  // 发送验证邮件
  await emailService.sendVerificationEmail(email, username, verifyLink);
}

/**
 * 验证邮箱
 * GET /api/auth/verify-email/:token
 *
 * 用户点击邮件中的链接后访问此路由
 */
authRouter.get(
  '/verify-email/:token',
  async (req: Request, res: Response) => {
    const { token } = req.params;

    // 查找有效的 token
    const result = await pool.query(
      `SELECT evt.id, evt.user_id, evt.expires_at, u.email, u.email_verified_at
       FROM email_verification_tokens evt
       JOIN users u ON u.id = evt.user_id
       WHERE evt.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      res.status(400).send(buildVerifyResultHtml(false, '验证链接无效或已过期'));
      return;
    }

    const row = result.rows[0] as {
      id: string;
      user_id: string;
      expires_at: Date;
      email: string;
      email_verified_at: Date | null;
    };

    // 检查是否已过期
    if (new Date(row.expires_at) < new Date()) {
      // 删除过期 token
      await pool.query(
        `DELETE FROM email_verification_tokens WHERE id = $1`,
        [row.id]
      );
      res.status(400).send(buildVerifyResultHtml(false, '验证链接已过期，请重新发送验证邮件'));
      return;
    }

    // 检查是否已验证
    if (row.email_verified_at) {
      await pool.query(
        `DELETE FROM email_verification_tokens WHERE id = $1`,
        [row.id]
      );
      res.send(buildVerifyResultHtml(true, '您的邮箱已经验证过了'));
      return;
    }

    // 更新用户的 email_verified_at
    await pool.query(
      `UPDATE users SET email_verified_at = NOW() WHERE id = $1`,
      [row.user_id]
    );

    // 删除已使用的 token
    await pool.query(
      `DELETE FROM email_verification_tokens WHERE user_id = $1`,
      [row.user_id]
    );

    res.send(buildVerifyResultHtml(true, '邮箱验证成功！'));
  }
);

/**
 * 重新发送验证邮件
 * POST /api/auth/resend-verification
 *
 * 需要认证，限制每分钟最多 1 次
 */
authRouter.post(
  '/resend-verification',
  authenticate,
  async (req: Request, res: Response) => {
    const userId = req.userId!;

    // 获取用户信息
    const user = await getUserById(userId);

    // 检查是否已验证
    if (user.emailVerifiedAt) {
      throw new ValidationError('邮箱已验证，无需重复验证');
    }

    // 检查发送频率（每分钟最多 1 次）
    const recentToken = await pool.query(
      `SELECT created_at FROM email_verification_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (recentToken.rows.length > 0) {
      const lastCreated = new Date((recentToken.rows[0] as { created_at: Date }).created_at);
      const elapsed = Date.now() - lastCreated.getTime();
      if (elapsed < 60_000) {
        throw new RateLimitError('发送过于频繁，请 1 分钟后再试');
      }
    }

    // 发送验证邮件
    await sendVerificationEmailForUser(
      userId,
      user.email,
      user.name ?? user.email.split('@')[0] ?? 'user'
    );

    res.json(successResponse({ message: '验证邮件已发送，请查收邮箱' }));
  }
);

/**
 * 通过邮箱重新发送验证邮件（无需认证）
 * POST /api/auth/resend-verification-by-email
 */
authRouter.post(
  '/resend-verification-by-email',
  async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
      throw new ValidationError('请提供邮箱地址');
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // 不泄露用户是否存在
      res.json(successResponse({ message: '如果该邮箱已注册，验证邮件将发送到您的邮箱' }));
      return;
    }

    if (user.emailVerifiedAt) {
      res.json(successResponse({ message: '邮箱已验证，请直接登录' }));
      return;
    }

    // 检查发送频率（每分钟最多 1 次）
    const recentToken = await pool.query(
      `SELECT created_at FROM email_verification_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (recentToken.rows.length > 0) {
      const lastCreated = new Date((recentToken.rows[0] as { created_at: Date }).created_at);
      const elapsed = Date.now() - lastCreated.getTime();
      if (elapsed < 60_000) {
        throw new RateLimitError('发送过于频繁，请 1 分钟后再试');
      }
    }

    await sendVerificationEmailForUser(
      user.id,
      user.email,
      user.name ?? user.email.split('@')[0] ?? 'user'
    );

    res.json(successResponse({ message: '验证邮件已发送，请查收邮箱' }));
  }
);

/**
 * 构建邮箱验证结果 HTML 页面
 */
function buildVerifyResultHtml(success: boolean, message: string): string {
  const bgColor = success ? '#10b981' : '#ef4444';
  const icon = success
    ? '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${success ? '验证成功' : '验证失败'} - Cherry Agent</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { max-width: 400px; margin: 20px; background: #fff; border-radius: 12px; padding: 48px 32px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .icon { margin-bottom: 24px; }
    h1 { color: #1f2937; font-size: 24px; margin: 0 0 12px; }
    p { color: #6b7280; line-height: 1.6; margin: 0; }
    .bar { height: 4px; background: ${bgColor}; border-radius: 12px 12px 0 0; position: absolute; top: 0; left: 0; right: 0; }
    .card-wrapper { position: relative; }
  </style>
</head>
<body>
  <div class="card-wrapper">
    <div class="bar"></div>
    <div class="card">
      <div class="icon">${icon}</div>
      <h1>${success ? '验证成功' : '验证失败'}</h1>
      <p>${message}</p>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
// 密码重置相关
// ============================================================

/**
 * 忘记密码请求 Schema
 */
const forgotPasswordSchema = z.object({
  email: z.string().email('无效的邮箱格式'),
  captchaTicket: z.string().optional(),
  captchaRandstr: z.string().optional(),
});

/**
 * 重置密码请求 Schema
 */
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token 不能为空'),
  newPassword: z.string()
    .min(8, '密码至少 8 个字符')
    .max(100, '密码最多 100 个字符')
    .regex(/[A-Z]/, '密码需要包含大写字母')
    .regex(/[a-z]/, '密码需要包含小写字母')
    .regex(/[0-9]/, '密码需要包含数字'),
});

/**
 * 忘记密码 - 发送重置邮件
 * POST /api/auth/forgot-password
 *
 * 无论用户是否存在都返回成功（防止邮箱枚举攻击）
 */
authRouter.post(
  '/forgot-password',
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response) => {
    const { email, captchaTicket, captchaRandstr } = req.body;

    // 验证码检查
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
    await verifyCaptchaFromConfig(captchaTicket, captchaRandstr, clientIp);

    // 查找用户（无论是否存在都返回成功）
    const user = await findUserByEmail(email);

    if (user) {
      // 检查发送频率（每分钟最多 1 次）
      const recentToken = await pool.query(
        `SELECT created_at FROM password_reset_tokens
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [user.id]
      );

      if (recentToken.rows.length > 0) {
        const lastCreated = new Date((recentToken.rows[0] as { created_at: Date }).created_at);
        const elapsed = Date.now() - lastCreated.getTime();
        if (elapsed < 60_000) {
          // 静默返回成功，不暴露频率限制信息
          res.json(successResponse({ message: '如果该邮箱已注册，重置邮件已发送' }));
          return;
        }
      }

      // 异步发送重置邮件（不阻塞响应）
      sendPasswordResetForUser(
        user.id,
        user.email,
        user.name ?? user.email.split('@')[0] ?? 'user'
      ).catch((err) => {
        console.error('[Auth] 发送密码重置邮件失败:', err);
      });
    }

    // 无论用户是否存在都返回相同响应
    res.json(successResponse({ message: '如果该邮箱已注册，重置邮件已发送' }));
  }
);

/**
 * 重置密码 - 验证 token 并更新密码
 * POST /api/auth/reset-password
 */
authRouter.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;

    // 查找有效的 token
    const result = await pool.query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
       FROM password_reset_tokens prt
       WHERE prt.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      throw new ValidationError('重置链接无效或已过期');
    }

    const row = result.rows[0] as {
      id: string;
      user_id: string;
      expires_at: Date;
      used_at: Date | null;
    };

    // 检查是否已使用
    if (row.used_at) {
      throw new ValidationError('该重置链接已被使用');
    }

    // 检查是否已过期
    if (new Date(row.expires_at) < new Date()) {
      // 删除过期 token
      await pool.query(
        `DELETE FROM password_reset_tokens WHERE id = $1`,
        [row.id]
      );
      throw new ValidationError('重置链接已过期，请重新申请');
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // 更新用户密码
    await updateUserPassword(row.user_id, hashedPassword);

    // 标记 token 为已使用
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
      [row.id]
    );

    res.json(successResponse({ message: '密码重置成功，请使用新密码登录' }));
  }
);

/**
 * 重置密码页面
 * GET /api/auth/reset-password-page?token=xxx
 *
 * 用户点击邮件中的链接后显示重置密码表单
 */
authRouter.get(
  '/reset-password-page',
  async (req: Request, res: Response) => {
    // 该页面使用内联脚本处理表单提交与错误提示；全局 CSP 默认禁止内联脚本。
    // 对此路由单独放宽 CSP，避免提交时退回默认表单行为导致 token 丢失。
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
    );

    const token = req.query.token as string;

    if (!token) {
      res.status(400).send(buildResetPasswordHtml('', '缺少重置令牌'));
      return;
    }

    // 验证 token 是否有效
    const result = await pool.query(
      `SELECT id, expires_at, used_at FROM password_reset_tokens WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      res.status(400).send(buildResetPasswordHtml('', '重置链接无效或已过期'));
      return;
    }

    const row = result.rows[0] as { id: string; expires_at: Date; used_at: Date | null };

    if (row.used_at) {
      res.status(400).send(buildResetPasswordHtml('', '该重置链接已被使用'));
      return;
    }

    if (new Date(row.expires_at) < new Date()) {
      res.status(400).send(buildResetPasswordHtml('', '重置链接已过期，请重新申请'));
      return;
    }

    // 显示重置密码表单
    res.send(buildResetPasswordHtml(token));
  }
);

/**
 * 构建重置密码页面 HTML
 */
function buildResetPasswordHtml(token: string, errorMessage?: string): string {
  const apiBaseUrl = env.API_BASE_URL;

  if (errorMessage) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>重置密码失败 - Cherry Agent</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { max-width: 420px; margin: 20px; background: #fff; border-radius: 12px; padding: 48px 32px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .icon { margin-bottom: 24px; }
    h1 { color: #1f2937; font-size: 24px; margin: 0 0 12px; }
    p { color: #6b7280; line-height: 1.6; margin: 0 0 24px; }
    .retry-form { margin-top: 8px; }
    .retry-form input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; outline: none; transition: border-color 0.2s; margin-bottom: 12px; }
    .retry-form input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
    .retry-btn { width: 100%; padding: 10px; background: #6366f1; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
    .retry-btn:hover { background: #4f46e5; }
    .retry-btn:disabled { background: #9ca3af; cursor: not-allowed; }
    .retry-msg { font-size: 13px; margin-top: 12px; display: none; }
    .retry-msg.success { color: #10b981; }
    .retry-msg.error { color: #ef4444; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    </div>
    <h1>重置失败</h1>
    <p>${errorMessage}</p>
    <div class="retry-form">
      <p style="color:#374151;font-size:14px;margin-bottom:12px">输入邮箱重新发送重置链接：</p>
      <input type="email" id="retryEmail" placeholder="请输入注册邮箱" />
      <button class="retry-btn" id="retryBtn" onclick="handleRetry()">重新发送</button>
      <div class="retry-msg" id="retryMsg"></div>
    </div>
  </div>
  <script>
    function handleRetry() {
      var email = document.getElementById('retryEmail').value.trim();
      var btn = document.getElementById('retryBtn');
      var msg = document.getElementById('retryMsg');
      if (!email) { msg.textContent = '请输入邮箱'; msg.className = 'retry-msg error'; msg.style.display = 'block'; return; }
      btn.disabled = true; btn.textContent = '发送中...';
      msg.style.display = 'none';
      fetch(${JSON.stringify(apiBaseUrl + '/api/auth/forgot-password')}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          msg.textContent = '重置邮件已发送，请查收邮箱';
          msg.className = 'retry-msg success';
        } else {
          msg.textContent = (data.error && data.error.message) || '发送失败，请稍后重试';
          msg.className = 'retry-msg error';
        }
        msg.style.display = 'block';
        btn.disabled = false; btn.textContent = '重新发送';
      })
      .catch(function() {
        msg.textContent = '网络错误，请稍后重试';
        msg.className = 'retry-msg error';
        msg.style.display = 'block';
        btn.disabled = false; btn.textContent = '重新发送';
      });
    }
  </script>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>重置密码 - Cherry Agent</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { max-width: 420px; width: 100%; margin: 20px; background: #fff; border-radius: 12px; padding: 40px 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    h1 { color: #1f2937; font-size: 24px; margin: 0 0 8px; text-align: center; }
    .subtitle { color: #6b7280; text-align: center; margin-bottom: 32px; font-size: 14px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; color: #374151; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; outline: none; transition: border-color 0.2s; }
    input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
    .btn { width: 100%; padding: 12px; background: #6366f1; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
    .btn:hover { background: #4f46e5; }
    .btn:disabled { background: #9ca3af; cursor: not-allowed; }
    .error { color: #ef4444; font-size: 13px; margin-top: 6px; display: none; }
    .hint { color: #9ca3af; font-size: 12px; margin-top: 4px; }
    .success { text-align: center; display: none; }
    .success .icon { margin-bottom: 16px; }
    .success h2 { color: #1f2937; font-size: 20px; margin: 0 0 8px; }
    .success p { color: #6b7280; font-size: 14px; }
    #form-error { color: #ef4444; font-size: 14px; text-align: center; margin-bottom: 16px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div id="reset-form">
      <h1>重置密码</h1>
      <p class="subtitle">请输入您的新密码</p>
      <div id="form-error"></div>
      <form onsubmit="handleSubmit(event)">
        <div class="form-group">
          <label for="newPassword">新密码</label>
          <input type="password" id="newPassword" placeholder="至少 8 位，包含大小写字母和数字" required minlength="8" maxlength="100" />
          <div class="hint">密码至少 8 位，且包含大写字母、小写字母和数字</div>
          <div class="error" id="password-error"></div>
        </div>
        <div class="form-group">
          <label for="confirmPassword">确认新密码</label>
          <input type="password" id="confirmPassword" placeholder="再次输入新密码" required />
          <div class="error" id="confirm-error"></div>
        </div>
        <button type="submit" class="btn" id="submit-btn">重置密码</button>
      </form>
    </div>
    <div class="success" id="success-view">
      <div class="icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      </div>
      <h2>密码重置成功</h2>
      <p>您的密码已更新，请使用新密码登录。</p>
    </div>
  </div>
  <script>
    var token = ${JSON.stringify(token)};
    var apiUrl = ${JSON.stringify(apiBaseUrl + '/api/auth/reset-password')};

    function validatePassword(pw) {
      if (pw.length < 8) return '密码至少 8 个字符';
      if (!/[A-Z]/.test(pw)) return '密码需要包含大写字母';
      if (!/[a-z]/.test(pw)) return '密码需要包含小写字母';
      if (!/[0-9]/.test(pw)) return '密码需要包含数字';
      return null;
    }

    function handleSubmit(e) {
      e.preventDefault();
      var pw = document.getElementById('newPassword').value;
      var cpw = document.getElementById('confirmPassword').value;
      var pwErr = document.getElementById('password-error');
      var cfErr = document.getElementById('confirm-error');
      var formErr = document.getElementById('form-error');
      var btn = document.getElementById('submit-btn');

      pwErr.style.display = 'none';
      cfErr.style.display = 'none';
      formErr.style.display = 'none';

      var pwValidation = validatePassword(pw);
      if (pwValidation) {
        pwErr.textContent = pwValidation;
        pwErr.style.display = 'block';
        return;
      }
      if (pw !== cpw) {
        cfErr.textContent = '两次输入的密码不一致';
        cfErr.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = '重置中...';

      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, newPassword: pw })
      })
      .then(function(resp) { return resp.json(); })
      .then(function(data) {
        if (data.success) {
          document.getElementById('reset-form').style.display = 'none';
          document.getElementById('success-view').style.display = 'block';
        } else {
          formErr.textContent = (data.error && data.error.message) || data.error || '重置失败，请重试';
          formErr.style.display = 'block';
          btn.disabled = false;
          btn.textContent = '重置密码';
        }
      })
      .catch(function() {
        formErr.textContent = '网络错误，请重试';
        formErr.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '重置密码';
      });
    }
  </script>
</body>
</html>`;
}

// ============================================================
// OAuth 第三方登录路由
// ============================================================

/**
 * OAuth 回调 Schema
 */
const oauthCallbackSchema = z.object({
  code: z.string().min(1, '授权码不能为空'),
  code_verifier: z.string().min(43).max(128).optional(),
  state: z.string().min(1, 'state 不能为空').max(4096, 'state 长度超限'),
  redirect_uri: z.string().optional(),
});

/**
 * 轮询 OAuth 结果
 * GET /api/auth/oauth/result?state=xxx
 * 注意：必须在 /oauth/:provider 之前注册，否则 "result" 会被当作 provider
 */
authRouter.get(
  '/oauth/result',
  async (req: Request, res: Response) => {
    const { state } = req.query;
    if (!state) {
      res.json(successResponse({ pending: true }));
      return;
    }
    const result = getOAuthResult(String(state));
    if (!result) {
      res.json(successResponse({ pending: true }));
      return;
    }
    res.json(successResponse(result));
  }
);

/**
 * 获取 OAuth 授权 URL
 * GET /api/auth/oauth/:provider
 */
authRouter.get(
  '/oauth/:provider',
  async (req: Request, res: Response) => {
    const { provider } = req.params;

    if (provider !== 'google') {
      throw new ValidationError(`不支持的 OAuth 提供商: ${provider}`);
    }

    const clientId = env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new ValidationError('Google OAuth 未配置');
    }

    const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI
      || `${env.API_BASE_URL}/api/auth/oauth/google/callback`;

    const codeChallenge = req.query.code_challenge as string | undefined;
    const codeChallengeMethod = req.query.code_challenge_method as string | undefined;

    if (codeChallenge && codeChallengeMethod && codeChallengeMethod !== 'S256') {
      throw new ValidationError('仅支持 S256 code_challenge_method');
    }

    const state = createOAuthState({
      provider: 'google',
      redirectUri,
      ...(codeChallenge ? { codeChallenge } : {}),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      state,
    });

    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    res.json(successResponse({ authUrl, state }));
  }
);

/**
 * 临时存储 OAuth 结果（内存中，5 分钟过期）
 */
const oauthResults = new Map<string, { data: any; expiresAt: number }>();

function storeOAuthResult(state: string, data: any) {
  oauthResults.set(state, { data, expiresAt: Date.now() + 5 * 60 * 1000 });
  // 清理过期条目
  for (const [key, val] of oauthResults) {
    if (val.expiresAt < Date.now()) oauthResults.delete(key);
  }
}

function getOAuthResult(state: string) {
  const entry = oauthResults.get(state);
  if (!entry) return null;
  oauthResults.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry.data;
}

/**
 * OAuth GET 回调 — Google 重定向到此路由
 * 完成整个 OAuth 流程，结果存入内存，返回 HTML 自动关闭窗口
 */
authRouter.get(
  '/oauth/:provider/callback',
  async (req: Request, res: Response) => {
    const { code, state, error: oauthError, error_description } = req.query;

    const closeHtml = (message: string, success: boolean) => {
      const iconSvg = success
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      const iconBg = success ? '#22c55e' : '#ef4444';
      const title = success ? '登录成功！' : '登录失败';
      const subtitle = success
        ? '请关闭此页面<br>返回 Cherry Agent 桌面端继续使用'
        : `${message}<br>请关闭此页面后重试`;

      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Cherry Agent</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f5f5f5; color: #1f2937; }
    @media (prefers-color-scheme: dark) { body { background: #1a1a1a; color: #e5e5e5; } }
    .card { background: white; border-radius: 16px; padding: 48px 40px; text-align: center; max-width: 400px; width: 90%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    @media (prefers-color-scheme: dark) { .card { background: #2a2a2a; box-shadow: 0 4px 24px rgba(0,0,0,0.3); } }
    .icon { width: 64px; height: 64px; border-radius: 50%; background: ${iconBg}; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
    .icon svg { width: 32px; height: 32px; }
    h1 { font-size: 24px; font-weight: 600; margin: 0 0 12px; }
    p { font-size: 15px; color: #666; margin: 0; line-height: 1.6; }
    @media (prefers-color-scheme: dark) { p { color: #999; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${iconSvg}</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
  </div>
</body>
</html>`;
    };

    if (oauthError) {
      storeOAuthResult(String(state || 'error'), {
        error: String(error_description || oauthError),
      });
      res.setHeader('Content-Type', 'text/html');
      res.send(closeHtml('授权失败', false));
      return;
    }

    if (!code || !state) {
      res.setHeader('Content-Type', 'text/html');
      res.send(closeHtml('参数缺失', false));
      return;
    }

    // 验证 OAuth state（防 CSRF）
    try {
      const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI
        || `${env.API_BASE_URL}/api/auth/oauth/google/callback`;
      verifyOAuthState(String(state), {
        provider: 'google',
        redirectUri,
      });
    } catch (stateErr: any) {
      storeOAuthResult(String(state), { error: 'state 验证失败' });
      res.setHeader('Content-Type', 'text/html');
      res.send(closeHtml('安全验证失败', false));
      return;
    }

    try {
      const provider = req.params.provider;
      if (provider !== 'google') {
        storeOAuthResult(String(state), { error: '不支持的 OAuth 提供商' });
        res.setHeader('Content-Type', 'text/html');
        res.send(closeHtml('不支持的提供商', false));
        return;
      }

      const clientId = env.GOOGLE_CLIENT_ID;
      const clientSecret = env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        storeOAuthResult(String(state), { error: 'Google OAuth 未配置' });
        res.setHeader('Content-Type', 'text/html');
        res.send(closeHtml('OAuth 未配置', false));
        return;
      }

      const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI
        || `${env.API_BASE_URL}/api/auth/oauth/google/callback`;

      // 用 authorization code 换取 tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        const msg = (errorData as any).error_description || (errorData as any).error || 'token 交换失败';
        storeOAuthResult(String(state), { error: msg });
        res.setHeader('Content-Type', 'text/html');
        res.send(closeHtml('登录失败', false));
        return;
      }

      const tokenData = await tokenResponse.json() as {
        access_token: string;
        id_token?: string;
        refresh_token?: string;
        expires_in: number;
        token_type: string;
      };

      // 获取用户信息
      const userInfoResponse = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );

      if (!userInfoResponse.ok) {
        storeOAuthResult(String(state), { error: '获取用户信息失败' });
        res.setHeader('Content-Type', 'text/html');
        res.send(closeHtml('获取用户信息失败', false));
        return;
      }

      const googleUser = await userInfoResponse.json() as {
        id: string;
        email: string;
        name: string;
        picture: string;
        verified_email: boolean;
      };

      // 查找或创建本地用户
      const { user, isNewUser } = await findOrCreateOAuthUser({
        id: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
        emailVerified: googleUser.verified_email,
      });

      // 新用户发放欢迎奖励
      let welcomeBonus = '0';
      if (isNewUser) {
        try {
          welcomeBonus = await grantWelcomeBonus(user.id);
          console.log(`[OAuth] 用户 ${user.id} (${googleUser.email}) 欢迎奖励: ${welcomeBonus} 积分`);
        } catch (err) {
          console.error('[OAuth] 发放欢迎奖励失败:', err);
        }
      }

      // 获取用户余额
      const balance = await getUserBalance(user.id);

      // 生成 JWT tokens
      const tokens = generateToken(
        user.id,
        user.email,
        user.role as 'user' | 'admin'
      );

      // 存储结果
      storeOAuthResult(String(state), {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn || 3600,
        isNewUser,
        welcomeBonus: isNewUser ? welcomeBonus : '0',
        balance,
      });

      res.setHeader('Content-Type', 'text/html');
      res.send(closeHtml('登录成功', true));
      return;
    } catch (err: any) {
      console.error('[OAuth GET callback] Error:', err);
      storeOAuthResult(String(state), { error: err.message || '登录失败' });
      res.setHeader('Content-Type', 'text/html');
      res.send(closeHtml('登录失败', false));
      return;
    }
  }
);

/* OAUTH_ROUTES_PART2_PLACEHOLDER */

/**
 * OAuth 回调处理
 * POST /api/auth/oauth/:provider/callback
 */
authRouter.post(
  '/oauth/:provider/callback',
  validateBody(oauthCallbackSchema),
  async (req: Request, res: Response) => {
    const { provider } = req.params;

    if (provider !== 'google') {
      throw new ValidationError(`不支持的 OAuth 提供商: ${provider}`);
    }

    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new ValidationError('Google OAuth 未配置');
    }

    const { code, code_verifier, state, redirect_uri } = req.body;

    const redirectUri = redirect_uri
      || env.GOOGLE_OAUTH_REDIRECT_URI
      || `${env.API_BASE_URL}/api/auth/oauth/google/callback`;

    verifyOAuthState(state, {
      provider: 'google',
      redirectUri,
      ...(code_verifier ? { codeVerifier: code_verifier } : {}),
    });

    // 用 authorization code 换取 tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        ...(code_verifier ? { code_verifier } : {}),
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      throw new AuthenticationError(
        `Google token 交换失败: ${(errorData as any).error_description || (errorData as any).error || 'unknown'}`
      );
    }

    /* OAUTH_CALLBACK_PART2 */
    const tokenData = await tokenResponse.json() as {
      access_token: string;
      id_token?: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
    };

    // 获取用户信息
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );

    if (!userInfoResponse.ok) {
      throw new AuthenticationError('获取 Google 用户信息失败');
    }

    const googleUser = await userInfoResponse.json() as {
      id: string;
      email: string;
      name: string;
      picture: string;
      verified_email: boolean;
    };

    // 查找或创建本地用户
    const { user, isNewUser } = await findOrCreateOAuthUser({
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      avatarUrl: googleUser.picture,
      emailVerified: googleUser.verified_email,
    });

    // 新用户发放欢迎奖励
    let welcomeBonus = '0';
    if (isNewUser) {
      try {
        welcomeBonus = await grantWelcomeBonus(user.id);
        console.log(`[OAuth POST] 用户 ${user.id} (${googleUser.email}) 欢迎奖励: ${welcomeBonus} 积分`);
      } catch (err) {
        console.error('[OAuth POST] 发放欢迎奖励失败:', err);
      }
    }

    // 获取用户余额
    const balance = await getUserBalance(user.id);

    // 生成 JWT tokens
    const tokens = generateToken(
      user.id,
      user.email,
      user.role as 'user' | 'admin'
    );

    res.json(successResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      balance,
      isNewUser,
      welcomeBonus: isNewUser ? welcomeBonus : undefined,
      ...tokens,
    }));
  }
);

/**
 * [仅测试/开发环境] 模拟 OAuth 结果写入
 * POST /api/auth/test/mock-oauth-result
 *
 * 用于 E2E 测试：跳过 Google 授权页面，直接写入 OAuth 结果
 */
if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
  authRouter.post(
    '/test/mock-oauth-result',
    async (req: Request, res: Response) => {
      const { state, email, name, avatarUrl } = req.body;

      if (!state || !email) {
        res.status(400).json({ success: false, error: 'state 和 email 为必填' });
        return;
      }

      // 查找或创建用户
      const existingUser = await pool.query(
        'SELECT id, email, name, role, avatar_url FROM users WHERE email = $1',
        [email]
      );

      let userId: string;
      let isNewUser = false;

      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
      } else {
        const newUser = await pool.query(
          `INSERT INTO users (email, password, name, role, avatar_url, email_verified_at)
           VALUES ($1, 'oauth-no-password', $2, 'user', $3, NOW())
           RETURNING id`,
          [email, name || 'E2E OAuth User', avatarUrl || '']
        );
        userId = newUser.rows[0].id;
        isNewUser = true;

        await pool.query(
          `INSERT INTO user_balances (user_id, credits) VALUES ($1, 0)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId]
        );
      }

      const tokens = generateToken(userId, email, 'user');

      storeOAuthResult(state, {
        user: { id: userId, email, name: name || 'E2E OAuth User', role: 'user' },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn ?? 3600,
        isNewUser,
      });

      res.json(successResponse({ message: 'OAuth result stored', state }));
    }
  );
}
