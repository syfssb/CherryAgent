import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/index.js';

// ==========================================
// 类型定义
// ==========================================

/**
 * 操作类型
 */
export type AdminAction =
  // 认证操作
  | 'admin.login'
  | 'admin.logout'
  | 'admin.password_change'
  | 'admin.create'
  | 'admin.update'
  | 'admin.delete'
  | 'admin.reset_password'
  // 用户管理
  | 'user.view'
  | 'user.update'
  | 'user.suspend'
  | 'user.unsuspend'
  | 'user.balance_adjust'
  // 财务管理
  | 'finance.view_recharges'
  | 'finance.view_usage'
  | 'finance.view_revenue'
  | 'finance.export'
  // 渠道管理
  | 'channel.view'
  | 'channel.create'
  | 'channel.update'
  | 'channel.delete'
  // 模型管理
  | 'model.view'
  | 'model.create'
  | 'model.update'
  | 'model.delete'
  // 充值套餐管理
  | 'package.create'
  | 'package.update'
  | 'package.delete'
  // 期卡管理
  | 'period_card_plan.create'
  | 'period_card_plan.update'
  | 'period_card_plan.delete'
  | 'period_card.cancel'
  | 'period_card.grant'
  | 'period_card.extend'
  // 用户密码重置
  | 'user.reset_password'
  | 'user.delete'
  // 版本管理
  | 'version.view'
  | 'version.create'
  | 'version.update'
  | 'version.publish'
  // 配置管理
  | 'config.view'
  | 'config.update';

/**
 * 目标类型
 */
export type TargetType =
  | 'user'
  | 'admin'
  | 'channel'
  | 'model'
  | 'version'
  | 'config'
  | 'finance'
  | 'system'
  | 'credit_package'
  | 'period_card_plan'
  | 'user_period_card';

/**
 * 日志详情
 */
export interface AdminLogDetails {
  action: AdminAction;
  targetType?: TargetType;
  targetId?: string;
  description?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

/**
 * 日志记录
 */
export interface AdminLogRecord {
  id: string;
  adminId: string;
  action: AdminAction;
  targetType: TargetType | null;
  targetId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// ==========================================
// 日志服务
// ==========================================

/**
 * 记录管理员操作日志
 */
export async function logAdminAction(
  adminId: string,
  details: AdminLogDetails,
  req?: Request
): Promise<void> {
  const ipAddress = req
    ? (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      null
    : null;

  const userAgent = req ? req.headers['user-agent'] || null : null;

  try {
    await pool.query(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7)`,
      [
        adminId,
        details.action,
        details.targetType || null,
        details.targetId || null,
        JSON.stringify({
          description: details.description,
          before: details.before,
          after: details.after,
          extra: details.extra,
        }),
        ipAddress,
        userAgent,
      ]
    );
  } catch (error) {
    // 日志记录失败不应影响主流程
    console.error('[AdminLogger] 记录操作日志失败:', error);
  }
}

/**
 * 查询管理员操作日志
 */
export async function getAdminLogs(options: {
  adminId?: string;
  action?: AdminAction;
  targetType?: TargetType;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}): Promise<{ logs: AdminLogRecord[]; total: number }> {
  const {
    adminId,
    action,
    targetType,
    targetId,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  } = options;

  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (adminId) {
    conditions.push(`admin_id = $${paramIndex++}`);
    params.push(adminId);
  }

  if (action) {
    conditions.push(`action = $${paramIndex++}`);
    params.push(action);
  }

  if (targetType) {
    conditions.push(`target_type = $${paramIndex++}`);
    params.push(targetType);
  }

  if (targetId) {
    conditions.push(`target_id = $${paramIndex++}`);
    params.push(targetId);
  }

  if (startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 查询日志
  const logsResult = await pool.query(
    `SELECT id, admin_id, action, target_type, target_id, details, ip_address, user_agent, created_at
     FROM admin_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset]
  );

  // 查询总数
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM admin_logs ${whereClause}`,
    params
  );

  const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

  const logs = (logsResult.rows || []).map((row: unknown) => {
    const r = row as {
      id: string;
      admin_id: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      details: Record<string, unknown>;
      ip_address: string | null;
      user_agent: string | null;
      created_at: Date;
    };
    return {
      id: r.id,
      adminId: r.admin_id,
      action: r.action as AdminAction,
      targetType: r.target_type as TargetType | null,
      targetId: r.target_id,
      details: r.details,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      createdAt: r.created_at,
    };
  });

  return { logs, total };
}

// ==========================================
// 中间件
// ==========================================

/**
 * 创建操作日志记录中间件
 * 在响应完成后自动记录操作日志
 */
export function withAdminLog(
  action: AdminAction,
  getDetails?: (req: Request, res: Response) => Partial<AdminLogDetails>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 保存原始的 json 方法
    const originalJson = res.json.bind(res);

    // 重写 json 方法以在响应后记录日志
    res.json = function (body: unknown) {
      // 只有成功的响应才记录日志
      if (res.statusCode >= 200 && res.statusCode < 300 && req.adminId) {
        const extraDetails = getDetails ? getDetails(req, res) : {};

        logAdminAction(
          req.adminId,
          {
            action,
            ...extraDetails,
          },
          req
        ).catch((err) => {
          console.error('[AdminLogger] 记录日志失败:', err);
        });
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * 自动记录敏感操作的中间件
 * 适用于需要记录请求和响应数据的场景
 */
export function auditLog(
  action: AdminAction,
  targetType: TargetType,
  options?: {
    getTargetId?: (req: Request) => string | undefined;
    getDescription?: (req: Request) => string | undefined;
    captureRequestBody?: boolean;
    captureResponseBody?: boolean;
  }
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestBody = options?.captureRequestBody ? { ...req.body } : undefined;

    // 移除敏感字段
    if (requestBody) {
      delete requestBody.password;
      delete requestBody.newPassword;
      delete requestBody.currentPassword;
      delete requestBody.confirmPassword;
      delete requestBody.passwordHash;
      delete requestBody.apiKey;
      delete requestBody.secret;
    }

    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.adminId) {
        const targetId = options?.getTargetId?.(req) || req.params.id;
        const description = options?.getDescription?.(req);

        const details: AdminLogDetails = {
          action,
          targetType,
          targetId,
          description,
        };

        if (requestBody) {
          details.before = requestBody;
        }

        if (options?.captureResponseBody && body) {
          const responseData = body as { data?: unknown };
          details.after = responseData.data as Record<string, unknown> | undefined;
        }

        logAdminAction(req.adminId, details, req).catch((err) => {
          console.error('[AdminLogger] 记录审计日志失败:', err);
        });
      }

      return originalJson(body);
    };

    next();
  };
}

// ==========================================
// 导出
// ==========================================

export const adminLogger = {
  logAction: logAdminAction,
  getLogs: getAdminLogs,
};

export default adminLogger;
