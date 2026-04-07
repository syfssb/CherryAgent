import { apiClient } from './api-client';
import { getCurrentLanguage } from '@/ui/i18n/config';

/**
 * 系统配置 key 类型
 */
export type ConfigKey =
  | 'privacy_policy'
  | 'terms_of_service'
  | 'about_us'
  | 'contact_email'
  | 'welcome_credits';

/**
 * 配置值响应
 */
export interface ConfigValueResponse {
  content: string;
}

/**
 * 公告类型
 */
export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'important' | 'critical' | 'maintenance' | 'promotion';
  isPinned: boolean;
  pinnedAt: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
}

/**
 * 公告列表响应
 */
export interface AnnouncementsResponse {
  announcements: Announcement[];
}

/**
 * 模型定价信息
 */
export interface ModelPricing {
  inputCreditsPerMtok: number;
  outputCreditsPerMtok: number;
  cacheReadCreditsPerMtok: number;
  cacheWriteCreditsPerMtok: number;
}

/**
 * 模型限制信息
 */
export interface ModelLimits {
  maxTokens: number;
  maxContextLength: number;
}

/**
 * 公开模型信息
 */
export interface PublicModel {
  id: string;
  displayName: string;
  provider: string;
  pricing: ModelPricing;
  limits: ModelLimits;
  description: string | null;
  features: string[];
  useCases: string[];
}

/**
 * 模型列表响应
 */
export interface ModelsResponse {
  models: PublicModel[];
  unit: string;
  note: string;
}

/**
 * 充值套餐
 */
export interface CreditPackage {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  priceCents: number;
  priceYuan: string;
  currency: string;
  bonusCredits: number;
  totalCredits: number;
}

/**
 * 配置 API 服务
 * 调用公开 API 获取系统配置、公告、模型列表等
 */
export const configApi = {
  /**
   * 获取系统配置值
   * @param key - 配置 key（使用 URL 路径格式，如 privacy-policy）
   * @param lang - 语言代码（可选，默认 'en'）
   */
  async getConfig(key: string, lang: string = 'en'): Promise<string> {
    try {
      const response = await apiClient.get<ConfigValueResponse>(
        `/configs/${key}?lang=${lang}`,
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        return '';
      }

      return response.data.content;
    } catch {
      return '';
    }
  },

  /**
   * 获取隐私政策
   */
  async getPrivacyPolicy(): Promise<string> {
    return this.getConfig('privacy-policy');
  },

  /**
   * 获取服务条款
   */
  async getTermsOfService(): Promise<string> {
    return this.getConfig('terms-of-service');
  },

  /**
   * 获取关于我们
   */
  async getAboutUs(): Promise<string> {
    return this.getConfig('about-us');
  },

  /**
   * 获取公告列表
   */
  async getAnnouncements(): Promise<Announcement[]> {
    try {
      const lang = getCurrentLanguage();
      const response = await apiClient.get<AnnouncementsResponse>(
        `/announcements?lang=${lang}`,
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        return [];
      }

      return response.data.announcements;
    } catch {
      return [];
    }
  },

  /**
   * 获取可用模型列表
   */
  async getModels(): Promise<ModelsResponse | null> {
    try {
      const response = await apiClient.get<ModelsResponse>(
        '/models',
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        return null;
      }

      return response.data;
    } catch {
      return null;
    }
  },

  /**
   * 获取充值套餐列表
   */
  async getPackages(): Promise<CreditPackage[]> {
    try {
      const response = await apiClient.get<CreditPackage[]>(
        '/billing/packages',
        { requireAuth: true }
      );

      if (!response.success || !response.data) {
        return [];
      }

      return response.data;
    } catch {
      return [];
    }
  },
};
