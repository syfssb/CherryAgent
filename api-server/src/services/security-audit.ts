import { db } from '../db/index.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import {
  securityAuditLogs,
  ipBlocklist,
} from '../db/schema.js';

/**
 * 安全事件类型
 */
export interface SecurityEvent {
  type: string;
  userId?: string;
  apiKeyId?: string;
  ip: string;
  userAgent?: string;
  path?: string;
  method?: string;
  reason?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 封禁缓存 (内存缓存，生产环境应使用 Redis)
 */
const blockedIpsCache = new Set<string>();

// 定期刷新缓存
setInterval(() => {
  refreshBlocklistCache();
}, 5 * 60 * 1000); // 每5分钟刷新一次

/**
 * 记录安全审计日志
 *
 * @param event - 安全事件
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    await db.insert(securityAuditLogs).values({
      type: event.type,
      userId: event.userId || null,
      apiKeyId: event.apiKeyId || null,
      ip: event.ip,
      userAgent: event.userAgent || null,
      path: event.path || null,
      method: event.method || null,
      reason: event.reason || null,
      latencyMs: event.latencyMs || null,
      metadata: event.metadata || null,
    });
  } catch (error) {
    // 不阻塞主流程，但要记录错误
    console.error('Failed to log security event:', error);
  }
}

/**
 * 检测异常行为模式
 *
 * 异常模式:
 * 1. 短时间内大量认证失败（暴力破解）
 * 2. 异常高频率请求（DDoS/滥用）
 * 3. 访问不存在的端点（扫描行为）
 *
 * @param ip - 请求 IP
 */
export async function detectAnomalies(
  ip: string
): Promise<void> {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // 检测短时间内的认证失败次数
    const recentFailures = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.type, 'auth_failure'),
          eq(securityAuditLogs.ip, ip),
          gte(securityAuditLogs.createdAt, fiveMinutesAgo)
        )
      );

    const failureCount = recentFailures[0]?.count || 0;

    // 如果5分钟内失败超过10次，临时封禁 IP
    if (failureCount >= 10) {
      await blockIp(ip, '短时间内大量认证失败（可能的暴力破解）', 'system', 1);

      await sendSecurityAlert({
        type: 'brute_force_attempt',
        ip,
        failureCount,
      });
    }
  } catch (error) {
    console.error('Failed to detect anomalies:', error);
  }
}

/**
 * 检查 IP 是否被封禁
 *
 * @param ip - IP 地址
 * @returns 是否被封禁
 */
export async function isIpBlocked(ip: string): Promise<boolean> {
  // 先检查缓存
  if (blockedIpsCache.has(ip)) {
    return true;
  }

  try {
    const now = new Date();

    // 查询数据库
    const result = await db
      .select()
      .from(ipBlocklist)
      .where(
        and(
          eq(ipBlocklist.ip, ip),
          sql`(${ipBlocklist.blockedUntil} IS NULL OR ${ipBlocklist.blockedUntil} > ${now})`
        )
      )
      .limit(1);

    const isBlocked = result.length > 0;

    // 更新缓存
    if (isBlocked) {
      blockedIpsCache.add(ip);
    }

    return isBlocked;
  } catch (error) {
    console.error('Failed to check IP blocklist:', error);
    return false;
  }
}

/**
 * 封禁 IP
 *
 * @param ip - IP 地址
 * @param reason - 封禁原因
 * @param blockedBy - 封禁执行者
 * @param hours - 封禁时长（小时），null 表示永久
 */
export async function blockIp(
  ip: string,
  reason: string,
  blockedBy: 'system' | 'admin',
  hours?: number
): Promise<void> {
  try {
    const blockedUntil = hours
      ? new Date(Date.now() + hours * 60 * 60 * 1000)
      : null;

    // 插入或更新封禁记录
    await db
      .insert(ipBlocklist)
      .values({
        ip,
        reason,
        blockedBy,
        blockedUntil,
      })
      .onConflictDoUpdate({
        target: ipBlocklist.ip,
        set: {
          reason,
          blockedBy,
          blockedUntil,
          createdAt: new Date(),
        },
      });

    // 更新缓存
    blockedIpsCache.add(ip);

    // 记录封禁事件
    await logSecurityEvent({
      type: 'ip_blocked',
      ip,
      reason,
      metadata: {
        blockedBy,
        blockedUntil: blockedUntil?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to block IP:', error);
    throw error;
  }
}

/**
 * 解除 IP 封禁
 *
 * @param ip - IP 地址
 */
export async function unblockIp(ip: string): Promise<void> {
  try {
    await db.delete(ipBlocklist).where(eq(ipBlocklist.ip, ip));

    // 清除缓存
    blockedIpsCache.delete(ip);

    // 记录解封事件
    await logSecurityEvent({
      type: 'ip_unblocked',
      ip,
    });
  } catch (error) {
    console.error('Failed to unblock IP:', error);
    throw error;
  }
}

/**
 * 刷新封禁列表缓存
 */
async function refreshBlocklistCache(): Promise<void> {
  try {
    const now = new Date();

    // 刷新 IP 封禁缓存
    const blockedIps = await db
      .select({ ip: ipBlocklist.ip })
      .from(ipBlocklist)
      .where(
        sql`${ipBlocklist.blockedUntil} IS NULL OR ${ipBlocklist.blockedUntil} > ${now}`
      );

    blockedIpsCache.clear();
    for (const { ip } of blockedIps) {
      blockedIpsCache.add(ip);
    }
  } catch (error) {
    console.error('Failed to refresh blocklist cache:', error);
  }
}

/**
 * 发送安全告警通知
 *
 * @param alert - 告警信息
 */
async function sendSecurityAlert(alert: {
  type: string;
  [key: string]: unknown;
}): Promise<void> {
  try {
    // TODO: 实现告警通知
    // - 发送邮件
    // - 发送 Slack/Discord 消息
    // - 发送短信
    // - 调用 Webhook

    console.warn('[SECURITY ALERT]', JSON.stringify(alert, null, 2));

    // 记录告警事件
    await logSecurityEvent({
      type: 'security_alert',
      ip: 'system',
      metadata: alert,
    });
  } catch (error) {
    console.error('Failed to send security alert:', error);
  }
}

/**
 * 获取安全审计统计
 *
 * @param timeRange - 时间范围（小时数）
 * @returns 统计数据
 */
export async function getSecurityStats(timeRange: number = 24): Promise<{
  totalEvents: number;
  authFailures: number;
  rateLimitExceeded: number;
  blockedAttempts: number;
  topFailureIps: Array<{ ip: string; count: number }>;
}> {
  try {
    const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);

    // 总事件数
    const totalEvents = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(securityAuditLogs)
      .where(gte(securityAuditLogs.createdAt, since));

    // 认证失败次数
    const authFailures = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.type, 'auth_failure'),
          gte(securityAuditLogs.createdAt, since)
        )
      );

    // 速率限制超限次数
    const rateLimitExceeded = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.type, 'rate_limit_exceeded'),
          gte(securityAuditLogs.createdAt, since)
        )
      );

    // 封禁访问尝试次数
    const blockedAttempts = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.type, 'blocked_key_attempt'),
          gte(securityAuditLogs.createdAt, since)
        )
      );

    // 认证失败最多的 IP
    const topFailureIps = await db
      .select({
        ip: securityAuditLogs.ip,
        count: sql<number>`count(*)::int`,
      })
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.type, 'auth_failure'),
          gte(securityAuditLogs.createdAt, since)
        )
      )
      .groupBy(securityAuditLogs.ip)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    return {
      totalEvents: totalEvents[0]?.count || 0,
      authFailures: authFailures[0]?.count || 0,
      rateLimitExceeded: rateLimitExceeded[0]?.count || 0,
      blockedAttempts: blockedAttempts[0]?.count || 0,
      topFailureIps: topFailureIps || [],
    };
  } catch (error) {
    console.error('Failed to get security stats:', error);
    return {
      totalEvents: 0,
      authFailures: 0,
      rateLimitExceeded: 0,
      blockedAttempts: 0,
      topFailureIps: [],
    };
  }
}

// 初始化：加载封禁列表到缓存
refreshBlocklistCache();
