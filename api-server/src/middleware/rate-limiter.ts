import type { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../utils/errors.js';
import { env } from '../utils/env.js';

/**
 * 简单的内存速率限制器
 * 生产环境建议使用 Redis 实现
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // 每分钟清理一次

/**
 * 获取客户端标识符
 */
function getClientIdentifier(req: Request): string {
  // 优先使用 API Key
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey) {
    return `apikey:${apiKey}`;
  }

  // 其次使用用户 ID (如果已认证)
  const userId = (req as Request & { userId?: string }).userId;
  if (userId) {
    return `user:${userId}`;
  }

  // 最后使用 IP 地址
  const ip = req.ip ??
             req.headers['x-forwarded-for'] as string ??
             req.socket.remoteAddress ??
             'unknown';

  return `ip:${ip}`;
}

/**
 * 速率限制中间件
 */
export function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 跳过健康检查
  if (req.path === '/api/health' || req.path === '/') {
    next();
    return;
  }

  const identifier = getClientIdentifier(req);
  const now = Date.now();
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const maxRequests = env.RATE_LIMIT_MAX_REQUESTS;

  let entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetTime < now) {
    // 创建新的时间窗口
    entry = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(identifier, entry);
  } else {
    // 增加计数
    entry.count++;
  }

  // 设置响应头
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetSeconds);

  // 检查是否超限
  if (entry.count > maxRequests) {
    res.setHeader('Retry-After', resetSeconds);

    throw new RateLimitError(
      `请求过于频繁，请在 ${resetSeconds} 秒后重试`,
      {
        limit: maxRequests,
        windowMs,
        retryAfter: resetSeconds,
      }
    );
  }

  next();
}

/**
 * 创建自定义速率限制中间件
 */
export function createRateLimiter(
  maxRequests: number,
  windowMs: number
): (req: Request, res: Response, next: NextFunction) => void {
  const store = new Map<string, RateLimitEntry>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = getClientIdentifier(req);
    const now = Date.now();

    let entry = store.get(identifier);

    if (!entry || entry.resetTime < now) {
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      store.set(identifier, entry);
    } else {
      entry.count++;
    }

    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (entry.count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds);
      throw new RateLimitError(
        `请求过于频繁，请在 ${resetSeconds} 秒后重试`
      );
    }

    next();
  };
}
