import { pool } from '../db/index.js';

/**
 * 分销佣金配置
 */
interface ReferralConfig {
  commission_rate: string;
  commission_type: string;
  fixed_amount: string;
  max_levels: number;
  level2_rate: string;
  is_enabled: boolean;
}

/**
 * 推荐关系
 */
interface ReferralRelation {
  referrer_id: string;
  level: number;
}

/**
 * 插入佣金参数
 */
interface InsertCommissionParams {
  referrerId: string;
  referredId: string;
  orderId: string;
  orderAmount: number;
  commissionRate: number;
  commissionType: string;
  fixedAmount: number;
  level: number;
}

/**
 * 分销佣金服务
 */
export const referralService = {
  /**
   * 生成分销佣金
   *
   * 在支付成功后调用，为推荐人生成佣金记录。
   * 支持多级分销（最多 3 级）。
   * 幂等性保证：数据库 UNIQUE 约束 + ON CONFLICT DO NOTHING。
   * 佣金生成失败不影响充值主流程。
   *
   * @param userId - 付款用户 ID（被推荐人）
   * @param orderId - 支付订单 ID
   * @param orderAmount - 订单金额（元，字符串或数字）
   */
  async generateCommission(
    userId: string,
    orderId: string,
    orderAmount: number | string
  ): Promise<void> {
    try {
      const amount = typeof orderAmount === 'string' ? parseFloat(orderAmount) : orderAmount;

      if (!amount || amount <= 0) {
        console.log(`[分销佣金] 订单金额无效，跳过: orderId=${orderId}, amount=${orderAmount}`);
        return;
      }

      // 1. 确保唯一约束存在（幂等 DDL，首次调用时创建）
      await this.ensureUniqueConstraint();

      // 2. 查询分销配置
      const configResult = await pool.query(
        `SELECT commission_rate, commission_type, fixed_amount, max_levels, level2_rate, is_enabled
         FROM referral_config
         LIMIT 1`
      );

      if (!configResult.rows || configResult.rows.length === 0) {
        console.log('[分销佣金] 未找到分销配置，跳过');
        return;
      }

      const config = configResult.rows[0] as ReferralConfig;

      if (!config.is_enabled) {
        console.log('[分销佣金] 分销功能未启用，跳过');
        return;
      }

      // 3. 查找一级推荐人
      const relationResult = await pool.query(
        `SELECT referrer_id, level
         FROM referral_relations
         WHERE referred_id = $1 AND level = 1`,
        [userId]
      );

      if (!relationResult.rows || relationResult.rows.length === 0) {
        console.log(`[分销佣金] 用户 ${userId} 没有推荐人，跳过`);
        return;
      }

      const relation = relationResult.rows[0] as ReferralRelation;
      const level1ReferrerId = relation.referrer_id;

      // 4. 生成一级佣金
      await this.insertCommission({
        referrerId: level1ReferrerId,
        referredId: userId,
        orderId,
        orderAmount: amount,
        commissionRate: parseFloat(config.commission_rate),
        commissionType: config.commission_type,
        fixedAmount: parseFloat(config.fixed_amount),
        level: 1,
      });

      // 5. 如果支持多级分销，生成二级佣金
      if (config.max_levels >= 2) {
        const parentRelationResult = await pool.query(
          `SELECT referrer_id
           FROM referral_relations
           WHERE referred_id = $1 AND level = 1`,
          [level1ReferrerId]
        );

        if (parentRelationResult.rows && parentRelationResult.rows.length > 0) {
          const level2ReferrerId = (parentRelationResult.rows[0] as { referrer_id: string }).referrer_id;

          await this.insertCommission({
            referrerId: level2ReferrerId,
            referredId: userId,
            orderId,
            orderAmount: amount,
            commissionRate: parseFloat(config.level2_rate),
            commissionType: config.commission_type,
            fixedAmount: parseFloat(config.fixed_amount),
            level: 2,
          });

          // 6. 如果支持三级分销
          if (config.max_levels >= 3) {
            const grandParentResult = await pool.query(
              `SELECT referrer_id
               FROM referral_relations
               WHERE referred_id = $1 AND level = 1`,
              [level2ReferrerId]
            );

            if (grandParentResult.rows && grandParentResult.rows.length > 0) {
              const level3ReferrerId = (grandParentResult.rows[0] as { referrer_id: string }).referrer_id;
              // 三级佣金使用 level2_rate 的一半（向下取整到 2 位小数）
              const level3Rate = Math.floor(parseFloat(config.level2_rate) * 50) / 100;

              await this.insertCommission({
                referrerId: level3ReferrerId,
                referredId: userId,
                orderId,
                orderAmount: amount,
                commissionRate: level3Rate,
                commissionType: config.commission_type,
                fixedAmount: parseFloat(config.fixed_amount),
                level: 3,
              });
            }
          }
        }
      }

      console.log(`[分销佣金] 佣金生成完成: userId=${userId}, orderId=${orderId}, amount=${amount}`);
    } catch (error) {
      // 佣金生成失败不应影响充值主流程
      console.error('[分销佣金] 生成佣金失败:', error);
    }
  },

  /**
   * 确保 referral_commissions 表上存在唯一约束（幂等）
   */
  async ensureUniqueConstraint(): Promise<void> {
    if (referralService._constraintEnsured) {
      return;
    }
    try {
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_commissions_order_referrer_level
         ON referral_commissions (order_id, referrer_id, level)`
      );
      referralService._constraintEnsured = true;
    } catch (error) {
      // 约束已存在或创建失败都不阻塞业务
      console.warn('[分销佣金] 创建唯一索引时出错（可忽略）:', error);
      referralService._constraintEnsured = true;
    }
  },

  /** 内部标记：唯一约束是否已确保 */
  _constraintEnsured: false,

  /**
   * 插入佣金记录（使用 ON CONFLICT DO NOTHING 保证幂等性）
   */
  async insertCommission(params: InsertCommissionParams): Promise<void> {
    const {
      referrerId,
      referredId,
      orderId,
      orderAmount,
      commissionRate,
      commissionType,
      fixedAmount,
      level,
    } = params;

    // 计算佣金金额
    let commissionAmount: number;
    let actualRate: number;

    if (commissionType === 'fixed') {
      commissionAmount = fixedAmount;
      actualRate = orderAmount > 0 ? (fixedAmount / orderAmount) * 100 : 0;
    } else {
      // percentage 模式：commission_rate 存储百分比值（如 10 表示 10%）
      actualRate = commissionRate;
      commissionAmount = Math.floor(orderAmount * commissionRate) / 100;
    }

    if (commissionAmount <= 0) {
      console.log(
        `[分销佣金] 佣金金额为 0，跳过: orderId=${orderId}, referrerId=${referrerId}, level=${level}`
      );
      return;
    }

    const result = await pool.query(
      `INSERT INTO referral_commissions
         (referrer_id, referred_id, order_id, order_amount, commission_rate, commission_amount, level, status, settled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', NOW())
       ON CONFLICT (order_id, referrer_id, level) DO NOTHING
       RETURNING id`,
      [
        referrerId,
        referredId,
        orderId,
        orderAmount.toFixed(2),
        actualRate.toFixed(2),
        commissionAmount.toFixed(2),
        level,
      ]
    );

    if (!result.rows || result.rows.length === 0) {
      console.log(
        `[分销佣金] 佣金已存在（幂等跳过）: orderId=${orderId}, referrerId=${referrerId}, level=${level}`
      );
      return;
    }

    console.log(
      `[分销佣金] 已生成 ${level} 级佣金: referrerId=${referrerId}, orderId=${orderId}, ` +
      `orderAmount=${orderAmount.toFixed(2)}, rate=${actualRate.toFixed(2)}%, ` +
      `commission=${commissionAmount.toFixed(2)}`
    );
  },
};

/**
 * 生成分销佣金（便捷导出，供支付回调调用）
 */
export const generateReferralCommission = referralService.generateCommission.bind(referralService);
