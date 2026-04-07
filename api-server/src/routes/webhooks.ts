import { Router, type Request, type Response } from 'express';
import type Stripe from 'stripe';
import { successResponse } from '../utils/response.js';
import { env } from '../utils/env.js';
import { ValidationError } from '../utils/errors.js';
import { stripeService } from '../services/stripe.js';
import { xunhupayService } from '../services/xunhupay.js';
import type { CallbackParams as XunhupayCallbackParams } from '../services/xunhupay.js';

export const webhooksRouter = Router();

/**
 * Stripe Webhook
 * POST /api/webhooks/stripe
 *
 * 重要: 这个路由需要原始的 request body，
 * 在 app.ts 中已经配置了 express.raw() 中间件
 */
webhooksRouter.post(
  '/stripe',
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;

    if (!sig) {
      throw new ValidationError('缺少 Stripe 签名');
    }

    let event: Stripe.Event;

    try {
      // 使用服务的异步方法验证签名（从数据库读取 webhook secret）
      event = await stripeService.constructWebhookEvent(req.body, sig);
    } catch (error) {
      console.error('Stripe webhook 签名验证失败:', error);
      throw new ValidationError('Webhook 签名验证失败');
    }

    console.log(`[Stripe Webhook] 收到事件: ${event.type}, ID: ${event.id}`);

    try {
      await stripeService.handleWebhook(event, sig);
    } catch (error) {
      console.error(`[Stripe Webhook] 处理事件失败: ${event.type}`, error);
      // 返回 5xx，让 Stripe 在 3 天内自动重试，避免用户付款后丢单
      res.status(500).json({ error: 'processing_failed' });
      return;
    }

    res.json(successResponse({ received: true }));
  }
);

/**
 * 迅虎支付 Webhook
 * POST /api/webhooks/xunhupay
 *
 * 迅虎支付使用 form 格式回调
 */
webhooksRouter.post(
  '/xunhupay',
  async (req: Request, res: Response) => {
    // 解析请求体
    // 迅虎支付可能使用 application/x-www-form-urlencoded 或 JSON
    let body: Record<string, unknown>;

    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch {
        // 尝试解析为 URL 编码
        body = Object.fromEntries(new URLSearchParams(req.body));
      }
    } else if (Buffer.isBuffer(req.body)) {
      const bodyStr = req.body.toString('utf-8');
      try {
        body = JSON.parse(bodyStr);
      } catch {
        body = Object.fromEntries(new URLSearchParams(bodyStr));
      }
    } else {
      body = req.body;
    }

    // 统一转换为 string，避免 number/boolean 影响签名拼接
    const normalizedBody: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'string') {
        normalizedBody[key] = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        normalizedBody[key] = String(value);
      } else {
        normalizedBody[key] = JSON.stringify(value);
      }
    }

    const tradeOrderId = normalizedBody.trade_order_id; // 商户订单号
    const totalFee = normalizedBody.total_fee;          // 支付金额（元）
    const status = normalizedBody.status;               // 订单状态: OD(已支付) 等
    const hash = normalizedBody.hash;                   // 签名

    // 验证必要参数
    if (!tradeOrderId || !totalFee || !status || !hash) {
      console.error('[迅虎支付] 回调缺少必要参数', normalizedBody);
      throw new ValidationError('回调参数不完整');
    }

    console.log(`[迅虎支付 Webhook] 收到回调: 订单 ${tradeOrderId}, 状态 ${status}`);

    try {
      // 处理回调：必须传递完整参数（签名覆盖全部非空字段）
      await xunhupayService.handleCallback(normalizedBody as XunhupayCallbackParams);
    } catch (error) {
      // 记录错误，但对于签名验证失败需要返回错误
      console.error(`[迅虎支付 Webhook] 处理回调失败`, error);

      if (error instanceof ValidationError) {
        throw error;
      }
      // 非业务校验错误返回 5xx，让迅虎在约 24 小时内自动重试
      res.status(500).send('fail');
      return;
    }

    // 迅虎支付要求返回 "success" 字符串
    res.send('success');
  }
);

/**
 * 通用支付成功回调 (仅用于开发测试)
 * POST /api/webhooks/payment-success
 */
webhooksRouter.post(
  '/payment-success',
  async (req: Request, res: Response) => {
    if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
      throw new ValidationError('此端点仅在开发环境可用');
    }

    let body: Record<string, unknown>;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if (Buffer.isBuffer(req.body)) {
      body = JSON.parse(req.body.toString('utf-8'));
    } else {
      body = req.body;
    }

    const { orderId, amount, userId, type } = body;

    console.log(`[测试] 模拟支付成功: 订单 ${orderId}, 金额 ${amount}, 用户 ${userId}, 类型 ${type}`);

    // 在开发环境中可以手动触发充值
    if (type === 'recharge' && userId && typeof amount === 'number') {
      const { billingService } = await import('../services/billing.js');
      await billingService.rechargeCredits(
        userId as string,
        amount * 10, // 默认 1 元 = 10 积分
        0,
        (orderId as string) ?? `test_${Date.now()}`,
        `测试充值 ¥${amount.toFixed(2)}`
      );
    }

    res.json(successResponse({ message: '支付回调处理成功' }));
  }
);

/**
 * Webhook 健康检查
 * GET /api/webhooks/health
 */
webhooksRouter.get(
  '/health',
  async (_req: Request, res: Response) => {
    res.json(successResponse({
      status: 'ok',
      endpoints: {
        stripe: '/api/webhooks/stripe',
        xunhupay: '/api/webhooks/xunhupay',
      },
    }));
  }
);
