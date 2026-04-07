import type { Request, Response } from 'express';
import { errorResponse, ErrorCodes } from '../utils/response.js';

/**
 * 404 路由未找到处理中间件
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = req.headers['x-request-id'] as string | undefined;

  res.status(404).json(
    errorResponse(
      ErrorCodes.NOT_FOUND,
      `路由 ${req.method} ${req.path} 不存在`,
      {
        method: req.method,
        path: req.path,
        availableEndpoints: [
          'GET  /api/health',
          'POST /api/auth/login',
          'POST /api/auth/register',
          'POST /api/proxy/messages',
          'POST /api/proxy/v1/messages',
          'POST /api/proxy/chat/completions',
          'GET  /api/usage',
        ],
      },
      requestId
    )
  );
}
