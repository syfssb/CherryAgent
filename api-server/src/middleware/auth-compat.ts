/**
 * 认证兼容层中间件
 *
 * 支持 JWT Token 认证，确保与主流 AI SDK 兼容
 *
 * 支持的认证方式:
 * 1. Authorization: Bearer <jwt-token>
 * 2. x-api-key: <jwt-token> (Anthropic SDK 标准头)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../utils/env.js';

/**
 * 从请求中提取认证凭据
 */
function extractCredentials(req: Request): { type: string; credential: string } | null {
  // 1. 优先检查 x-api-key 头 (Anthropic SDK 标准)
  const xApiKey = req.headers['x-api-key'] as string;
  if (xApiKey) {
    return { type: 'x-api-key', credential: xApiKey };
  }

  // 2. 检查 Authorization 头
  const authHeader = req.headers.authorization as string;
  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch) {
      return { type: 'bearer', credential: bearerMatch[1] ?? '' };
    }
    return { type: 'bearer', credential: authHeader };
  }

  return null;
}

/**
 * 验证 JWT Token
 */
function validateJwtToken(token: string): { userId: string; isValid: boolean } {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { sub?: string; userId?: string };
    const userId = decoded.sub ?? decoded.userId ?? '';
    if (!userId) {
      return { userId: '', isValid: false };
    }
    return { userId, isValid: true };
  } catch {
    return { userId: '', isValid: false };
  }
}

/**
 * 认证中间件 (JWT only)
 */
export async function authCompatMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const credentials = extractCredentials(req);

    if (!credentials) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_1001',
          message: 'Missing authentication credentials. Please provide "Authorization: Bearer <token>" header.',
        }
      });
      return;
    }

    const { credential } = credentials;

    const jwtValidation = validateJwtToken(credential);

    if (jwtValidation.isValid) {
      req.userId = jwtValidation.userId;
      next();
      return;
    }

    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_1002',
        message: 'Invalid authentication credentials.',
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SRV_9001',
        message: 'An error occurred during authentication.',
      }
    });
  }
}

/**
 * 可选的认证中间件 (用于公开 API)
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const credentials = extractCredentials(req);

  if (credentials) {
    return authCompatMiddleware(req, res, next);
  }

  next();
}

export {
  extractCredentials,
  validateJwtToken,
};
