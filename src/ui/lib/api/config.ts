/**
 * API 环境配置
 *
 * 根据不同环境配置不同的 API 地址
 */

/**
 * 环境类型
 */
export type Environment = 'development' | 'staging' | 'production';

/**
 * 环境配置接口
 */
export interface EnvironmentConfig {
  /** 环境名称 */
  env: Environment;
  /** API 基础 URL */
  apiBaseURL: string;
  /** WebSocket URL */
  wsBaseURL?: string;
  /** 是否启用日志 */
  enableLogging: boolean;
  /** 是否启用缓存 */
  enableCache: boolean;
  /** 默认超时时间（毫秒） */
  timeout: number;
  /** 最大重试次数 */
  maxRetries: number;
}

/**
 * 获取当前环境
 */
function getCurrentEnvironment(): Environment {
  const env = import.meta.env.VITE_ENV || import.meta.env.MODE;

  if (env === 'production') return 'production';
  if (env === 'staging') return 'staging';
  return 'development';
}

/**
 * 开发环境配置
 */
const developmentConfig: EnvironmentConfig = {
  env: 'development',
  apiBaseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  wsBaseURL: import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:3000',
  enableLogging: true,
  enableCache: true,
  timeout: 30000,
  maxRetries: 3,
};

/**
 * 预发布环境配置
 */
const stagingConfig: EnvironmentConfig = {
  env: 'staging',
  apiBaseURL: import.meta.env.VITE_API_BASE_URL || 'https://api-staging.example.com/api',
  wsBaseURL: import.meta.env.VITE_WS_BASE_URL || 'wss://api-staging.example.com',
  enableLogging: true,
  enableCache: true,
  timeout: 30000,
  maxRetries: 3,
};

/**
 * 生产环境配置
 */
const productionConfig: EnvironmentConfig = {
  env: 'production',
  apiBaseURL: import.meta.env.VITE_API_BASE_URL || 'https://api.example.com/api',
  wsBaseURL: import.meta.env.VITE_WS_BASE_URL || 'wss://api.example.com',
  enableLogging: false,
  enableCache: true,
  timeout: 30000,
  maxRetries: 3,
};

/**
 * 获取环境配置
 */
function getEnvironmentConfig(): EnvironmentConfig {
  const env = getCurrentEnvironment();

  switch (env) {
    case 'production':
      return productionConfig;
    case 'staging':
      return stagingConfig;
    case 'development':
    default:
      return developmentConfig;
  }
}

/**
 * 当前环境配置
 */
export const envConfig = getEnvironmentConfig();

/**
 * 辅助函数
 */
export const env = {
  /** 是否为开发环境 */
  isDevelopment: envConfig.env === 'development',
  /** 是否为预发布环境 */
  isStaging: envConfig.env === 'staging',
  /** 是否为生产环境 */
  isProduction: envConfig.env === 'production',
  /** 当前环境名称 */
  current: envConfig.env,
  /** API 基础 URL */
  apiBaseURL: envConfig.apiBaseURL,
  /** WebSocket URL */
  wsBaseURL: envConfig.wsBaseURL,
};

/**
 * 使用示例
 *
 * @example
 * ```ts
 * import { envConfig, env } from '@/ui/lib/api/config';
 *
 * // 检查环境
 * if (env.isDevelopment) {
 *   console.log('Running in development mode');
 * }
 *
 * // 获取 API URL
 * const apiUrl = envConfig.apiBaseURL;
 *
 * // 检查是否启用日志
 * if (envConfig.enableLogging) {
 *   console.log('Logging is enabled');
 * }
 * ```
 */
