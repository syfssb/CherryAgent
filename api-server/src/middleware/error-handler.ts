import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { errorResponse, ErrorCodes } from '../utils/response.js';
import { env } from '../utils/env.js';

/**
 * 全局错误处理中间件
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  void _next;
  const requestId = req.headers['x-request-id'] as string | undefined;

  // 记录错误日志
  console.error(`[${new Date().toISOString()}] Error:`, {
    requestId,
    method: req.method,
    path: req.path,
    error: {
      name: error.name,
      message: error.message,
      stack: env.NODE_ENV === 'development' ? error.stack : undefined,
    },
  });

  // 处理自定义应用错误
  if (error instanceof AppError) {
    res.status(error.statusCode).json(
      errorResponse(
        error.code,
        error.message,
        env.NODE_ENV === 'development' ? error.details : undefined,
        requestId
      )
    );
    return;
  }

  // 处理 Zod 验证错误
  if (error instanceof ZodError) {
    const details = error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
    }));

    res.status(400).json(
      errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        '输入验证失败',
        details,
        requestId
      )
    );
    return;
  }

  // 处理 JSON 解析错误
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json(
      errorResponse(
        ErrorCodes.INVALID_INPUT,
        '无效的 JSON 格式',
        undefined,
        requestId
      )
    );
    return;
  }

  // PostgreSQL 连接耗尽（53300: too_many_connections）
  const pgError = error as Error & { code?: string };
  if (
    pgError.code === '53300'
    || /too many clients/i.test(pgError.message)
    || /too many connections/i.test(pgError.message)
  ) {
    res.status(503).json(
      errorResponse(
        ErrorCodes.DATABASE_ERROR,
        '数据库连接繁忙，请稍后重试',
        env.NODE_ENV === 'development'
          ? {
              code: pgError.code,
              message: pgError.message,
            }
          : undefined,
        requestId
      )
    );
    return;
  }

  // 处理未知错误 — 生产环境不泄露内部信息
  const isProduction = env.NODE_ENV !== 'development';
  res.status(500).json(
    errorResponse(
      ErrorCodes.INTERNAL_ERROR,
      isProduction ? '服务器内部错误' : error.message,
      isProduction ? undefined : { stack: error.stack },
      requestId
    )
  );
}
