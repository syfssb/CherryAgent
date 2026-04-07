/**
 * 工具函数测试
 * 覆盖 utils 目录下的核心函数
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 导入被测模块
import {
  successResponse,
  errorResponse,
  paginationMeta,
  ErrorCodes,
} from '../utils/response.js';
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  QuotaExceededError,
  PaymentError,
  ExternalServiceError,
  ProviderError,
  TimeoutError,
  DatabaseError,
} from '../utils/errors.js';

describe('响应工具函数测试', () => {
  describe('successResponse', () => {
    it('应该创建基本的成功响应', () => {
      const data = { id: 1, name: 'Test' };
      const response = successResponse(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.meta).toBeUndefined();
      expect(response.requestId).toBeUndefined();
    });

    it('应该包含分页元数据', () => {
      const data = [1, 2, 3];
      const meta = { total: 100, page: 1, limit: 10, hasMore: true };
      const response = successResponse(data, meta);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.meta).toEqual(meta);
    });

    it('应该包含请求 ID', () => {
      const data = 'test';
      const requestId = 'req_123';
      const response = successResponse(data, undefined, requestId);

      expect(response.requestId).toBe(requestId);
    });

    it('应该同时包含 meta 和 requestId', () => {
      const data = { test: true };
      const meta = { total: 50, page: 2, limit: 10, hasMore: true };
      const requestId = 'req_456';
      const response = successResponse(data, meta, requestId);

      expect(response.meta).toEqual(meta);
      expect(response.requestId).toBe(requestId);
    });
  });

  describe('errorResponse', () => {
    it('应该创建基本的错误响应', () => {
      const response = errorResponse('ERR_001', 'Something went wrong');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('ERR_001');
      expect(response.error?.message).toBe('Something went wrong');
      expect(response.error?.details).toBeUndefined();
    });

    it('应该包含错误详情', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const response = errorResponse('VAL_001', 'Validation failed', details);

      expect(response.error?.details).toEqual(details);
    });

    it('应该包含请求 ID', () => {
      const requestId = 'req_789';
      const response = errorResponse('ERR_002', 'Error message', undefined, requestId);

      expect(response.requestId).toBe(requestId);
    });
  });

  describe('paginationMeta', () => {
    it('应该正确计算分页元数据', () => {
      const meta = paginationMeta(100, 1, 10);

      expect(meta.total).toBe(100);
      expect(meta.page).toBe(1);
      expect(meta.limit).toBe(10);
      expect(meta.hasMore).toBe(true);
    });

    it('应该在最后一页返回 hasMore = false', () => {
      const meta = paginationMeta(100, 10, 10);

      expect(meta.hasMore).toBe(false);
    });

    it('应该处理空结果', () => {
      const meta = paginationMeta(0, 1, 10);

      expect(meta.total).toBe(0);
      expect(meta.hasMore).toBe(false);
    });

    it('应该处理部分填充的最后一页', () => {
      const meta = paginationMeta(25, 3, 10);

      expect(meta.hasMore).toBe(false);
    });

    it('应该处理大的 limit 值', () => {
      const meta = paginationMeta(5, 1, 100);

      expect(meta.hasMore).toBe(false);
    });
  });

  describe('ErrorCodes', () => {
    it('应该包含所有必需的错误代码', () => {
      expect(ErrorCodes.UNAUTHORIZED).toBeDefined();
      expect(ErrorCodes.VALIDATION_ERROR).toBeDefined();
      expect(ErrorCodes.NOT_FOUND).toBeDefined();
      expect(ErrorCodes.RATE_LIMITED).toBeDefined();
      expect(ErrorCodes.QUOTA_EXCEEDED).toBeDefined();
      expect(ErrorCodes.PAYMENT_FAILED).toBeDefined();
      expect(ErrorCodes.EXTERNAL_SERVICE_ERROR).toBeDefined();
      expect(ErrorCodes.INTERNAL_ERROR).toBeDefined();
    });

    it('错误代码应该有正确的格式', () => {
      // 认证错误
      expect(ErrorCodes.UNAUTHORIZED).toBe('AUTH_1001');
      expect(ErrorCodes.INVALID_TOKEN).toBe('AUTH_1002');

      // 验证错误
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VAL_2001');

      // 资源错误
      expect(ErrorCodes.NOT_FOUND).toBe('RES_3001');

      // 限流错误
      expect(ErrorCodes.RATE_LIMITED).toBe('RATE_4001');

      // 支付错误
      expect(ErrorCodes.PAYMENT_FAILED).toBe('PAY_5001');
    });
  });
});

describe('错误类测试', () => {
  describe('AppError 基类', () => {
    it('应该创建基本的应用错误', () => {
      const error = new AppError('Test error', ErrorCodes.INTERNAL_ERROR, 500);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('应该包含错误详情', () => {
      const details = { reason: 'test' };
      const error = new AppError('Error', ErrorCodes.INTERNAL_ERROR, 500, details);

      expect(error.details).toEqual(details);
    });

    it('应该默认状态码为 500', () => {
      const error = new AppError('Error', ErrorCodes.INTERNAL_ERROR);

      expect(error.statusCode).toBe(500);
    });
  });

  describe('AuthenticationError', () => {
    it('应该创建认证错误', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('认证失败');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ErrorCodes.UNAUTHORIZED);
      expect(error.name).toBe('AuthenticationError');
    });

    it('应该支持自定义消息', () => {
      const error = new AuthenticationError('Token 已过期');

      expect(error.message).toBe('Token 已过期');
    });
  });

  describe('AuthorizationError', () => {
    it('应该创建授权错误', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('权限不足');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(ErrorCodes.INSUFFICIENT_PERMISSIONS);
      expect(error.name).toBe('AuthorizationError');
    });
  });

  describe('ValidationError', () => {
    it('应该创建验证错误', () => {
      const error = new ValidationError();

      expect(error.message).toBe('输入验证失败');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.name).toBe('ValidationError');
    });

    it('应该包含验证详情', () => {
      const details = { field: 'email', errors: ['无效的邮箱格式'] };
      const error = new ValidationError('验证失败', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('NotFoundError', () => {
    it('应该创建资源未找到错误', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('资源不存在');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ErrorCodes.NOT_FOUND);
      expect(error.name).toBe('NotFoundError');
    });

    it('应该支持自定义资源名称', () => {
      const error = new NotFoundError('用户');

      expect(error.message).toBe('用户不存在');
    });
  });

  describe('ConflictError', () => {
    it('应该创建冲突错误', () => {
      const error = new ConflictError();

      expect(error.message).toBe('资源冲突');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe(ErrorCodes.CONFLICT);
      expect(error.name).toBe('ConflictError');
    });
  });

  describe('RateLimitError', () => {
    it('应该创建速率限制错误', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('请求过于频繁，请稍后再试');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe(ErrorCodes.RATE_LIMITED);
      expect(error.name).toBe('RateLimitError');
    });
  });

  describe('QuotaExceededError', () => {
    it('应该创建配额超限错误', () => {
      const error = new QuotaExceededError();

      expect(error.message).toBe('配额已用尽');
      expect(error.statusCode).toBe(402);
      expect(error.code).toBe(ErrorCodes.QUOTA_EXCEEDED);
      expect(error.name).toBe('QuotaExceededError');
    });
  });

  describe('PaymentError', () => {
    it('应该创建支付错误', () => {
      const error = new PaymentError();

      expect(error.message).toBe('支付失败');
      expect(error.statusCode).toBe(402);
      expect(error.code).toBe(ErrorCodes.PAYMENT_FAILED);
      expect(error.name).toBe('PaymentError');
    });
  });

  describe('ExternalServiceError', () => {
    it('应该创建外部服务错误', () => {
      const error = new ExternalServiceError('Stripe', '服务暂时不可用');

      expect(error.message).toBe('Stripe: 服务暂时不可用');
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe(ErrorCodes.EXTERNAL_SERVICE_ERROR);
      expect(error.name).toBe('ExternalServiceError');
    });

    it('应该支持自定义状态码', () => {
      const error = new ExternalServiceError('OpenAI', 'upstream overloaded', undefined, 503);

      expect(error.message).toBe('OpenAI: upstream overloaded');
      expect(error.statusCode).toBe(503);
    });

    it('应该使用默认消息', () => {
      const error = new ExternalServiceError('OpenAI');

      expect(error.message).toBe('OpenAI: 服务暂时不可用');
    });
  });

  describe('ProviderError', () => {
    it('应该创建 Provider 业务错误', () => {
      const error = new ProviderError('当前模型暂无可用渠道，请切换模型或稍后再试。', 409);

      expect(error.message).toBe('当前模型暂无可用渠道，请切换模型或稍后再试。');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe(ErrorCodes.PROVIDER_ERROR);
      expect(error.name).toBe('ProviderError');
    });
  });

  describe('TimeoutError', () => {
    it('应该创建超时错误', () => {
      const error = new TimeoutError();

      expect(error.message).toBe('请求超时');
      expect(error.statusCode).toBe(504);
      expect(error.code).toBe(ErrorCodes.TIMEOUT);
      expect(error.name).toBe('TimeoutError');
    });
  });

  describe('DatabaseError', () => {
    it('应该创建数据库错误', () => {
      const error = new DatabaseError();

      expect(error.message).toBe('数据库操作失败');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCodes.DATABASE_ERROR);
      expect(error.name).toBe('DatabaseError');
    });
  });
});

describe('错误继承关系测试', () => {
  it('所有自定义错误应该是 AppError 的实例', () => {
    const errors = [
      new AuthenticationError(),
      new AuthorizationError(),
      new ValidationError(),
      new NotFoundError(),
      new ConflictError(),
      new RateLimitError(),
      new QuotaExceededError(),
      new PaymentError(),
      new ExternalServiceError('test'),
      new TimeoutError(),
      new DatabaseError(),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('所有错误应该有堆栈跟踪', () => {
    const error = new AuthenticationError();

    expect(error.stack).toBeDefined();
  });
});
