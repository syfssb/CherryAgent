import type { RequestConfig } from './types';
import { ApiError } from './error';

/**
 * 请求拦截器类型
 */
export type RequestInterceptor = (
  url: string,
  config: RequestConfig
) => Promise<{ url: string; config: RequestConfig }> | { url: string; config: RequestConfig };

/**
 * 响应拦截器类型
 */
export type ResponseInterceptor = <T>(
  response: Response,
  data: T
) => Promise<T> | T;

/**
 * 错误拦截器类型
 */
export type ErrorInterceptor = (error: ApiError) => Promise<ApiError> | ApiError;

/**
 * 拦截器管理器
 *
 * 管理请求、响应和错误拦截器
 */
export class InterceptorManager {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  /**
   * 添加请求拦截器
   */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    // 返回移除函数
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.requestInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * 添加响应拦截器
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.responseInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * 添加错误拦截器
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.errorInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * 执行请求拦截器
   */
  async runRequestInterceptors(
    url: string,
    config: RequestConfig
  ): Promise<{ url: string; config: RequestConfig }> {
    let result = { url, config };

    for (const interceptor of this.requestInterceptors) {
      result = await interceptor(result.url, result.config);
    }

    return result;
  }

  /**
   * 执行响应拦截器
   */
  async runResponseInterceptors<T>(response: Response, data: T): Promise<T> {
    let result = data;

    for (const interceptor of this.responseInterceptors) {
      result = await interceptor(response, result);
    }

    return result;
  }

  /**
   * 执行错误拦截器
   */
  async runErrorInterceptors(error: ApiError): Promise<ApiError> {
    let result = error;

    for (const interceptor of this.errorInterceptors) {
      result = await interceptor(result);
    }

    return result;
  }

  /**
   * 清除所有拦截器
   */
  clear(): void {
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.errorInterceptors = [];
  }
}
