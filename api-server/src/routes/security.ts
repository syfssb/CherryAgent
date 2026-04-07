import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse } from '../utils/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getSecurityStats,
  blockIp,
  unblockIp,
  logSecurityEvent,
} from '../services/security-audit.js';
import { db } from '../db/index.js';
import {
  securityAuditLogs,
  ipBlocklist,
} from '../db/schema.js';
import { eq, desc, gte, and, sql } from 'drizzle-orm';

export const securityRouter = Router();

/**
 * 获取安全审计统计
 * GET /api/security/stats
 */
securityRouter.get(
  '/stats',
  authenticate,
  authorize('admin'),
  validateQuery(z.object({
    timeRange: z.coerce.number().int().min(1).max(168).optional().default(24), // 1-168 小时
  })),
  async (req: Request, res: Response) => {
    const { timeRange } = req.query as { timeRange?: number };
    const stats = await getSecurityStats(timeRange || 24);
    res.json(successResponse(stats));
  }
);

/**
 * 获取安全审计日志列表
 * GET /api/security/logs
 */
securityRouter.get(
  '/logs',
  authenticate,
  authorize('admin'),
  validateQuery(z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    type: z.string().optional(),
    ip: z.string().optional(),
    userId: z.string().uuid().optional(),
    apiKeyId: z.string().uuid().optional(),
    since: z.coerce.date().optional(),
  })),
  async (req: Request, res: Response) => {
    const { page = 1, limit = 50, type, ip, userId, apiKeyId, since } = req.query as {
      page?: number;
      limit?: number;
      type?: string;
      ip?: string;
      userId?: string;
      apiKeyId?: string;
      since?: Date;
    };

    const offset = (page - 1) * limit;

    // 构建查询条件
    const conditions = [];
    if (type) conditions.push(eq(securityAuditLogs.type, type));
    if (ip) conditions.push(eq(securityAuditLogs.ip, ip));
    if (userId) conditions.push(eq(securityAuditLogs.userId, userId));
    if (apiKeyId) conditions.push(eq(securityAuditLogs.apiKeyId, apiKeyId));
    if (since) conditions.push(gte(securityAuditLogs.createdAt, since));

    // 查询日志
    const logs = await db
      .select()
      .from(securityAuditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(securityAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // 查询总数
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(securityAuditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = totalResult[0]?.count || 0;

    res.json(successResponse({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }));
  }
);

/**
 * 封禁 IP
 * POST /api/security/block-ip
 */
securityRouter.post(
  '/block-ip',
  authenticate,
  authorize('admin'),
  validateBody(z.object({
    ip: z.string().ip(),
    reason: z.string().min(1).max(500),
    hours: z.number().int().min(1).max(8760).optional(),
  })),
  async (req: Request, res: Response) => {
    const { ip, reason, hours } = req.body;

    await blockIp(ip, reason, 'admin', hours);

    // 记录管理员操作
    await logSecurityEvent({
      type: 'admin_block_ip',
      userId: req.userId,
      ip: req.ip || 'unknown',
      metadata: {
        blockedIp: ip,
        reason,
        hours,
      },
    });

    res.json(successResponse({
      message: '已成功封禁 IP',
      ip,
      blockedUntil: hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : null,
    }));
  }
);

/**
 * 解除 IP 封禁
 * POST /api/security/unblock-ip
 */
securityRouter.post(
  '/unblock-ip',
  authenticate,
  authorize('admin'),
  validateBody(z.object({
    ip: z.string().ip(),
  })),
  async (req: Request, res: Response) => {
    const { ip } = req.body;

    await unblockIp(ip);

    // 记录管理员操作
    await logSecurityEvent({
      type: 'admin_unblock_ip',
      userId: req.userId,
      ip: req.ip || 'unknown',
      metadata: { unblockedIp: ip },
    });

    res.json(successResponse({
      message: '已成功解除 IP 封禁',
      ip,
    }));
  }
);

/**
 * 获取 IP 封禁列表
 * GET /api/security/blocked-ips
 */
securityRouter.get(
  '/blocked-ips',
  authenticate,
  authorize('admin'),
  validateQuery(z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  })),
  async (req: Request, res: Response) => {
    const { page = 1, limit = 50 } = req.query as { page?: number; limit?: number };
    const offset = (page - 1) * limit;

    const now = new Date();

    // 查询未过期的封禁记录
    const blockedIps = await db
      .select()
      .from(ipBlocklist)
      .where(
        sql`${ipBlocklist.blockedUntil} IS NULL OR ${ipBlocklist.blockedUntil} > ${now}`
      )
      .orderBy(desc(ipBlocklist.createdAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ipBlocklist)
      .where(
        sql`${ipBlocklist.blockedUntil} IS NULL OR ${ipBlocklist.blockedUntil} > ${now}`
      );

    const total = totalResult[0]?.count || 0;

    res.json(successResponse({
      blockedIps,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }));
  }
);
