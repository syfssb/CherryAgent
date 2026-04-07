/**
 * 公开 API - 系统配置路由
 *
 * 功能:
 * - GET /api/configs/privacy-policy    - 获取隐私政策
 * - GET /api/configs/terms-of-service  - 获取服务条款
 * - GET /api/configs/about-us          - 获取关于我们
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db/index.js';
import { successResponse } from '../utils/response.js';
import { NotFoundError } from '../utils/errors.js';
import { getLegalContent } from '../utils/legal-contents.js';
import { getSystemConfigBool, getSystemConfig } from '../services/config.js';

export const publicConfigsRouter = Router();

/**
 * 通用配置获取函数
 */
async function getConfigValue(key: string): Promise<string> {
  const result = await pool.query(
    'SELECT value FROM system_configs WHERE key = $1',
    [key]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('配置项');
  }

  return (result.rows[0] as { value: string }).value;
}

/**
 * GET /api/configs/privacy-policy
 */
publicConfigsRouter.get('/privacy-policy', async (req: Request, res: Response) => {
  const lang = (req.query.lang as string) || 'en';
  const value = await getLegalContent('privacy_policy', lang);
  res.json(successResponse({ content: value }));
});

/**
 * GET /api/configs/terms-of-service
 */
publicConfigsRouter.get('/terms-of-service', async (req: Request, res: Response) => {
  const lang = (req.query.lang as string) || 'en';
  const value = await getLegalContent('terms_of_service', lang);
  res.json(successResponse({ content: value }));
});

/**
 * GET /api/configs/about-us
 */
publicConfigsRouter.get('/about-us', async (req: Request, res: Response) => {
  const lang = (req.query.lang as string) || 'en';
  const value = await getLegalContent('about_us', lang);
  res.json(successResponse({ content: value }));
});

/**
 * GET /api/configs/welcome-credits
 * 获取新用户注册奖励积分数量
 */
publicConfigsRouter.get('/welcome-credits', async (_req: Request, res: Response) => {
  try {
    const value = await getConfigValue('welcome_credits');
    const credits = parseInt(value, 10);
    res.json(successResponse({
      credits,
      amount: credits * 0.1 // 1积分=0.1元
    }));
  } catch {
    // 如果配置不存在，返回默认值
    res.json(successResponse({
      credits: 30,
      amount: 3
    }));
  }
});

/**
 * GET /api/configs/captcha
 * 获取验证码公开配置（不返回敏感密钥）
 */
publicConfigsRouter.get('/captcha', async (_req: Request, res: Response) => {
  const captchaEnabled = await getSystemConfigBool('captcha_enabled', false);
  const captchaAppId = await getSystemConfig('captcha_app_id', '');

  res.json(successResponse({
    captchaEnabled,
    captchaAppId,
  }));
});

export default publicConfigsRouter;
