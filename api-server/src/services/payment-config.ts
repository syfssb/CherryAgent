import { pool } from '../db/index.js';
import { maskSensitive } from '../utils/crypto.js';

/**
 * 支付配置缓存
 */
interface PaymentConfigCache {
  data: Map<string, string>;
  lastUpdated: number;
}

const CACHE_TTL_MS = 30_000; // 30 秒缓存

let configCache: PaymentConfigCache = {
  data: new Map(),
  lastUpdated: 0,
};

/**
 * 支付配置键前缀
 */
const PAYMENT_CONFIG_KEYS = [
  'stripe_enabled',
  'stripe_publishable_key',
  'stripe_secret_key',
  'stripe_webhook_secret',
  'stripe_currency',
  'xunhupay_enabled',
  'xunhupay_appid',
  'xunhupay_appsecret',
  'xunhupay_wechat_appid',
  'xunhupay_wechat_appsecret',
  'xunhupay_alipay_appid',
  'xunhupay_alipay_appsecret',
  'xunhupay_api_url',
  'xunhupay_notify_url',
  'payment_methods',
] as const;

type PaymentConfigKey = typeof PAYMENT_CONFIG_KEYS[number];

/**
 * Stripe 配置
 */
export interface StripeConfig {
  enabled: boolean;
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  currency: string;
}

/**
 * 虎皮椒单通道配置
 */
export interface XunhupayChannelConfig {
  appid: string;
  appsecret: string;
}

/**
 * 虎皮椒配置（微信/支付宝双通道）
 */
export interface XunhupayConfig {
  enabled: boolean;
  wechat: XunhupayChannelConfig;
  alipay: XunhupayChannelConfig;
  apiUrl: string;
  notifyUrl: string;
}

/**
 * 可用支付方式
 */
export interface PaymentMethodInfo {
  id: string;
  name: string;
  type: 'stripe' | 'xunhupay';
  subTypes?: string[];
}

/**
 * 支付配置服务
 */
export const paymentConfigService = {
  /**
   * 从数据库加载所有支付配置
   * 带缓存，避免频繁查询
   */
  async loadConfig(): Promise<Map<string, string>> {
    const now = Date.now();
    if (
      configCache.data.size > 0 &&
      now - configCache.lastUpdated < CACHE_TTL_MS
    ) {
      return configCache.data;
    }

    const result = await pool.query(
      `SELECT key, value FROM system_configs WHERE key = ANY($1)`,
      [PAYMENT_CONFIG_KEYS]
    );

    const newCache = new Map<string, string>();
    for (const row of result.rows as Array<{ key: string; value: string }>) {
      newCache.set(row.key, row.value);
    }

    configCache = { data: newCache, lastUpdated: now };
    return newCache;
  },

  /**
   * 清除配置缓存
   */
  clearCache(): void {
    configCache = { data: new Map(), lastUpdated: 0 };
  },

  /**
   * 获取单个配置值
   */
  async getValue(key: PaymentConfigKey): Promise<string> {
    const config = await this.loadConfig();
    return config.get(key) ?? '';
  },

  /**
   * 获取 Stripe 配置
   */
  async getStripeConfig(): Promise<StripeConfig> {
    const config = await this.loadConfig();
    return {
      enabled: config.get('stripe_enabled') === 'true',
      publishableKey: config.get('stripe_publishable_key') ?? '',
      secretKey: config.get('stripe_secret_key') ?? '',
      webhookSecret: config.get('stripe_webhook_secret') ?? '',
      currency: config.get('stripe_currency') ?? 'cny',
    };
  },

  /**
   * 获取虎皮椒配置
   */
  async getXunhupayConfig(): Promise<XunhupayConfig> {
    const config = await this.loadConfig();
    // 微信：优先新键，回退旧键（向后兼容）
    const wechatAppid = config.get('xunhupay_wechat_appid') || config.get('xunhupay_appid') || '';
    const wechatAppsecret = config.get('xunhupay_wechat_appsecret') || config.get('xunhupay_appsecret') || '';
    // 支付宝：仅新键
    const alipayAppid = config.get('xunhupay_alipay_appid') || '';
    const alipayAppsecret = config.get('xunhupay_alipay_appsecret') || '';

    return {
      enabled: config.get('xunhupay_enabled') === 'true',
      wechat: { appid: wechatAppid, appsecret: wechatAppsecret },
      alipay: { appid: alipayAppid, appsecret: alipayAppsecret },
      apiUrl: config.get('xunhupay_api_url') ?? 'https://api.xunhupay.com/payment/do.html',
      notifyUrl: config.get('xunhupay_notify_url') ?? '',
    };
  },

  /**
   * 获取可用的支付方式列表
   */
  async getAvailablePaymentMethods(): Promise<PaymentMethodInfo[]> {
    const methods: PaymentMethodInfo[] = [];

    const stripeConfig = await this.getStripeConfig();
    if (stripeConfig.enabled && stripeConfig.secretKey) {
      methods.push({
        id: 'stripe',
        name: 'Stripe',
        type: 'stripe',
        subTypes: ['card'],
      });
    }

    const xunhupayConfig = await this.getXunhupayConfig();
    if (xunhupayConfig.enabled) {
      const subTypes: string[] = [];
      if (xunhupayConfig.wechat.appid && xunhupayConfig.wechat.appsecret) {
        subTypes.push('wechat');
      }
      if (xunhupayConfig.alipay.appid && xunhupayConfig.alipay.appsecret) {
        subTypes.push('alipay');
      }
      if (subTypes.length > 0) {
        methods.push({
          id: 'xunhupay',
          name: '虎皮椒支付',
          type: 'xunhupay',
          subTypes,
        });
      }
    }

    return methods;
  },

  /**
   * 获取所有支付配置（脱敏后，用于管理后台展示）
   */
  async getAllConfigMasked(): Promise<Record<string, string>> {
    const config = await this.loadConfig();
    const masked: Record<string, string> = {};

    const sensitiveKeys = new Set([
      'stripe_secret_key',
      'stripe_webhook_secret',
      'xunhupay_appsecret',
      'xunhupay_wechat_appsecret',
      'xunhupay_alipay_appsecret',
    ]);

    for (const key of PAYMENT_CONFIG_KEYS) {
      const value = config.get(key) ?? '';
      if (sensitiveKeys.has(key) && value.length > 0) {
        masked[key] = maskSensitive(value, 4, 4);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  },

  /**
   * 获取所有支付配置（原始值，仅内部使用）
   */
  async getAllConfigRaw(): Promise<Record<string, string>> {
    const config = await this.loadConfig();
    const raw: Record<string, string> = {};

    for (const key of PAYMENT_CONFIG_KEYS) {
      raw[key] = config.get(key) ?? '';
    }

    return raw;
  },
};
