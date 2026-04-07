import { ErrorCodes, type ErrorCode } from './response.js';

/**
 * 自定义应用错误基类
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = 500,
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 认证错误
 */
export class AuthenticationError extends AppError {
  constructor(message: string = '认证失败', details?: unknown) {
    super(message, ErrorCodes.UNAUTHORIZED, 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * 授权错误
 */
export class AuthorizationError extends AppError {
  constructor(message: string = '权限不足', details?: unknown) {
    super(message, ErrorCodes.INSUFFICIENT_PERMISSIONS, 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * 验证错误
 */
export class ValidationError extends AppError {
  constructor(message: string = '输入验证失败', details?: unknown) {
    super(message, ErrorCodes.VALIDATION_ERROR, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * 资源未找到错误
 */
export class NotFoundError extends AppError {
  constructor(resource: string = '资源', details?: unknown) {
    super(`${resource}不存在`, ErrorCodes.NOT_FOUND, 404, details);
    this.name = 'NotFoundError';
  }
}

/**
 * 资源冲突错误
 */
export class ConflictError extends AppError {
  constructor(message: string = '资源冲突', details?: unknown) {
    super(message, ErrorCodes.CONFLICT, 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * 速率限制错误
 */
export class RateLimitError extends AppError {
  constructor(message: string = '请求过于频繁，请稍后再试', details?: unknown) {
    super(message, ErrorCodes.RATE_LIMITED, 429, details);
    this.name = 'RateLimitError';
  }
}

/**
 * 配额超限错误
 */
export class QuotaExceededError extends AppError {
  constructor(message: string = '配额已用尽', details?: unknown) {
    super(message, ErrorCodes.QUOTA_EXCEEDED, 402, details);
    this.name = 'QuotaExceededError';
  }
}

/**
 * 支付错误
 */
export class PaymentError extends AppError {
  constructor(message: string = '支付失败', details?: unknown) {
    super(message, ErrorCodes.PAYMENT_FAILED, 402, details);
    this.name = 'PaymentError';
  }
}

/**
 * 外部服务错误
 */
export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string = '服务暂时不可用',
    details?: unknown,
    statusCode: number = 502
  ) {
    super(`${service}: ${message}`, ErrorCodes.EXTERNAL_SERVICE_ERROR, statusCode, details);
    this.name = 'ExternalServiceError';
  }
}

/**
 * Provider 业务错误
 */
export class ProviderError extends AppError {
  constructor(message: string = 'Provider 请求失败', statusCode: number = 409, details?: unknown) {
    super(message, ErrorCodes.PROVIDER_ERROR, statusCode, details);
    this.name = 'ProviderError';
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends AppError {
  constructor(message: string = '请求超时', details?: unknown) {
    super(message, ErrorCodes.TIMEOUT, 504, details);
    this.name = 'TimeoutError';
  }
}

/**
 * 数据库错误
 */
export class DatabaseError extends AppError {
  constructor(message: string = '数据库操作失败', details?: unknown) {
    super(message, ErrorCodes.DATABASE_ERROR, 500, details);
    this.name = 'DatabaseError';
  }
}
