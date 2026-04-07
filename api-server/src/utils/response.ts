/**
 * 标准 API 响应格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
    [key: string]: unknown;
  };
  requestId?: string;
}

/**
 * 创建成功响应
 */
export function successResponse<T>(
  data: T,
  meta?: ApiResponse['meta'],
  requestId?: string
): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

/**
 * 创建错误响应
 */
export function errorResponse(
  code: string,
  message: string,
  details?: unknown,
  requestId?: string
): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    ...(requestId ? { requestId } : {}),
  };
}

/**
 * 分页元数据
 */
export function paginationMeta(
  total: number,
  page: number,
  limit: number
): NonNullable<ApiResponse['meta']> {
  return {
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

/**
 * 错误代码常量
 */
export const ErrorCodes = {
  // 认证错误 (1xxx)
  UNAUTHORIZED: 'AUTH_1001',
  INVALID_TOKEN: 'AUTH_1002',
  TOKEN_EXPIRED: 'AUTH_1003',
  INSUFFICIENT_PERMISSIONS: 'AUTH_1004',

  // 验证错误 (2xxx)
  VALIDATION_ERROR: 'VAL_2001',
  INVALID_INPUT: 'VAL_2002',
  MISSING_FIELD: 'VAL_2003',

  // 资源错误 (3xxx)
  NOT_FOUND: 'RES_3001',
  ALREADY_EXISTS: 'RES_3002',
  CONFLICT: 'RES_3003',

  // 限流错误 (4xxx)
  RATE_LIMITED: 'RATE_4001',
  QUOTA_EXCEEDED: 'RATE_4002',

  // 支付错误 (5xxx)
  PAYMENT_FAILED: 'PAY_5001',
  INSUFFICIENT_BALANCE: 'PAY_5002',
  INVALID_PAYMENT_METHOD: 'PAY_5003',

  // 外部服务错误 (6xxx)
  EXTERNAL_SERVICE_ERROR: 'EXT_6001',
  PROVIDER_ERROR: 'EXT_6002',
  TIMEOUT: 'EXT_6003',

  // 服务器错误 (9xxx)
  INTERNAL_ERROR: 'SRV_9001',
  DATABASE_ERROR: 'SRV_9002',
  CONFIGURATION_ERROR: 'SRV_9003',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
