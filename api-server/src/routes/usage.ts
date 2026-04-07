import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse, paginationMeta } from '../utils/response.js';
import { validateQuery, CommonSchemas } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { usageService } from '../services/usage.js';
import { billingService } from '../services/billing.js';

export const usageRouter = Router();

// 所有路由需要认证
usageRouter.use(authenticate);

/**
 * 积分计算（轻量 API，供客户端用 token 数量换算积分）
 * GET /api/usage/calculate?model=xxx&input=1000&output=500
 */
usageRouter.get(
  '/calculate',
  async (req: Request, res: Response) => {
    const model = String(req.query.model || '');
    const input = Number(req.query.input) || 0;
    const output = Number(req.query.output) || 0;
    const cacheRead = Number(req.query.cacheRead) || 0;
    const cacheWrite = Number(req.query.cacheWrite) || 0;

    const result = await billingService.calculateCredits(model, input, output, cacheRead, cacheWrite);
    res.json(successResponse(result));
  }
);

/**
 * 使用量查询 Schema
 */
const usageQuerySchema = CommonSchemas.pagination.merge(CommonSchemas.dateRange).extend({
  model: z.string().optional(),
  provider: z.string().optional(),
  status: z.enum(['success', 'error']).optional(),
  sessionId: z.string().optional(),
});

const timeSeriesQuerySchema = CommonSchemas.dateRange.extend({
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
});


/**
 * 获取使用量记录
 * GET /api/usage
 */
usageRouter.get(
  '/',
  validateQuery(usageQuerySchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { page, limit, startDate, endDate, model, provider, status, sessionId } = req.query as unknown as z.infer<typeof usageQuerySchema>;

    const { records, total } = await usageService.getUsageRecords(userId, {
      page,
      limit,
      startDate,
      endDate,
      model,
      provider,
      status,
      sessionId,
    });

    res.json(successResponse(records, paginationMeta(total, page, limit)));
  }
);


/**
 * 获取使用量摘要
 * GET /api/usage/summary
 */
usageRouter.get(
  '/summary',
  validateQuery(CommonSchemas.dateRange),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { startDate, endDate } = req.query as { startDate?: Date; endDate?: Date };

    const summary = await usageService.getUsageSummary(userId, startDate, endDate);

    res.json(successResponse(summary));
  }
);


/**
 * 获取配额信息
 * GET /api/usage/quota
 */
usageRouter.get(
  '/quota',
  async (req: Request, res: Response) => {
    const userId = req.userId!;

    const quota = await usageService.getQuotaInfo(userId);

    res.json(successResponse(quota));
  }
);


/**
 * 获取请求日志 (详细记录)
 * GET /api/usage/logs
 */
usageRouter.get(
  '/logs',
  validateQuery(CommonSchemas.pagination.merge(CommonSchemas.dateRange).extend({
    model: z.string().optional(),
    status: z.enum(['success', 'error']).optional(),
  })),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { page, limit, startDate, endDate, model, status } = req.query as unknown as {
      page: number;
      limit: number;
      startDate?: Date;
      endDate?: Date;
      model?: string;
      status?: 'success' | 'error';
    };

    const { records, total } = await usageService.getUsageRecords(userId, {
      page,
      limit,
      startDate,
      endDate,
      model,
      status,
    });

    res.json(successResponse(records, paginationMeta(total, page, limit)));
  }
);


/**
 * 获取时间序列数据
 * GET /api/usage/timeseries
 */
usageRouter.get(
  '/timeseries',
  validateQuery(timeSeriesQuerySchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { startDate, endDate, granularity } = req.query as unknown as z.infer<typeof timeSeriesQuerySchema>;

    const data = await usageService.getTimeSeriesData(userId, granularity, startDate, endDate);

    res.json(successResponse(data));
  }
);

/**
 * 导出使用量报告
 * GET /api/usage/export
 */
usageRouter.get(
  '/export',
  validateQuery(CommonSchemas.dateRange.extend({
    format: z.enum(['csv', 'json']).default('csv'),
  })),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { startDate, endDate, format } = req.query as unknown as {
      startDate?: Date;
      endDate?: Date;
      format: 'csv' | 'json';
    };

    const records = await usageService.exportUsageData(userId, startDate, endDate);

    if (format === 'csv') {
      const csv = usageService.formatAsCSV(records);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=usage-report-${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json(successResponse(records));
    }
  }
);

/**
 * 获取模型列表
 * GET /api/usage/models
 */
usageRouter.get(
  '/models',
  async (req: Request, res: Response) => {
    const userId = req.userId!;

    const models = await usageService.getModelList(userId);

    res.json(successResponse(models));
  }
);

/**
 * 获取提供商列表
 * GET /api/usage/providers
 */
usageRouter.get(
  '/providers',
  async (req: Request, res: Response) => {
    const userId = req.userId!;

    const providers = await usageService.getProviderList(userId);

    res.json(successResponse(providers));
  }
);
