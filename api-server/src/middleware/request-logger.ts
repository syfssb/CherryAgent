import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * 扩展 Request 类型
 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

/**
 * 请求日志中间件
 * 添加请求 ID 并记录请求/响应信息
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 生成或使用已有的请求 ID
  const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  req.requestId = requestId;
  req.startTime = Date.now();

  // 设置响应头
  res.setHeader('X-Request-ID', requestId);

  // 记录响应完成
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const logData = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.headers['user-agent'],
      ip: req.ip ?? req.headers['x-forwarded-for'],
    };

    // 根据状态码选择日志级别
    if (res.statusCode >= 500) {
      console.error('[ERROR]', JSON.stringify(logData));
    } else if (res.statusCode >= 400) {
      console.warn('[WARN]', JSON.stringify(logData));
    } else {
      console.info('[INFO]', JSON.stringify(logData));
    }
  });

  next();
}
