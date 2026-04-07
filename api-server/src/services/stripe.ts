import Stripe from 'stripe';
import { eq, sql } from 'drizzle-orm';
import { env } from '../utils/env.js';
import { PaymentError, NotFoundError, ValidationError } from '../utils/errors.js';
import { db } from '../db/index.js';
import { payments, users } from '../db/schema.js';
import { billingService } from './billing.js';
import { paymentConfigService } from './payment-config.js';
import { getTodayDateCST } from './period-card.js';
import { emailService } from './email.js';

/**
 * Stripe 客户端缓存
 * 当数据库配置变更时需要重新创建
 */
let stripeClient: Stripe | null = null;
let lastStripeKey = '';

/**
 * 获取 Stripe 客户端实例
 * 优先从数据库读取配置，回退到环境变量
 */
async function getStripeClient(): Promise<Stripe> {
  const dbConfig = await paymentConfigService.getStripeConfig();
  const secretKey = dbConfig.secretKey || env.STRIPE_SECRET_KEY || '';

  if (!secretKey) {
    throw new PaymentError('Stripe Secret Key 未配置');
  }

  if (stripeClient && lastStripeKey === secretKey) {
    return stripeClient;
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: '2024-06-20',
    typescript: true,
  });
  lastStripeKey = secretKey;

  return stripeClient;
}

/**
 * 获取 Stripe Webhook Secret
 * 优先从数据库读取，回退到环境变量
 */
async function getWebhookSecret(): Promise<string> {
  const dbConfig = await paymentConfigService.getStripeConfig();
  return dbConfig.webhookSecret || env.STRIPE_WEBHOOK_SECRET || '';
}

/**
 * 支付状态类型
 */
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'expired' | 'needs_review';

/**
 * Checkout Session 结果
 */
export interface CheckoutSessionResult {
  sessionId: string;
  checkoutUrl: string;
  orderId: string;
}

/**
 * 支付状态查询结果
 */
export interface PaymentStatusResult {
  orderId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paidAt: Date | null;
  metadata?: Record<string, unknown>;
}

/**
 * Stripe 服务
 */
export const stripeService = {
  /**
   * 创建客户
   */
  async createCustomer(email: string, metadata?: Record<string, string>) {
    const stripe = await getStripeClient();
    try {
      const customer = await stripe.customers.create({
        email,
        metadata,
      });
      return customer;
    } catch (error) {
      throw new PaymentError(
        `创建 Stripe 客户失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 获取或创建 Stripe 客户
   */
  async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    const stripe = await getStripeClient();

    const userResult = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      throw new NotFoundError('用户');
    }

    const existingCustomerId = userResult[0]!.stripeCustomerId;

    if (existingCustomerId) {
      try {
        await stripe.customers.retrieve(existingCustomerId);
        return existingCustomerId;
      } catch {
        // 客户不存在，继续创建新客户
      }
    }

    const customer = await this.createCustomer(email, { userId });

    await db
      .update(users)
      .set({
        stripeCustomerId: customer.id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return customer.id;
  },

  /**
   * 创建一次性充值的 Checkout Session
   */
  async createRechargeCheckoutSession(
    userId: string,
    amountCents: number,
    currency?: string
  ): Promise<CheckoutSessionResult> {
    const stripe = await getStripeClient();

    // 优先使用后台配置货币，其次使用请求货币（兼容旧客户端）
    const dbConfig = await paymentConfigService.getStripeConfig();
    const actualCurrency = (dbConfig.currency || currency || 'cny').toLowerCase();

    if (amountCents < 100) {
      throw new ValidationError('充值金额至少为 1.00');
    }

    if (amountCents > 1000000) {
      throw new ValidationError('单次充值金额不能超过 10,000.00');
    }

    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      throw new NotFoundError('用户');
    }

    const user = userResult[0]!;
    const customerId = await this.getOrCreateCustomer(userId, user.email);

    const amountDisplay = amountCents / 100;
    const paymentRecord = await db
      .insert(payments)
      .values({
        userId,
        amount: amountDisplay.toFixed(2),
        currency: actualCurrency.toUpperCase(),
        status: 'pending',
        paymentMethod: 'stripe',
        description: `Stripe 充值 ${amountDisplay.toFixed(2)} ${actualCurrency.toUpperCase()}`,
        metadata: { type: 'recharge' },
      })
      .returning();

    if (paymentRecord.length === 0) {
      throw new PaymentError('创建支付记录失败');
    }

    const orderId = paymentRecord[0]!.id;

    try {
      const successCallbackBase = new URL('/api/billing/recharge/success', env.API_BASE_URL).toString();
      const cancelCallbackUrl = new URL('/api/billing/recharge/cancel', env.API_BASE_URL).toString();

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: actualCurrency.toLowerCase(),
              product_data: {
                name: 'API 余额充值',
                description: `充值 ${amountDisplay.toFixed(2)} ${actualCurrency.toUpperCase()} 到您的账户余额`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${successCallbackBase}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelCallbackUrl,
        metadata: {
          userId,
          orderId,
          type: 'recharge',
          amount: amountDisplay.toString(),
        },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });

      await db
        .update(payments)
        .set({
          stripePaymentIntentId: session.id,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, orderId));

      return {
        sessionId: session.id,
        checkoutUrl: session.url ?? '',
        orderId,
      };
    } catch (error) {
      await db
        .update(payments)
        .set({
          status: 'failed',
          metadata: {
            type: 'recharge',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          updatedAt: new Date(),
        })
        .where(eq(payments.id, orderId));

      throw new PaymentError(
        `创建 Checkout Session 失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 创建期卡购买的 Checkout Session
   */
  async createPeriodCardCheckoutSession(
    userId: string,
    planId: string,
    planName: string,
    priceCents: number,
    currency: string = 'cny',
    planSnapshot?: {
      quota_mode: string;
      daily_credits: string;
      total_credits: string;
      period_days: string;
    }
  ): Promise<CheckoutSessionResult> {
    const stripe = await getStripeClient();

    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      throw new NotFoundError('用户');
    }

    const user = userResult[0]!;
    const customerId = await this.getOrCreateCustomer(userId, user.email);

    const amountDisplay = priceCents / 100;
    const paymentRecord = await db
      .insert(payments)
      .values({
        userId,
        amount: amountDisplay.toFixed(2),
        currency: currency.toUpperCase(),
        status: 'pending',
        paymentMethod: 'stripe',
        description: `Stripe 期卡购买: ${planName} ¥${amountDisplay.toFixed(2)}`,
        metadata: { type: 'period_card_purchase', periodCardPlanId: planId, userId },
      })
      .returning();

    if (paymentRecord.length === 0) {
      throw new PaymentError('创建支付记录失败');
    }

    const orderId = paymentRecord[0]!.id;

    try {
      const successCallbackBase = new URL('/api/billing/recharge/success', env.API_BASE_URL).toString();
      const cancelCallbackUrl = new URL('/api/billing/recharge/cancel', env.API_BASE_URL).toString();

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: `期卡套餐: ${planName}`,
                description: `购买 ${planName} 期卡套餐`,
              },
              unit_amount: priceCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${successCallbackBase}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelCallbackUrl,
        metadata: {
          userId,
          orderId,
          type: 'period_card_purchase',
          periodCardPlanId: planId,
          amount: amountDisplay.toString(),
          ...(planSnapshot && {
            quota_mode: planSnapshot.quota_mode,
            daily_credits: planSnapshot.daily_credits,
            total_credits: planSnapshot.total_credits,
            period_days: planSnapshot.period_days,
          }),
        },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });

      await db
        .update(payments)
        .set({
          stripePaymentIntentId: session.id,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, orderId));

      return {
        sessionId: session.id,
        checkoutUrl: session.url ?? '',
        orderId,
      };
    } catch (error) {
      await db
        .update(payments)
        .set({
          status: 'failed',
          metadata: {
            type: 'period_card_purchase',
            periodCardPlanId: planId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          updatedAt: new Date(),
        })
        .where(eq(payments.id, orderId));

      throw new PaymentError(
        `创建期卡 Checkout Session 失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 创建订阅的 Checkout Session
   */
  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }) {
    const stripe = await getStripeClient();
    try {
      const session = await stripe.checkout.sessions.create({
        customer: params.customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: params.priceId,
            quantity: 1,
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      });
      return session;
    } catch (error) {
      throw new PaymentError(
        `创建 Checkout Session 失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 获取 Checkout Session 状态
   */
  async getCheckoutSessionStatus(sessionId: string): Promise<PaymentStatusResult> {
    const stripe = await getStripeClient();
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const paymentResult = await db
        .select()
        .from(payments)
        .where(eq(payments.stripePaymentIntentId, sessionId))
        .limit(1);

      let orderId = '';
      if (paymentResult.length > 0) {
        orderId = paymentResult[0]!.id;
      }

      let status: PaymentStatus = 'pending';
      if (session.payment_status === 'paid') {
        status = 'succeeded';
      } else if (session.status === 'expired') {
        status = 'expired';
      } else if (session.payment_status === 'unpaid' && session.status === 'complete') {
        status = 'failed';
      }

      return {
        orderId,
        status,
        amount: (session.amount_total ?? 0) / 100,
        currency: session.currency?.toUpperCase() ?? 'USD',
        paidAt: session.payment_status === 'paid' ? new Date() : null,
        metadata: session.metadata as Record<string, unknown>,
      };
    } catch (error) {
      throw new PaymentError(
        `获取支付状态失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 获取本地订单状态
   */
  async getOrderStatus(orderId: string): Promise<PaymentStatusResult> {
    const paymentResult = await db
      .select()
      .from(payments)
      .where(eq(payments.id, orderId))
      .limit(1);

    if (paymentResult.length === 0) {
      throw new NotFoundError('订单');
    }

    const payment = paymentResult[0]!;

    return {
      orderId: payment.id,
      status: payment.status as PaymentStatus,
      amount: parseFloat(payment.amount),
      currency: payment.currency,
      paidAt: payment.paidAt,
      metadata: payment.metadata as Record<string, unknown>,
    };
  },

  /**
   * 处理 Stripe Webhook 事件（带幂等性保证）
   */
  async handleWebhook(event: Stripe.Event, signature: string): Promise<void> {
    const { webhookService } = await import('./webhook.js');

    console.log(`[Stripe Webhook] 收到事件: ${event.type}, ID: ${event.id}`);

    const result = await webhookService.processWebhook(
      {
        provider: 'stripe',
        eventId: event.id,
        eventType: event.type,
        rawPayload: event,
        signature,
        signatureVerified: true,
      },
      async () => {
        await this.processStripeEvent(event);
      }
    );

    if (result.isDuplicate) {
      console.log(
        `[Stripe Webhook] 重复事件，状态: ${result.record.status}, ID: ${event.id}`
      );
    }
  },

  /**
   * 处理 Stripe 事件的业务逻辑
   */
  async processStripeEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutSessionCompleted(session);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutSessionExpired(session);
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[Stripe] PaymentIntent 成功: ${paymentIntent.id}`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[Stripe] PaymentIntent 失败: ${paymentIntent.id}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Stripe] 订阅变更: ${subscription.id}, 状态: ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Stripe] 订阅取消: ${subscription.id}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[Stripe] 发票支付成功: ${invoice.id}, 金额: ${invoice.amount_paid}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[Stripe] 发票支付失败: ${invoice.id}`);
        break;
      }

      default:
        console.log(`[Stripe Webhook] 未处理的事件类型: ${event.type}`);
    }
  },

  /**
   * 处理 Checkout Session 完成
   */
  async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const metadata = session.metadata ?? {};
    const { userId, orderId, type } = metadata;

    if (!userId || !orderId) {
      console.error('[Stripe] Checkout session 缺少必要的 metadata');
      return;
    }

    console.log(`[Stripe] 用户 ${userId} 支付完成，订单 ${orderId}, 类型: ${type}`);

    if (session.payment_status !== 'paid') {
      console.log(`[Stripe] 支付未完成，状态: ${session.payment_status}`);
      return;
    }

    await db.transaction(async (tx) => {
      const paymentResult = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, orderId))
        .limit(1);

      if (paymentResult.length === 0) {
        console.error(`[Stripe] 找不到支付记录: ${orderId}`);
        throw new NotFoundError('支付记录');
      }

      const payment = paymentResult[0]!;

      // 幂等性检查
      if (payment.status === 'succeeded') {
        console.log(`[Stripe] 订单 ${orderId} 已处理，跳过`);
        return;
      }

      // 金额校验：Stripe amount_total 单位是分，payment.amount 单位是元
      const paidAmountCents = session.amount_total ?? 0;
      const expectedAmountCents = Math.round(parseFloat(payment.amount) * 100);
      const paidCurrency = (session.currency ?? '').toUpperCase();
      const expectedCurrency = (payment.currency ?? '').toUpperCase();

      if (paidAmountCents !== expectedAmountCents || paidCurrency !== expectedCurrency) {
        console.error(
          `[Stripe] 金额校验失败: 订单 ${orderId}, ` +
          `期望 ${expectedAmountCents} ${expectedCurrency}, ` +
          `实际 ${paidAmountCents} ${paidCurrency}`
        );
        await tx
          .update(payments)
          .set({
            status: 'needs_review',
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              review_reason: 'amount_mismatch',
              expected_amount_cents: expectedAmountCents,
              expected_currency: expectedCurrency,
              paid_amount_cents: paidAmountCents,
              paid_currency: paidCurrency,
              blocked_at: new Date().toISOString(),
            })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, orderId));
        return; // 不发放积分/不激活期卡
      }

      await tx
        .update(payments)
        .set({
          status: 'succeeded',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, orderId));

      if (type === 'recharge') {
        const amount = parseFloat(payment.amount);
        // 查找对应的套餐信息来获取积分
        const paymentMeta = payment.metadata as { packageCredits?: number; packageBonusCredits?: number } | null;
        const credits = paymentMeta?.packageCredits ?? amount * 10; // 默认 1 元 = 10 积分
        const bonusCredits = paymentMeta?.packageBonusCredits ?? 0;

        await billingService.rechargeCredits(
          userId,
          credits,
          bonusCredits,
          orderId,
          `Stripe 充值 ${amount.toFixed(2)} ${payment.currency}`
        );
        console.log(`[Stripe] 用户 ${userId} 充值成功: ${amount.toFixed(2)} ${payment.currency}, 积分: ${credits + bonusCredits}`);

        // 生成分销佣金（不影响充值主流程）
        try {
          const { generateReferralCommission } = await import('./referral.js');
          await generateReferralCommission(userId, orderId, amount);
        } catch (err) {
          console.error('[Stripe] 生成分销佣金失败:', err);
        }
      }

      if (type === 'period_card_purchase') {
        const { periodCardPlanId } = metadata;
        if (!periodCardPlanId) {
          console.error('[Stripe] 期卡购买缺少 periodCardPlanId');
          return;
        }

        // 查询期卡套餐（不检查 is_enabled，已付款的订单应基于快照入卡）
        const planResult = await tx.execute(
          sql`SELECT id, name, period_type, period_days, daily_credits, price_cents, quota_mode, total_credits
              FROM period_card_plans WHERE id = ${periodCardPlanId}`
        );
        if (planResult.rows.length === 0) {
          console.error(`[Stripe] 期卡套餐不存在或已下架: ${periodCardPlanId}`);
          return;
        }
        const plan = planResult.rows[0] as any;

        // 优先从支付 metadata 读取快照值，fallback 到 DB 查询值
        const quotaMode: string = (metadata.quota_mode as string) ?? plan.quota_mode ?? 'daily';
        const totalCredits: number = metadata.total_credits != null
          ? parseFloat(String(metadata.total_credits))
          : parseFloat(String(plan.total_credits ?? 0));
        const periodDays: number = metadata.period_days != null
          ? parseInt(String(metadata.period_days), 10)
          : plan.period_days;
        const dailyCredits: number = metadata.daily_credits != null
          ? parseFloat(String(metadata.daily_credits))
          : parseFloat(String(plan.daily_credits ?? 0));

        const now = new Date();
        const expiresAt = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

        // INSERT 期卡（ON CONFLICT 防止重复创建）
        let cardInsertResult;
        if (quotaMode === 'total') {
          cardInsertResult = await tx.execute(
            sql`INSERT INTO user_period_cards (user_id, plan_id, payment_id, status, starts_at, expires_at, daily_credits, daily_quota_remaining, quota_reset_date, quota_mode, total_credits, total_remaining)
                VALUES (${userId}, ${periodCardPlanId}, ${orderId}, 'active', ${now}, ${expiresAt}, ${0}, ${0}, ${null}, 'total', ${totalCredits}, ${totalCredits})
                ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING
                RETURNING id`
          );
        } else {
          const quotaResetDate = getTodayDateCST();
          cardInsertResult = await tx.execute(
            sql`INSERT INTO user_period_cards (user_id, plan_id, payment_id, status, starts_at, expires_at, daily_credits, daily_quota_remaining, quota_reset_date)
                VALUES (${userId}, ${periodCardPlanId}, ${orderId}, 'active', ${now}, ${expiresAt}, ${dailyCredits}, ${dailyCredits}, ${quotaResetDate})
                ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING
                RETURNING id`
          );
        }

        const cardCreated = cardInsertResult.rows.length > 0;

        if (cardCreated) {
          console.log(`[Stripe] 用户 ${userId} 期卡激活成功: ${plan.name}, 模式: ${quotaMode}, 每日额度: ${dailyCredits}, 总量: ${totalCredits}`);

          // 发送期卡购买确认邮件（仅新创建时发送）
          try {
            const userResult = await tx.execute(
              sql`SELECT email, name FROM users WHERE id = ${userId}`
            );
            if (userResult.rows.length > 0) {
              const user = userResult.rows[0] as { email: string; name: string | null };
              const startsAt = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
              const expiresAtStr = expiresAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
              await emailService.sendPeriodCardPurchaseEmail(
                user.email,
                user.name ?? user.email.split('@')[0] ?? 'user',
                plan.name,
                startsAt,
                expiresAtStr,
                dailyCredits.toString(),
                quotaMode as 'daily' | 'total',
                totalCredits.toString()
              );
            }
          } catch (err) {
            console.error('[Stripe] 发送期卡购买确认邮件失败:', err);
          }

          // 生成分销佣金（仅新创建时生成）
          try {
            const amount = parseFloat(payment.amount);
            const { generateReferralCommission } = await import('./referral.js');
            await generateReferralCommission(userId, orderId, amount);
          } catch (err) {
            console.error('[Stripe] 生成分销佣金失败:', err);
          }
        } else {
          console.log(`[Stripe] 期卡已存在，跳过重复创建 (payment_id=${orderId})`);
        }
      }

      if (type === 'period_card_upgrade') {
        // 升级功能已冻结，遗留订单标记为 needs_review
        await tx
          .update(payments)
          .set({
            status: 'needs_review',
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              review_reason: 'upgrade_frozen',
              blocked_at: new Date().toISOString(),
            })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, orderId));
        console.warn(`[Stripe] 升级功能已冻结，订单 ${orderId} 标记为 needs_review`);
      }
    });
  },

  /**
   * 处理 Checkout Session 过期
   */
  async handleCheckoutSessionExpired(session: Stripe.Checkout.Session): Promise<void> {
    const orderId = session.metadata?.orderId;

    if (!orderId) {
      return;
    }

    await db
      .update(payments)
      .set({
        status: 'expired' as PaymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, orderId));

    console.log(`[Stripe] 订单 ${orderId} 已过期`);
  },

  /**
   * 创建客户门户 Session
   */
  async createBillingPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getStripeClient();
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return session;
    } catch (error) {
      throw new PaymentError(
        `创建 Billing Portal Session 失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 获取订阅
   */
  async getSubscription(subscriptionId: string) {
    const stripe = await getStripeClient();
    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      throw new PaymentError(
        `获取订阅失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 取消订阅 (在当前周期结束时)
   */
  async cancelSubscription(subscriptionId: string) {
    const stripe = await getStripeClient();
    try {
      return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (error) {
      throw new PaymentError(
        `取消订阅失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 立即取消订阅
   */
  async cancelSubscriptionImmediately(subscriptionId: string) {
    const stripe = await getStripeClient();
    try {
      return await stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      throw new PaymentError(
        `取消订阅失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 恢复订阅
   */
  async resumeSubscription(subscriptionId: string) {
    const stripe = await getStripeClient();
    try {
      return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
    } catch (error) {
      throw new PaymentError(
        `恢复订阅失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 获取发票列表
   */
  async getInvoices(customerId: string, limit: number = 10) {
    const stripe = await getStripeClient();
    try {
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit,
      });
      return invoices.data;
    } catch (error) {
      throw new PaymentError(
        `获取发票列表失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * 构造 Webhook 事件
   */
  async constructWebhookEvent(rawBody: string | Buffer, signature: string): Promise<Stripe.Event> {
    const stripe = await getStripeClient();
    const webhookSecret = await getWebhookSecret();

    if (!webhookSecret) {
      throw new PaymentError('Stripe Webhook Secret 未配置');
    }

    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  },
};
