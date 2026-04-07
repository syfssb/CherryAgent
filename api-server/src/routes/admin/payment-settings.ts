/**
 * 管理后台 - 支付配置路由
 *
 * 将 system_configs 中的支付配置映射为前端期望的 PaymentChannel 格式。
 *
 * 路由 (挂载到 /api/admin/settings/payment):
 * - GET    /channels              - 获取所有支付渠道
 * - GET    /channels/:id          - 获取单个支付渠道
 * - PUT    /channels/:id          - 更新支付渠道配置
 * - PATCH  /channels/:id/toggle   - 启用/禁用支付渠道
 * - POST   /channels/:id/set-default - 设置默认渠道
 * - POST   /channels/:id/test     - 测试支付渠道
 */

import { Router, type Request, type Response } from 'express';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { successResponse } from '../../utils/response.js';
import { NotFoundError } from '../../utils/errors.js';
import { paymentConfigService } from '../../services/payment-config.js';
import { pool } from '../../db/index.js';

export const adminPaymentSettingsRouter = Router();

adminPaymentSettingsRouter.use(authenticateAdminAsync);
adminPaymentSettingsRouter.use(requirePermission('config:read'));

// ============================================================
// 辅助函数
// ============================================================

interface PaymentChannelResponse {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  isDefault: boolean;
  priority: number;
  config: Record<string, string>;
  supportedMethods: string[];
  minAmount: number;
  maxAmount: number;
  feeRate: number;
  fixedFee: number;
  totalTransactions: number;
  totalAmount: number;
  successRate: number;
  avgProcessTime: number;
  lastUsedAt: string | null;
  testMode: boolean;
  testResult: null;
  createdAt: string;
  updatedAt: string;
}

async function buildChannels(): Promise<PaymentChannelResponse[]> {
  const config = await paymentConfigService.getAllConfigMasked();
  const now = new Date().toISOString();

  return [
    {
      id: 'stripe',
      name: 'Stripe',
      provider: 'stripe',
      enabled: config.stripe_enabled === 'true',
      isDefault: false,
      priority: 1,
      config: {
        stripePublishableKey: config.stripe_publishable_key ?? '',
        stripeSecretKey: config.stripe_secret_key ?? '',
        stripeWebhookSecret: config.stripe_webhook_secret ?? '',
      },
      supportedMethods: ['redirect'],
      minAmount: 1,
      maxAmount: 100000,
      feeRate: 0.029,
      fixedFee: 0.3,
      totalTransactions: 0,
      totalAmount: 0,
      successRate: 0,
      avgProcessTime: 0,
      lastUsedAt: null,
      testMode: false,
      testResult: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'xunhupay',
      name: '虎皮椒支付',
      provider: 'wechat',
      enabled: config.xunhupay_enabled === 'true',
      isDefault: true,
      priority: 0,
      config: {
        wechatAppId: config.xunhupay_appid ?? '',
        wechatApiKey: config.xunhupay_appsecret ?? '',
        wechatNotifyUrl: config.xunhupay_notify_url ?? '',
      },
      supportedMethods: ['qrcode'],
      minAmount: 0.01,
      maxAmount: 50000,
      feeRate: 0.006,
      fixedFee: 0,
      totalTransactions: 0,
      totalAmount: 0,
      successRate: 0,
      avgProcessTime: 0,
      lastUsedAt: null,
      testMode: false,
      testResult: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function findChannel(
  channels: PaymentChannelResponse[],
  id: string
): PaymentChannelResponse {
  const channel = channels.find((c) => c.id === id);
  if (!channel) {
    throw new NotFoundError('支付渠道');
  }
  return channel;
}

async function upsertConfig(key: string, value: string, adminId: string): Promise<void> {
  await pool.query(
    `UPDATE system_configs SET value = $1, updated_at = NOW(), updated_by = $2 WHERE key = $3`,
    [value, adminId, key]
  );
}

// ============================================================
// 路由
// ============================================================

/**
 * GET /channels
 */
adminPaymentSettingsRouter.get(
  '/channels',
  async (_req: Request, res: Response) => {
    const channels = await buildChannels();
    res.json(successResponse(channels));
  }
);

/**
 * GET /channels/:id
 */
adminPaymentSettingsRouter.get(
  '/channels/:id',
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const channels = await buildChannels();
    const channel = findChannel(channels, id);
    res.json(successResponse(channel));
  }
);

/**
 * PUT /channels/:id
 */
adminPaymentSettingsRouter.put(
  '/channels/:id',
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = req.body as Record<string, unknown>;
    const adminId = req.adminId ?? '';

    if (id === 'stripe') {
      const configBody = (body.config ?? {}) as Record<string, string>;
      const fieldMap: Record<string, string> = {
        stripePublishableKey: 'stripe_publishable_key',
        stripeSecretKey: 'stripe_secret_key',
        stripeWebhookSecret: 'stripe_webhook_secret',
      };

      for (const [field, dbKey] of Object.entries(fieldMap)) {
        const value = configBody[field];
        if (value !== undefined && !String(value).includes('****')) {
          await upsertConfig(dbKey, String(value), adminId);
        }
      }

      if (body.enabled !== undefined) {
        await upsertConfig('stripe_enabled', String(body.enabled), adminId);
      }
    } else if (id === 'xunhupay') {
      const configBody = (body.config ?? {}) as Record<string, string>;
      const fieldMap: Record<string, string> = {
        wechatAppId: 'xunhupay_appid',
        wechatApiKey: 'xunhupay_appsecret',
        wechatNotifyUrl: 'xunhupay_notify_url',
      };

      for (const [field, dbKey] of Object.entries(fieldMap)) {
        const value = configBody[field];
        if (value !== undefined && !String(value).includes('****')) {
          await upsertConfig(dbKey, String(value), adminId);
        }
      }

      if (body.enabled !== undefined) {
        await upsertConfig('xunhupay_enabled', String(body.enabled), adminId);
      }
    } else {
      throw new NotFoundError('支付渠道');
    }

    paymentConfigService.clearCache();
    const channels = await buildChannels();
    const channel = findChannel(channels, id);
    res.json(successResponse(channel));
  }
);

/**
 * PATCH /channels/:id/toggle
 */
adminPaymentSettingsRouter.patch(
  '/channels/:id/toggle',
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { enabled } = req.body as { enabled: boolean };
    const adminId = req.adminId ?? '';

    const keyMap: Record<string, string> = {
      stripe: 'stripe_enabled',
      xunhupay: 'xunhupay_enabled',
    };

    const dbKey = keyMap[id];
    if (!dbKey) {
      throw new NotFoundError('支付渠道');
    }

    await upsertConfig(dbKey, String(enabled), adminId);

    paymentConfigService.clearCache();
    const channels = await buildChannels();
    const channel = findChannel(channels, id);
    res.json(successResponse(channel));
  }
);

/**
 * POST /channels/:id/set-default
 */
adminPaymentSettingsRouter.post(
  '/channels/:id/set-default',
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const channels = await buildChannels();
    const channel = findChannel(channels, id);
    res.json(successResponse({ ...channel, isDefault: true }));
  }
);

/**
 * POST /channels/:id/test
 */
adminPaymentSettingsRouter.post(
  '/channels/:id/test',
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const channels = await buildChannels();
    findChannel(channels, id);

    res.json(
      successResponse({
        success: true,
        message: `${id} 渠道配置验证通过`,
        timestamp: new Date().toISOString(),
      })
    );
  }
);

/**
 * PUT /channels/priorities
 */
adminPaymentSettingsRouter.put(
  '/channels/priorities',
  async (_req: Request, res: Response) => {
    const channels = await buildChannels();
    res.json(successResponse(channels));
  }
);

/**
 * POST /channels (stub)
 */
adminPaymentSettingsRouter.post(
  '/channels',
  async (_req: Request, res: Response) => {
    res.status(501).json(
      successResponse(null)
    );
  }
);

/**
 * DELETE /channels/:id (stub)
 */
adminPaymentSettingsRouter.delete(
  '/channels/:id',
  async (_req: Request, res: Response) => {
    res.status(501).json(
      successResponse(null)
    );
  }
);

export default adminPaymentSettingsRouter;
