/**
 * 折扣码服务
 *
 * 功能:
 * - 验证折扣码是否可用
 * - 计算折扣金额
 * - 应用折扣并记录使用
 * - 通过 code 查询折扣码
 */

import { pool } from '../db/index.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

// ==========================================
// 类型定义
// ==========================================

export type DiscountType = 'percentage' | 'fixed_amount' | 'bonus_credits';

export interface DiscountCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  minAmount: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  isActive: boolean;
  startsAt: string;
  expiresAt: string | null;
  applicablePackages: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiscountCalculation {
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  bonusCredits: number;
  finalAmount: number;
}

export interface DiscountValidationResult {
  valid: boolean;
  discountCode?: DiscountCode;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount?: number;
  bonusCredits?: number;
  finalAmount?: number;
  message: string;
}

interface DiscountCodeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: string;
  discount_value: string;
  min_amount: number;
  max_discount: number | null;
  usage_limit: number | null;
  per_user_limit: number;
  used_count: number;
  is_active: boolean;
  starts_at: string;
  expires_at: string | null;
  applicable_packages: string[] | null;
  created_at: string;
  updated_at: string;
}

// ==========================================
// 辅助函数
// ==========================================

function rowToDiscountCode(row: DiscountCodeRow): DiscountCode {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    discountType: row.discount_type as DiscountType,
    discountValue: parseFloat(row.discount_value),
    minAmount: row.min_amount,
    maxDiscount: row.max_discount,
    usageLimit: row.usage_limit,
    perUserLimit: row.per_user_limit,
    usedCount: row.used_count,
    isActive: row.is_active,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    applicablePackages: row.applicable_packages,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==========================================
// 服务实现
// ==========================================

/**
 * 通过 code 查询折扣码（不区分大小写）
 */
async function getDiscountCodeByCode(code: string): Promise<DiscountCode | null> {
  const result = await pool.query(
    `SELECT * FROM discount_codes WHERE UPPER(code) = UPPER($1)`,
    [code]
  );

  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  return rowToDiscountCode(result.rows[0] as DiscountCodeRow);
}

/**
 * 计算折扣金额
 */
function calculateDiscount(discountCode: DiscountCode, originalAmount: number): DiscountCalculation {
  let discountAmount = 0;
  let bonusCredits = 0;
  let finalAmount = originalAmount;

  switch (discountCode.discountType) {
    case 'percentage': {
      // 百分比折扣
      discountAmount = Math.floor(originalAmount * discountCode.discountValue / 100);
      // 应用最大折扣限制
      if (discountCode.maxDiscount !== null && discountAmount > discountCode.maxDiscount) {
        discountAmount = discountCode.maxDiscount;
      }
      finalAmount = originalAmount - discountAmount;
      break;
    }
    case 'fixed_amount': {
      // 固定金额折扣
      discountAmount = Math.min(Math.floor(discountCode.discountValue), originalAmount);
      // 应用最大折扣限制
      if (discountCode.maxDiscount !== null && discountAmount > discountCode.maxDiscount) {
        discountAmount = discountCode.maxDiscount;
      }
      finalAmount = originalAmount - discountAmount;
      break;
    }
    case 'bonus_credits': {
      // 赠送积分，不影响支付金额
      bonusCredits = discountCode.discountValue;
      finalAmount = originalAmount;
      break;
    }
  }

  // 确保最终金额不为负
  if (finalAmount < 0) {
    finalAmount = 0;
    discountAmount = originalAmount;
  }

  return {
    discountType: discountCode.discountType,
    discountValue: discountCode.discountValue,
    discountAmount,
    bonusCredits,
    finalAmount,
  };
}

/**
 * 验证折扣码是否可用
 */
async function validateDiscountCode(
  code: string,
  userId: string,
  packageId?: string,
  amount?: number
): Promise<DiscountValidationResult> {
  // 查询折扣码
  const discountCode = await getDiscountCodeByCode(code);

  if (!discountCode) {
    return { valid: false, message: '折扣码不存在' };
  }

  // 检查是否启用
  if (!discountCode.isActive) {
    return { valid: false, message: '折扣码已停用' };
  }

  // 检查是否在有效期内
  const now = new Date();
  if (new Date(discountCode.startsAt) > now) {
    return { valid: false, message: '折扣码尚未生效' };
  }

  if (discountCode.expiresAt && new Date(discountCode.expiresAt) < now) {
    return { valid: false, message: '折扣码已过期' };
  }

  // 检查总使用次数
  if (discountCode.usageLimit !== null && discountCode.usedCount >= discountCode.usageLimit) {
    return { valid: false, message: '折扣码已达到使用上限' };
  }

  // 检查用户使用次数
  const userUsageResult = await pool.query(
    `SELECT COUNT(*) as count FROM discount_code_usages
     WHERE discount_code_id = $1 AND user_id = $2`,
    [discountCode.id, userId]
  );
  const userUsageCount = parseInt((userUsageResult.rows[0] as { count: string }).count, 10);

  if (userUsageCount >= discountCode.perUserLimit) {
    return { valid: false, message: '您已达到该折扣码的使用次数上限' };
  }

  // 检查适用套餐
  if (packageId && discountCode.applicablePackages && discountCode.applicablePackages.length > 0) {
    if (!discountCode.applicablePackages.includes(packageId)) {
      return { valid: false, message: '该折扣码不适用于所选套餐' };
    }
  }

  // 检查最低消费金额
  if (amount !== undefined && amount < discountCode.minAmount) {
    return {
      valid: false,
      message: `最低消费金额为 ${(discountCode.minAmount / 100).toFixed(2)} 元`,
    };
  }

  // 计算折扣
  const calculation = calculateDiscount(discountCode, amount ?? 0);

  return {
    valid: true,
    discountCode,
    discountType: calculation.discountType,
    discountValue: calculation.discountValue,
    discountAmount: calculation.discountAmount,
    bonusCredits: calculation.bonusCredits,
    finalAmount: calculation.finalAmount,
    message: '折扣码有效',
  };
}

/**
 * 应用折扣并记录使用
 * 注意：应在支付成功后调用
 */
async function applyDiscount(
  code: string,
  userId: string,
  orderId: string,
  originalAmount: number
): Promise<DiscountCalculation> {
  const discountCode = await getDiscountCodeByCode(code);

  if (!discountCode) {
    throw new NotFoundError('折扣码');
  }

  // 再次验证（防止并发问题）
  const validation = await validateDiscountCode(code, userId, undefined, originalAmount);
  if (!validation.valid) {
    throw new ValidationError(validation.message);
  }

  const calculation = calculateDiscount(discountCode, originalAmount);

  // 记录使用
  await pool.query(
    `INSERT INTO discount_code_usages
     (discount_code_id, user_id, order_id, original_amount, discount_amount, final_amount, bonus_credits)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      discountCode.id,
      userId,
      orderId,
      originalAmount,
      calculation.discountAmount,
      calculation.finalAmount,
      calculation.bonusCredits,
    ]
  );

  // 更新使用次数
  await pool.query(
    `UPDATE discount_codes SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1`,
    [discountCode.id]
  );

  return calculation;
}

// ==========================================
// 导出
// ==========================================

export const discountService = {
  getDiscountCodeByCode,
  calculateDiscount,
  validateDiscountCode,
  applyDiscount,
};

export default discountService;
