import { eq, sql } from 'drizzle-orm';
import { env } from '../utils/env.js';
import { md5Hash, generateSecureToken } from '../utils/crypto.js';
import { PaymentError, ExternalServiceError, NotFoundError, ValidationError } from '../utils/errors.js';
import { db } from '../db/index.js';
import { payments, users } from '../db/schema.js';
import { billingService } from './billing.js';
import { paymentConfigService } from './payment-config.js';
import { getTodayDateCST } from './period-card.js';
import { emailService } from './email.js';

/**
 * 清理订单标题，移除 emoji 和不支持的字符
 * 虎皮椒要求：不能有表情符号和 %，不超过 42 个汉字
 */
function sanitizeTitle(title: string): string {
  // 移除 emoji 表情符号（包括各种 Unicode 范围）
  let cleaned = title.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F910}-\u{1F96B}]|[\u{1F980}-\u{1F9E0}]/gu, '');

  // 移除 % 符号
  cleaned = cleaned.replace(/%/g, '');

  // 移除中文括号，替换为英文括号
  cleaned = cleaned.replace(/（/g, '(').replace(/）/g, ')');

  // 移除其他可能有问题的特殊字符
  cleaned = cleaned.replace(/[🎉🎊🎁🎈🎀🎆🎇✨]/g, '');

  // 限制长度为 42 个汉字
  return cleaned.substring(0, 42).trim();
}

/**
 * 迅虎支付配置接口
 */
interface XunhupayConfigData {
  appid: string;
  appsecret: string;
  gatewayUrl: string;
  notifyUrl?: string;
}

/**
 * 支付请求参数
 */
interface CreateOrderParams {
  orderId: string;
  amount: number;
  title: string;
  type: 'wechat' | 'alipay';
  plugins?: Record<string, unknown>;
  returnUrl?: string;
}

/**
 * 迅虎支付响应
 */
interface XunhupayResponse {
  errcode: number;
  errmsg: string;
  url?: string;
  url_qrcode?: string;
  hash?: string;
}

/**
 * 支付回调参数
 */
export interface CallbackParams {
  trade_order_id: string;
  total_fee: string;
  transaction_id?: string;
  open_order_id?: string;
  open_id?: string;
  order_title?: string;
  status: string;
  hash: string;
  plugins?: string;
  [key: string]: string | undefined;
}

/**
 * 订单创建结果
 */
export interface XunhupayOrderResult {
  orderId: string;
  payUrl: string;
  qrcodeUrl?: string;
}

/**
 * 订单状态
 */
export type XunhupayOrderStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'needs_review';

/**
 * 订单状态查询结果
 */
export interface XunhupayOrderStatusResult {
  orderId: string;
  status: XunhupayOrderStatus;
  transactionId?: string;
  paidAt?: Date;
}

/**
 * 获取迅虎支付配置（按支付类型）
 * 优先从数据库读取，回退到环境变量
 */
async function getConfigByType(type: 'wechat' | 'alipay'): Promise<XunhupayConfigData> {
  const dbConfig = await paymentConfigService.getXunhupayConfig();
  const channelConfig = type === 'wechat' ? dbConfig.wechat : dbConfig.alipay;

  return {
    appid: channelConfig.appid || env.XUNHUPAY_APPID || '',
    appsecret: channelConfig.appsecret || env.XUNHUPAY_APPSECRET || '',
    gatewayUrl: dbConfig.apiUrl || env.XUNHUPAY_GATEWAY_URL || 'https://api.xunhupay.com/payment/do.html',
    notifyUrl: dbConfig.notifyUrl || env.XUNHUPAY_NOTIFY_URL,
  };
}

/**
 * 生成签名
 */
export function generateSign(params: Record<string, string | number>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();

  const signStr = sortedKeys
    .filter(key => params[key] !== '' && params[key] !== undefined)
    .map(key => `${key}=${params[key]}`)
    .join('&');

  return md5Hash(signStr + secret);
}

/**
 * 验证签名
 */
export function verifySign(params: Record<string, string>, secret: string): boolean {
  const { hash, ...restParams } = params;

  if (!hash) {
    return false;
  }

  const expectedHash = generateSign(restParams, secret);
  return hash === expectedHash;
}

/**
 * 迅虎支付服务
 */
export const xunhupayService = {
  /**
   * 创建充值订单
   */
  async createRechargeOrder(
    userId: string,
    amountCents: number,
    paymentType: 'wechat' | 'alipay' = 'wechat',
    returnUrl?: string,
    options?: {
      orderType?: string;
      extraMetadata?: Record<string, unknown>;
      description?: string;
    }
  ): Promise<XunhupayOrderResult> {
    if (amountCents < 100) {
      throw new ValidationError('充值金额至少为 1.00 元');
    }

    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      throw new NotFoundError('用户');
    }

    const orderId = `xh_${Date.now()}_${generateSecureToken(8)}`;

    const amountCny = amountCents / 100;

    const paymentRecord = await db
      .insert(payments)
      .values({
        userId,
        amount: amountCny.toFixed(2),
        currency: 'CNY',
        status: 'pending',
        paymentMethod: 'xunhupay',
        xunhupayOrderId: orderId,
        description: options?.description ?? `虎皮椒充值 ¥${amountCny.toFixed(2)}`,
        metadata: {
          type: options?.orderType ?? 'recharge',
          paymentType,
          amountCny: amountCny.toFixed(2),
          ...options?.extraMetadata,
        },
      })
      .returning();

    if (paymentRecord.length === 0) {
      throw new PaymentError('创建支付记录失败');
    }

    const localOrderId = paymentRecord[0]!.id;

    try {
      const result = await this.createOrder({
        orderId,
        amount: amountCny,
        title: options?.description ?? 'API 余额充值',
        type: paymentType,
        plugins: {
          userId,
          localOrderId,
        },
        returnUrl,
      });

      return {
        orderId: localOrderId,
        payUrl: result.payUrl,
        qrcodeUrl: result.qrcodeUrl,
      };
    } catch (error) {
      await db
        .update(payments)
        .set({
          status: 'failed',
          metadata: {
            type: options?.orderType ?? 'recharge',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          updatedAt: new Date(),
        })
        .where(eq(payments.id, localOrderId));

      throw error;
    }
  },

  /**
   * 创建支付订单 (底层 API)
   */
  async createOrder(params: CreateOrderParams): Promise<{
    payUrl: string;
    qrcodeUrl?: string;
  }> {
    const config = await getConfigByType(params.type);

    if (!config.appid || !config.appsecret) {
      throw new PaymentError('虎皮椒支付未配置 AppID 或 AppSecret');
    }

    // 验证回调 URL 必须配置
    if (!config.notifyUrl) {
      throw new PaymentError('虎皮椒支付未配置回调 URL，请在数据库或环境变量中配置 XUNHUPAY_NOTIFY_URL');
    }

    console.log('[虎皮椒支付] 创建订单，回调 URL:', config.notifyUrl);

    // 清理标题，移除 emoji 和不支持的字符
    const cleanTitle = sanitizeTitle(params.title);
    console.log('[虎皮椒支付] 原始标题:', params.title);
    console.log('[虎皮椒支付] 清理后标题:', cleanTitle);

    const requestParams: Record<string, string | number> = {
      version: '1.1',
      appid: config.appid,
      trade_order_id: params.orderId,
      total_fee: params.amount,
      title: cleanTitle,
      time: Math.floor(Date.now() / 1000),
      notify_url: config.notifyUrl,
      return_url: params.returnUrl ?? '',
      callback_url: params.returnUrl ?? '',
      nonce_str: Math.random().toString(36).substring(2, 15),
      type: params.type,
    };

    if (params.plugins) {
      requestParams.plugins = JSON.stringify(params.plugins);
    }

    requestParams.hash = generateSign(requestParams, config.appsecret);

    // 详细日志：记录请求参数（隐藏敏感信息）
    console.log('[虎皮椒支付] 请求参数:', {
      ...requestParams,
      appid: config.appid.substring(0, 8) + '***',
      hash: requestParams.hash.substring(0, 8) + '***',
      plugins_length: requestParams.plugins ? (requestParams.plugins as string).length : 0,
    });

    try {
      const response = await fetch(config.gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(requestParams as Record<string, string>).toString(),
      });

      if (!response.ok) {
        throw new ExternalServiceError('迅虎支付', `HTTP 错误: ${response.status}`);
      }

      const result = await response.json() as XunhupayResponse;

      // 详细日志：记录响应结果
      console.log('[虎皮椒支付] API 响应:', {
        errcode: result.errcode,
        errmsg: result.errmsg,
        has_url: !!result.url,
        has_qrcode: !!result.url_qrcode,
      });

      if (result.errcode !== 0) {
        console.error('[虎皮椒支付] API 错误详情:', {
          errcode: result.errcode,
          errmsg: result.errmsg,
          title: params.title,
          amount: params.amount,
          type: params.type,
        });
        throw new PaymentError(`迅虎支付错误: ${result.errmsg}`);
      }

      return {
        payUrl: result.url ?? '',
        qrcodeUrl: result.url_qrcode,
      };
    } catch (error) {
      if (error instanceof PaymentError || error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        '迅虎支付',
        error instanceof Error ? error.message : '未知错误'
      );
    }
  },

  /**
   * 验证回调签名（尝试微信和支付宝两个密钥）
   */
  async verifyCallback(params: Record<string, string>): Promise<boolean> {
    const dbConfig = await paymentConfigService.getXunhupayConfig();
    // 尝试微信密钥
    if (dbConfig.wechat.appsecret && verifySign(params, dbConfig.wechat.appsecret)) {
      return true;
    }
    // 尝试支付宝密钥
    if (dbConfig.alipay.appsecret && verifySign(params, dbConfig.alipay.appsecret)) {
      return true;
    }
    return false;
  },

  /**
   * 处理支付回调（带幂等性保证）
   */
  async handleCallback(params: CallbackParams): Promise<void> {
    if (!params.trade_order_id || !params.total_fee || !params.status || !params.hash) {
      throw new ValidationError('回调参数不完整');
    }

    // 1. 统一使用排序拼接方式验证签名（与 generateSign/verifySign 一致）
    const signVerified = await this.verifyCallback(params as unknown as Record<string, string>);

    if (!signVerified) {
      console.error('[迅虎支付] 签名验证失败', {
        received: params.hash,
      });
      throw new ValidationError('签名验证失败');
    }

    // 2. 使用 webhook 服务处理事件（带幂等性保证）
    const { webhookService } = await import('./webhook.js');

    // 统一使用 trade_order_id 作为幂等性检查的唯一标识
    // 避免因 transaction_id 在不同回调中的变化导致幂等性失效
    // 问题场景：第一次回调 transaction_id 为空，第二次回调有值，导致 eventId 不同
    const eventId = params.trade_order_id;

    const result = await webhookService.processWebhook(
      {
        provider: 'xunhupay',
        eventId,
        eventType: params.status === 'OD' ? 'payment.succeeded' : 'payment.pending',
        rawPayload: params,
        signature: params.hash,
        signatureVerified: true,
      },
      async () => {
        await this.processXunhupayCallback(params);
      }
    );

    if (result.isDuplicate) {
      console.log(
        `[迅虎支付] 重复回调，状态: ${result.record.status}, 订单: ${params.trade_order_id}`
      );
    }
  },

  /**
   * 处理虎皮椒回调的业务逻辑
   */
  async processXunhupayCallback(params: CallbackParams): Promise<void> {
    let plugins: Record<string, unknown> = {};
    if (params.plugins) {
      try {
        plugins = JSON.parse(params.plugins);
      } catch {
        console.warn('[迅虎支付] 解析 plugins 失败');
      }
    }

    const userId = plugins.userId as string;
    const localOrderId = plugins.localOrderId as string;

    if (!userId || !localOrderId) {
      console.error('[迅虎支付] 回调缺少必要参数', { plugins });
      throw new ValidationError('回调参数不完整');
    }

    console.log(`[迅虎支付] 收到回调: 订单 ${params.trade_order_id}, 状态 ${params.status}`);

    if (params.status !== 'OD') {
      console.log(`[迅虎支付] 订单未支付，状态: ${params.status}`);
      return;
    }

    await db.transaction(async (tx) => {
      const paymentResult = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, localOrderId))
        .limit(1);

      if (paymentResult.length === 0) {
        console.error(`[迅虎支付] 找不到支付记录: ${localOrderId}`);
        throw new NotFoundError('支付记录');
      }

      const payment = paymentResult[0]!;

      // 从数据库 metadata 获取订单类型（不再依赖 plugins.type，避免 plugins 超长）
      const paymentMeta = payment.metadata as Record<string, unknown> | null;
      const type = (paymentMeta?.type as string) ?? (plugins.type as string) ?? 'recharge';

      // 幂等性检查
      if (payment.status === 'succeeded') {
        console.log(`[迅虎支付] 订单 ${localOrderId} 已处理，跳过`);
        return;
      }

      // 金额校验：虎皮椒 total_fee 单位是元，payment.amount 也是元
      const paidAmountYuan = parseFloat(params.total_fee);
      const expectedAmountYuan = parseFloat(payment.amount);
      if (Math.abs(paidAmountYuan - expectedAmountYuan) > 0.01) {
        console.error(
          `[迅虎支付] 金额校验失败: 订单 ${localOrderId}, ` +
          `期望 ¥${expectedAmountYuan.toFixed(2)}, 实际 ¥${paidAmountYuan.toFixed(2)}`
        );
        await tx
          .update(payments)
          .set({
            status: 'needs_review',
            xunhupayTransactionId: params.transaction_id ?? null,
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              review_reason: 'amount_mismatch',
              expected_amount_yuan: expectedAmountYuan.toFixed(2),
              paid_amount_yuan: paidAmountYuan.toFixed(2),
              blocked_at: new Date().toISOString(),
            })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, localOrderId));
        return; // 不发放积分/不激活期卡
      }

      await tx
        .update(payments)
        .set({
          status: 'succeeded',
          xunhupayTransactionId: params.transaction_id ?? null,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, localOrderId));

      if (type === 'recharge') {
        const amountCny = parseFloat(payment.amount);
        // 查找对应的套餐信息来获取积分
        const paymentMeta = payment.metadata as { packageCredits?: number; packageBonusCredits?: number } | null;
        const credits = paymentMeta?.packageCredits ?? amountCny * 10; // 默认 1 元 = 10 积分
        const bonusCredits = paymentMeta?.packageBonusCredits ?? 0;

        await billingService.rechargeCredits(
          userId,
          credits,
          bonusCredits,
          localOrderId,
          `虎皮椒充值 ¥${amountCny.toFixed(2)}`
        );
        console.log(`[迅虎支付] 用户 ${userId} 充值成功: ¥${amountCny.toFixed(2)}, 积分: ${credits + bonusCredits}`);

        // 生成分销佣金（不影响充值主流程）
        try {
          const { generateReferralCommission } = await import('./referral.js');
          await generateReferralCommission(userId, localOrderId, amountCny);
        } catch (err) {
          console.error('[迅虎支付] 生成分销佣金失败:', err);
        }
      }

      if (type === 'period_card_purchase') {
        const meta = payment.metadata as Record<string, unknown> | null;
        const periodCardPlanId = (meta?.periodCardPlanId ?? plugins.periodCardPlanId) as string;
        if (!periodCardPlanId) {
          console.error('[迅虎支付] 期卡购买缺少 periodCardPlanId');
          return;
        }

        // 查询期卡套餐（不检查 is_enabled，已付款的订单应基于快照入卡）
        const planResult = await tx.execute(
          sql`SELECT id, name, period_type, period_days, daily_credits, price_cents, quota_mode, total_credits
              FROM period_card_plans WHERE id = ${periodCardPlanId}`
        );
        if (planResult.rows.length === 0) {
          console.error(`[迅虎支付] 期卡套餐不存在或已下架: ${periodCardPlanId}`);
          return;
        }
        const plan = planResult.rows[0] as any;

        // 优先从支付 metadata 读取快照值，fallback 到 DB 查询值
        const quotaMode: string = (meta?.quota_mode as string) ?? plan.quota_mode ?? 'daily';
        const totalCredits: number = meta?.total_credits != null
          ? parseFloat(String(meta.total_credits))
          : parseFloat(String(plan.total_credits ?? 0));
        const periodDays: number = meta?.period_days != null
          ? parseInt(String(meta.period_days), 10)
          : plan.period_days;
        const dailyCredits: number = meta?.daily_credits != null
          ? parseFloat(String(meta.daily_credits))
          : parseFloat(String(plan.daily_credits ?? 0));

        const now = new Date();
        const expiresAt = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

        // INSERT 期卡（ON CONFLICT 防止重复创建）
        let cardInsertResult;
        if (quotaMode === 'total') {
          cardInsertResult = await tx.execute(
            sql`INSERT INTO user_period_cards (user_id, plan_id, payment_id, status, starts_at, expires_at, daily_credits, daily_quota_remaining, quota_reset_date, quota_mode, total_credits, total_remaining)
                VALUES (${userId}, ${periodCardPlanId}, ${localOrderId}, 'active', ${now}, ${expiresAt}, ${0}, ${0}, ${null}, 'total', ${totalCredits}, ${totalCredits})
                ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING
                RETURNING id`
          );
        } else {
          const quotaResetDate = getTodayDateCST();
          cardInsertResult = await tx.execute(
            sql`INSERT INTO user_period_cards (user_id, plan_id, payment_id, status, starts_at, expires_at, daily_credits, daily_quota_remaining, quota_reset_date)
                VALUES (${userId}, ${periodCardPlanId}, ${localOrderId}, 'active', ${now}, ${expiresAt}, ${dailyCredits}, ${dailyCredits}, ${quotaResetDate})
                ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING
                RETURNING id`
          );
        }

        const cardCreated = cardInsertResult.rows.length > 0;

        if (cardCreated) {
          console.log(`[迅虎支付] 用户 ${userId} 期卡激活成功: ${plan.name}, 模式: ${quotaMode}, 每日额度: ${dailyCredits}, 总量: ${totalCredits}`);

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
            console.error('[迅虎支付] 发送期卡购买确认邮件失败:', err);
          }

          // 生成分销佣金（仅新创建时生成）
          try {
            const amountCny = parseFloat(payment.amount);
            const { generateReferralCommission } = await import('./referral.js');
            await generateReferralCommission(userId, localOrderId, amountCny);
          } catch (err) {
            console.error('[迅虎支付] 生成分销佣金失败:', err);
          }
        } else {
          console.log(`[迅虎支付] 期卡已存在，跳过重复创建 (payment_id=${localOrderId})`);
        }
      }

      if (type === 'period_card_upgrade') {
        // 升级功能已冻结，遗留订单标记为 needs_review
        await tx
          .update(payments)
          .set({
            status: 'needs_review',
            xunhupayTransactionId: params.transaction_id ?? null,
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              review_reason: 'upgrade_frozen',
              blocked_at: new Date().toISOString(),
            })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, localOrderId));
        console.warn(`[迅虎支付] 升级功能已冻结，订单 ${localOrderId} 标记为 needs_review`);
      }
    });
  },

  /**
   * 查询订单状态
   */
  async queryOrderByLocalId(orderId: string): Promise<XunhupayOrderStatusResult> {
    const paymentResult = await db
      .select()
      .from(payments)
      .where(eq(payments.id, orderId))
      .limit(1);

    if (paymentResult.length === 0) {
      throw new NotFoundError('订单');
    }

    const payment = paymentResult[0]!;

    if (payment.status === 'succeeded') {
      return {
        orderId: payment.id,
        status: 'paid',
        transactionId: payment.xunhupayTransactionId ?? undefined,
        paidAt: payment.paidAt ?? undefined,
      };
    }

    if (payment.status === 'needs_review') {
      return {
        orderId: payment.id,
        status: 'needs_review',
        transactionId: payment.xunhupayTransactionId ?? undefined,
        paidAt: payment.paidAt ?? undefined,
      };
    }

    if (payment.xunhupayOrderId && payment.status === 'pending') {
      try {
        const paymentMeta = payment.metadata as { paymentType?: 'wechat' | 'alipay' } | null;
        const paymentType = paymentMeta?.paymentType ?? 'wechat';
        const remoteStatus = await this.queryOrder(payment.xunhupayOrderId, paymentType);

        if (remoteStatus.status === 'paid' && payment.status === 'pending') {
          // 原子条件更新：仅当状态仍为 pending 时才更新，防止与 webhook 竞态
          const { pool } = await import('../db/index.js');
          const updateResult = await pool.query(
            `UPDATE payments SET status = 'succeeded', xunhupay_transaction_id = $1, paid_at = $2, updated_at = $3
             WHERE id = $4 AND status = 'pending'
             RETURNING id`,
            [remoteStatus.transactionId ?? null, remoteStatus.paidAt ?? new Date(), new Date(), orderId]
          );

          if (updateResult.rows.length === 0) {
            // 已被 webhook 处理，跳过补单
            console.log(`[迅虎支付] 补单跳过：订单 ${orderId} 已被处理`);
            return {
              orderId: payment.id,
              status: 'paid',
              transactionId: remoteStatus.transactionId,
              paidAt: remoteStatus.paidAt ?? payment.paidAt ?? undefined,
            };
          }

          const metadata = payment.metadata as { type?: string; packageCredits?: number; packageBonusCredits?: number; periodCardPlanId?: string; oldCardId?: string } | null;

          // 补偿事务：发货失败时回退 payments 状态为 pending，确保下次轮询可重试
          // 避免"支付已标记 succeeded 但积分/期卡未发放"的永久丢货问题
          try {
            if (metadata?.type === 'recharge') {
              const amountCny = parseFloat(payment.amount);
              const credits = metadata.packageCredits ?? amountCny * 10;
              const bonusCredits = metadata.packageBonusCredits ?? 0;

              await billingService.rechargeCredits(
                payment.userId,
                credits,
                bonusCredits,
                orderId,
                `虎皮椒充值 ¥${amountCny.toFixed(2)}`
              );

              // 补单时也生成分销佣金（不影响充值主流程）
              try {
                const { generateReferralCommission } = await import('./referral.js');
                await generateReferralCommission(payment.userId, orderId, amountCny);
              } catch (err) {
                console.error('[迅虎支付] 补单生成分销佣金失败:', err);
              }
            }

            // 补单：期卡购买（INSERT ON CONFLICT 防止重复创建）
            if (metadata?.type === 'period_card_purchase' && metadata.periodCardPlanId) {
              const planResult = await pool.query(
                `SELECT id, name, period_days, daily_credits, price_cents, quota_mode, total_credits FROM period_card_plans WHERE id = $1`,
                [metadata.periodCardPlanId]
              );
              if (planResult.rows.length > 0) {
                const plan = planResult.rows[0] as any;

                // 优先从支付 metadata 读取快照值，fallback 到 DB 查询值
                const meta = metadata as Record<string, unknown>;
                const quotaMode: string = (meta.quota_mode as string) ?? plan.quota_mode ?? 'daily';
                const totalCredits: number = meta.total_credits != null
                  ? parseFloat(String(meta.total_credits))
                  : parseFloat(String(plan.total_credits ?? 0));
                const periodDays: number = meta.period_days != null
                  ? parseInt(String(meta.period_days), 10)
                  : plan.period_days;
                const dailyCredits: number = meta.daily_credits != null
                  ? parseFloat(String(meta.daily_credits))
                  : parseFloat(String(plan.daily_credits ?? 0));

                const now = new Date();
                const expiresAt = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

                let insertResult;
                if (quotaMode === 'total') {
                  insertResult = await pool.query(
                    `INSERT INTO user_period_cards (user_id, plan_id, payment_id, status, starts_at, expires_at, daily_credits, daily_quota_remaining, quota_reset_date, quota_mode, total_credits, total_remaining)
                     VALUES ($1, $2, $3, 'active', $4, $5, 0, 0, NULL, 'total', $6, $6)
                     ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING
                     RETURNING id`,
                    [payment.userId, metadata.periodCardPlanId, orderId, now, expiresAt, totalCredits]
                  );
                } else {
                  const quotaResetDate = getTodayDateCST();
                  insertResult = await pool.query(
                    `INSERT INTO user_period_cards (user_id, plan_id, payment_id, status, starts_at, expires_at, daily_credits, daily_quota_remaining, quota_reset_date)
                     VALUES ($1, $2, $3, 'active', $4, $5, $6, $6, $7)
                     ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING
                     RETURNING id`,
                    [payment.userId, metadata.periodCardPlanId, orderId, now, expiresAt, dailyCredits, quotaResetDate]
                  );
                }

                if (insertResult.rows.length > 0) {
                  console.log(`[迅虎支付] 补单期卡激活成功: 用户 ${payment.userId}, 套餐 ${plan.name}, 模式: ${quotaMode}`);

                  // 补单时也生成分销佣金（不影响期卡购买主流程）
                  try {
                    const amountCny = parseFloat(payment.amount);
                    const { generateReferralCommission } = await import('./referral.js');
                    await generateReferralCommission(payment.userId, orderId, amountCny);
                  } catch (err) {
                    console.error('[迅虎支付] 补单生成分销佣金失败:', err);
                  }
                } else {
                  console.log(`[迅虎支付] 补单跳过：期卡已存在 (payment_id=${orderId})`);
                }
              }
            }

            // 补单：期卡升级（已冻结，标记 needs_review）
            if (metadata?.type === 'period_card_upgrade' && metadata.periodCardPlanId && metadata.oldCardId) {
              await pool.query(
                `UPDATE payments SET status = 'needs_review', metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
                [JSON.stringify({ review_reason: 'upgrade_frozen', blocked_at: new Date().toISOString() }), orderId]
              );
              console.warn(`[迅虎支付] 补单升级功能已冻结，订单 ${orderId} 标记为 needs_review`);
            }
          } catch (deliveryError) {
            // 发货失败：回退 payments 状态为 pending，下次用户轮询时重试
            console.error(`[迅虎支付] 补单发货失败，回退支付状态: ${orderId}`, deliveryError);
            await pool.query(
              `UPDATE payments SET status = 'pending', updated_at = NOW() WHERE id = $1`,
              [orderId]
            );
            throw deliveryError;
          }
        }

        return {
          orderId: payment.id,
          ...remoteStatus,
        };
      } catch (error) {
        console.warn(`[迅虎支付] 查询订单状态失败: ${error}`);
      }
    }

    const localStatus = payment.status === 'refunded'
      ? 'failed'
      : payment.status as XunhupayOrderStatus;

    return {
      orderId: payment.id,
      status: localStatus,
      transactionId: payment.xunhupayTransactionId ?? undefined,
      paidAt: payment.paidAt ?? undefined,
    };
  },

  /**
   * 查询订单状态 (调用迅虎 API)
   */
  async queryOrder(xunhupayOrderId: string, paymentType: 'wechat' | 'alipay' = 'wechat'): Promise<{
    status: XunhupayOrderStatus;
    transactionId?: string;
    paidAt?: Date;
  }> {
    const config = await getConfigByType(paymentType);

    const requestParams: Record<string, string | number> = {
      appid: config.appid,
      out_trade_order: xunhupayOrderId,
      time: Math.floor(Date.now() / 1000),
      nonce_str: Math.random().toString(36).substring(2, 15),
    };

    requestParams.hash = generateSign(requestParams, config.appsecret);

    try {
      const response = await fetch('https://api.xunhupay.com/payment/query.html', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(requestParams as Record<string, string>).toString(),
      });

      if (!response.ok) {
        throw new ExternalServiceError('迅虎支付', `HTTP 错误: ${response.status}`);
      }

      const result = await response.json() as {
        errcode: number;
        errmsg: string;
        status?: string;
        transaction_id?: string;
        paid_time?: string;
        data?: {
          status?: string;
          transaction_id?: string | null;
          paid_date?: string | null;
          paid_time?: string | null;
        };
      };

      if (result.errcode !== 0) {
        throw new PaymentError(`查询订单失败: ${result.errmsg}`);
      }

      const payload: {
        status?: string;
        transaction_id?: string | null;
        paid_date?: string | null;
        paid_time?: string | null;
      } = result.data ?? {
        status: result.status,
        transaction_id: result.transaction_id,
        paid_date: null,
        paid_time: result.paid_time ?? null,
      };
      const remoteStatus = payload.status;

      let status: XunhupayOrderStatus = 'pending';
      if (remoteStatus === 'OD') {
        status = 'paid';
      } else if (remoteStatus === 'WP') {
        status = 'pending';
      } else if (remoteStatus === 'CD') {
        status = 'expired';
      }

      const paidAtRaw = payload.paid_date ?? payload.paid_time ?? null;
      const paidAt = paidAtRaw ? new Date(paidAtRaw.replace(' ', 'T')) : undefined;
      const paidAtSafe = paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : undefined;

      return {
        status,
        transactionId: payload.transaction_id ?? undefined,
        paidAt: paidAtSafe,
      };
    } catch (error) {
      if (error instanceof PaymentError || error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        '迅虎支付',
        error instanceof Error ? error.message : '未知错误'
      );
    }
  },
};
