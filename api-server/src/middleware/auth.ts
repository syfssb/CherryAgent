import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import { env } from '../utils/env.js';
import type { UserInfo } from '../services/user.js';

/**
 * JWT Payload 类型
 */
export interface JwtPayload {
  sub: string;          // 用户 ID
  email: string;        // 用户邮箱
  role: 'user' | 'admin';
  iat: number;          // 签发时间
  exp: number;          // 过期时间
}

/**
 * 扩展 Request 类型
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      userRole?: 'user' | 'admin';
      user?: UserInfo;
    }
  }
}

/**
 * JWT 认证中间件
 * 验证 Bearer Token
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AuthenticationError('缺少 Authorization 头');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthenticationError('Authorization 格式错误，应为 Bearer <token>');
  }

  const token = parts[1];
  if (!token) {
    throw new AuthenticationError('Token 不能为空');
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      audience: 'cherry-agent:user',
    }) as JwtPayload;

    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.userRole = payload.role;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token 已过期');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('无效的 Token');
    }
    throw error;
  }
}

/**
 * 可选认证中间件
 * Token 存在时验证，不存在时跳过
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    next();
    return;
  }

  try {
    const payload = jwt.verify(parts[1], env.JWT_SECRET, {
      audience: 'cherry-agent:user',
    }) as JwtPayload;
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.userRole = payload.role;
  } catch {
    // 忽略验证错误，继续处理请求
  }

  next();
}

/**
 * 角色授权中间件工厂
 */
export function authorize(...allowedRoles: Array<'user' | 'admin'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.userId || !req.userRole) {
      throw new AuthenticationError('需要先登录');
    }

    if (!allowedRoles.includes(req.userRole)) {
      throw new AuthorizationError(
        `需要 ${allowedRoles.join(' 或 ')} 角色权限`
      );
    }

    next();
  };
}

/**
 * 获取 Refresh Token 签名密钥
 * 优先使用独立的 JWT_REFRESH_SECRET，否则回退到 JWT_SECRET + '_refresh'
 */
function getRefreshSecret(): string {
  return env.JWT_REFRESH_SECRET || `${env.JWT_SECRET}_refresh`;
}

/**
 * 生成 JWT Token
 */
export function generateToken(
  userId: string,
  email: string,
  role: 'user' | 'admin' = 'user'
): { accessToken: string; refreshToken: string; expiresIn: number } {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: userId,
    email,
    role,
  };

  const accessToken = jwt.sign(payload as object, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    audience: 'cherry-agent:user',
  } as jwt.SignOptions);

  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' } as object,
    getRefreshSecret(),
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN, audience: 'cherry-agent:user' } as jwt.SignOptions
  );

  // 解析过期时间
  const decoded = jwt.decode(accessToken) as JwtPayload;
  const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

  return { accessToken, refreshToken, expiresIn };
}

/**
 * 验证 Refresh Token
 * 先用独立密钥验证，失败后回退到旧密钥（向后兼容已签发的 token）
 */
export function verifyRefreshToken(token: string): JwtPayload {
  let payload: JwtPayload & { type?: string };

  try {
    payload = jwt.verify(token, getRefreshSecret(), {
      audience: 'cherry-agent:user',
    }) as JwtPayload & { type?: string };
  } catch {
    // 回退：用旧密钥验证已签发的 refresh token
    try {
      payload = jwt.verify(token, env.JWT_SECRET, {
        audience: 'cherry-agent:user',
      }) as JwtPayload & { type?: string };
    } catch (fallbackError) {
      if (fallbackError instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Refresh Token 已过期');
      }
      throw new AuthenticationError('无效的 Refresh Token');
    }
  }

  if (payload.type !== 'refresh') {
    throw new AuthenticationError('无效的 Refresh Token');
  }

  return payload;
}
