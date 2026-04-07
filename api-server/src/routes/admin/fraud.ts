/**
 * 管理后台 - 防刷管理路由
 *
 * GET    /api/admin/fraud/suspicious     - 获取可疑账户列表
 * POST   /api/admin/fraud/review/:id     - 审核可疑账户
 * POST   /api/admin/fraud/freeze/:userId - 冻结用户
 * POST   /api/admin/fraud/unfreeze/:userId - 解冻用户
 * POST   /api/admin/fraud/clawback/:userId - 回收欢迎奖励
 * POST   /api/admin/fraud/scan           - 手动触发扫描
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateAdminAsync } from '../../middleware/admin-auth.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { successResponse, paginationMeta } from '../../utils/response.js';
import {
  getSuspiciousAccounts,
  reviewSuspiciousAccount,
  freezeUser,
  unfreezeUser,
  clawbackWelcomeBonus,
  scanSuspiciousAccounts,
} from '../../services/fraud.js';

export const adminFraudRouter = Router();

// 所有路由需要管理员认证
adminFraudRouter.use(authenticateAdminAsync);

/**
 * 获取可疑账户列表
 * GET /api/admin/fraud/suspicious
 */
const suspiciousQuerySchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
  status: z.enum(['pending', 'reviewed', 'dismissed', 'banned']).optional(),
});

adminFraudRouter.get(
  '/suspicious',
  validateQuery(suspiciousQuerySchema),
  async (req: Request, res: Response) => {
    const { page, limit, status } = req.query as unknown as {
      page: number;
      limit: number;
      status?: string;
    };

    const { items, total } = await getSuspiciousAccounts(page, limit, status);

    res.json(successResponse(
      { items },
      paginationMeta(total, page, limit)
    ));
  }
);

/**
 * 审核可疑账户
 * POST /api/admin/fraud/review/:id
 */
const reviewSchema = z.object({
  action: z.enum(['dismiss', 'freeze', 'freeze_and_clawback']),
});

adminFraudRouter.post(
  '/review/:id',
  validateBody(reviewSchema),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { action } = req.body;
    const adminId = req.adminId as string;

    const result = await reviewSuspiciousAccount(id, adminId, action);

    res.json(successResponse({
      message: action === 'dismiss' ? '已忽略该记录' : '已处理该可疑账户',
      ...result,
    }));
  }
);

/**
 * 冻结用户
 * POST /api/admin/fraud/freeze/:userId
 */
const freezeSchema = z.object({
  reason: z.string().min(1, '请填写冻结原因').max(500),
});

adminFraudRouter.post(
  '/freeze/:userId',
  validateBody(freezeSchema),
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const { reason } = req.body;

    await freezeUser(userId, reason);

    res.json(successResponse({ message: '用户已冻结' }));
  }
);

/**
 * 解冻用户
 * POST /api/admin/fraud/unfreeze/:userId
 */
adminFraudRouter.post(
  '/unfreeze/:userId',
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;

    await unfreezeUser(userId);

    res.json(successResponse({ message: '用户已解冻' }));
  }
);

/**
 * 回收欢迎奖励
 * POST /api/admin/fraud/clawback/:userId
 */
adminFraudRouter.post(
  '/clawback/:userId',
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;

    const amount = await clawbackWelcomeBonus(userId);

    res.json(successResponse({
      message: amount > 0
        ? `已回收 ${amount} 积分`
        : '该用户没有可回收的欢迎奖励',
      clawbackAmount: amount,
    }));
  }
);

/**
 * 手动触发可疑账户扫描
 * POST /api/admin/fraud/scan
 */
adminFraudRouter.post(
  '/scan',
  async (_req: Request, res: Response) => {
    await scanSuspiciousAccounts();

    res.json(successResponse({ message: '扫描完成' }));
  }
);
