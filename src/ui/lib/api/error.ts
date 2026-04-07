/**
 * API 错误类
 *
 * 统一的 API 错误处理
 */
export class ApiError extends Error {
  constructor(
    /** HTTP 状态码 */
    public status: number,
    /** 错误消息 */
    message: string,
    /** 错误代码 */
    public code?: string,
    /** 额外数据 */
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';

    // 保持原型链
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * 是否为网络错误
   */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /**
   * 是否为认证错误
   */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /**
   * 是否为客户端错误
   */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * 是否为服务端错误
   */
  get isServerError(): boolean {
    return this.status >= 500 && this.status < 600;
  }

  /**
   * 转换为 JSON 对象
   */
  toJSON(): object {
    return {
      name: this.name,
      status: this.status,
      message: this.message,
      code: this.code,
      data: this.data,
    };
  }
}
