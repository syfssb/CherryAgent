import { Router, type Request, type Response } from 'express';
import { successResponse } from '../utils/response.js';
import { env } from '../utils/env.js';
import {
  performSystemHealthCheck,
  checkDatabase,
  checkUpstreamAPIs,
} from '../services/health-check.js';

export const healthRouter = Router();

const APP_VERSION = '1.0.0';

/**
 * 健康检查端点
 * GET /api/health
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB',
    },
  };

  res.json(successResponse(healthData));
});

/**
 * 详细健康检查 (包含服务依赖)
 * GET /api/health/detailed
 */
healthRouter.get('/detailed', async (_req: Request, res: Response) => {
  try {
    const healthCheck = await performSystemHealthCheck(APP_VERSION);

    const statusCode = healthCheck.status === 'healthy' ? 200 :
                       healthCheck.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(successResponse(healthCheck));
  } catch (error) {
    res.status(503).json(successResponse({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      environment: env.NODE_ENV,
      uptime: process.uptime(),
      error: error instanceof Error ? error.message : '健康检查失败',
    }));
  }
});

/**
 * 就绪检查 (用于 K8s)
 * GET /api/health/ready
 *
 * 检查应用是否准备好接收流量
 * 所有关键依赖必须可用
 */
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  try {
    const database = await checkDatabase();

    const isReady = database.status === 'ok';

    if (isReady) {
      res.json(successResponse({
        ready: true,
        checks: { database },
      }));
    } else {
      res.status(503).json(successResponse({
        ready: false,
        checks: { database },
      }));
    }
  } catch (error) {
    res.status(503).json(successResponse({
      ready: false,
      error: error instanceof Error ? error.message : '就绪检查失败',
    }));
  }
});

/**
 * 存活检查 (用于 K8s)
 * GET /api/health/live
 *
 * 检查应用进程是否存活
 * 这是一个轻量级的检查，不依赖外部服务
 */
healthRouter.get('/live', (_req: Request, res: Response) => {
  res.json(successResponse({ alive: true }));
});

/**
 * 数据库健康检查
 * GET /api/health/database
 */
healthRouter.get('/database', async (_req: Request, res: Response) => {
  try {
    const result = await checkDatabase();

    if (result.status === 'ok') {
      res.json(successResponse(result));
    } else {
      res.status(503).json(successResponse(result));
    }
  } catch (error) {
    res.status(503).json(successResponse({
      status: 'error',
      message: error instanceof Error ? error.message : '数据库检查失败',
    }));
  }
});

/**
 * 上游 API 健康检查
 * GET /api/health/upstream
 */
healthRouter.get('/upstream', async (_req: Request, res: Response) => {
  try {
    const results = await checkUpstreamAPIs();

    const allHealthy = Object.values(results).every(r => r.status === 'ok');

    if (allHealthy) {
      res.json(successResponse(results));
    } else {
      res.status(503).json(successResponse(results));
    }
  } catch (error) {
    res.status(503).json(successResponse({
      error: error instanceof Error ? error.message : '上游 API 检查失败',
    }));
  }
});
