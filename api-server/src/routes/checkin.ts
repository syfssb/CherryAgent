/**
 * 签到 API 路由
 *
 * POST /api/checkin       - 执行签到
 * GET  /api/checkin/status - 获取签到状态
 * GET  /api/checkin/calendar - 获取签到日历
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { successResponse } from '../utils/response.js';
import {
  performCheckIn,
  getCheckInStatus,
  getCheckInCalendar,
} from '../services/checkin.js';

export const checkinRouter = Router();

/**
 * 执行签到
 * POST /api/checkin
 */
checkinRouter.post(
  '/',
  authenticate,
  async (req: Request, res: Response) => {
    const result = await performCheckIn(req.userId!);

    res.json(successResponse(result));
  }
);

/**
 * 获取签到状态
 * GET /api/checkin/status
 */
checkinRouter.get(
  '/status',
  authenticate,
  async (req: Request, res: Response) => {
    const status = await getCheckInStatus(req.userId!);

    res.json(successResponse(status));
  }
);

/**
 * 签到日历查询 Schema
 */
const calendarQuerySchema = z.object({
  year: z.string().regex(/^\d{4}$/, '年份格式无效').transform(Number),
  month: z.string().regex(/^(1[0-2]|[1-9])$/, '月份格式无效').transform(Number),
});

/**
 * 获取签到日历
 * GET /api/checkin/calendar?year=2026&month=2
 */
checkinRouter.get(
  '/calendar',
  authenticate,
  validateQuery(calendarQuerySchema),
  async (req: Request, res: Response) => {
    const { year, month } = req.query as unknown as { year: number; month: number };

    const calendar = await getCheckInCalendar(req.userId!, year, month);

    res.json(successResponse({ calendar }));
  }
);
