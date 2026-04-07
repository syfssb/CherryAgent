import crypto from 'crypto';
import { pool } from '../db/index.js';
import { emailService } from './email.js';
import { env } from '../utils/env.js';

/**
 * 发送密码重置邮件（公共服务）
 * 供 auth.ts /forgot-password 和 admin 密码重置共用
 */
export async function sendPasswordResetForUser(
  userId: string,
  email: string,
  name: string
): Promise<void> {
  // 删除该用户之前的重置 token
  await pool.query(
    'DELETE FROM password_reset_tokens WHERE user_id = $1',
    [userId]
  );

  // 生成新 token（32 字节 hex = 64 字符）
  const token = crypto.randomBytes(32).toString('hex');

  // 插入新 token，有效期 1 小时
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [userId, token]
  );

  // 构建重置链接
  const resetLink = `${env.API_BASE_URL}/api/auth/reset-password-page?token=${token}`;

  // 发送重置邮件
  await emailService.sendPasswordResetEmail(email, name, resetLink);
}
