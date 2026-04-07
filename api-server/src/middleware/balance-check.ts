import type { Request, Response, NextFunction } from 'express';
import { billingService } from '../services/billing.js';
import { emailService } from '../services/email.js';
import { db } from '../db/index.js';
import { userBalances } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { AuthenticationError, QuotaExceededError, NotFoundError, ValidationError } from '../utils/errors.js';
import { getSystemConfig } from '../services/config.js';

/**
 * 预扣信息存储在 request 对象上
 */
declare global {
  namespace Express {
    interface Request {
      preChargeId?: string;
      estimatedCredits?: number;
      creditsInfo?: {
        creditsBefore: number;
        creditsAfter: number;
      };
    }
  }
}

/**
 * 估算配置
 */
interface EstimationConfig {
  defaultInputTokens?: number;
  defaultOutputTokens?: number;
  minPreChargeCredits?: number;
  allowZeroCredits?: boolean;
}

const DEFAULT_CONFIG: Required<EstimationConfig> = {
  defaultInputTokens: 4000,
  defaultOutputTokens: 4000,
  minPreChargeCredits: 0.01,
  allowZeroCredits: false,
};

/**
 * 从请求中提取模型名称
 */
function extractModel(req: Request): string | null {
  if (req.body?.model) {
    return req.body.model;
  }

  if (req.body?.messages?.[0]?.model) {
    return req.body.messages[0].model;
  }

  if (req.query?.model && typeof req.query.model === 'string') {
    return req.query.model;
  }

  const modelHeader = req.headers['x-model'] as string | undefined;
  if (modelHeader) {
    return modelHeader;
  }

  return null;
}

/**
 * 从请求中估算输入 tokens
 */
/**
 * 中文 Unicode 范围正则（CJK 统一汉字）
 */
const CJK_REGEX = /[\u4e00-\u9fff]/g;

/**
 * 根据中英文比例估算文本 token 数
 * 中文字符约 1.5 token/字符，英文/ASCII 约 0.25 token/字符（4字符≈1token）
 * 偏保守估算，宁可多预扣
 */
function estimateTokensForText(text: string): number {
  const cjkMatches = text.match(CJK_REGEX);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const asciiCount = text.length - cjkCount;
  return Math.ceil(cjkCount * 1.5 + asciiCount * 0.25);
}

function estimateInputTokens(req: Request): number {
  let totalTokens = 0;

  if (req.body?.messages && Array.isArray(req.body.messages)) {
    for (const msg of req.body.messages) {
      if (typeof msg.content === 'string') {
        totalTokens += estimateTokensForText(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && typeof part.text === 'string') {
            totalTokens += estimateTokensForText(part.text);
          }
        }
      }
    }
  }

  if (typeof req.body?.prompt === 'string') {
    totalTokens += estimateTokensForText(req.body.prompt);
  }

  if (typeof req.body?.system === 'string') {
    totalTokens += estimateTokensForText(req.body.system);
  }

  return Math.min(Math.max(totalTokens, 100), 200000);
}

/**
 * 从请求中估算输出 tokens
 */
function estimateOutputTokens(req: Request, defaultTokens: number): number {
  const maxTokens = req.body?.max_tokens;
  if (typeof maxTokens === 'number' && maxTokens > 0) {
    // max_tokens 是上限，实际输出通常远小于此值，取 20% 作为预估
    // 实际结算按真实 token 数，多扣的会退还
    return Math.min(Math.ceil(maxTokens * 0.2), 100000);
  }
  return defaultTokens;
}

/**
 * 余额检查中间件工厂（积分版）
 * 在 API 请求前检查用户积分并预扣
 */
export function balanceCheck(config: EstimationConfig = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;

    if (!userId) {
      throw new AuthenticationError('未认证的请求');
    }

    const model = extractModel(req);
    if (!model) {
      throw new ValidationError('请求中缺少模型参数');
    }

    // 工具模型免费，跳过计费
    const toolModelId = await getSystemConfig('tool_model_id', '');
    if (toolModelId && model === toolModelId) {
      next();
      return;
    }

    const inputTokens = estimateInputTokens(req) || finalConfig.defaultInputTokens;
    const outputTokens = estimateOutputTokens(req, finalConfig.defaultOutputTokens);

    const estimatedCredits = await billingService.estimateCredits(model, inputTokens, outputTokens);
    const actualPreChargeCredits = Math.max(estimatedCredits, finalConfig.minPreChargeCredits);

    // 直接预扣，preChargeCredits 内部的原子 UPDATE 已包含余额检查
    // 去掉了冗余的 SELECT credits 预检查（每请求减少 1 次 DB 查询）
    try {
      const preChargeResult = await billingService.preChargeCredits(userId, actualPreChargeCredits);

      req.preChargeId = preChargeResult.preChargeId;
      req.estimatedCredits = actualPreChargeCredits;
      req.creditsInfo = {
        creditsBefore: preChargeResult.creditsBefore,
        creditsAfter: preChargeResult.creditsAfter,
      };
    } catch (error) {
      // 余额不足或用户不存在时，异步发送低余额通知
      if (error instanceof QuotaExceededError || error instanceof NotFoundError) {
        sendLowBalanceNotification(userId, 0).catch(() => {});
      }
      throw error;
    }

    next();
  };
}

/**
 * 结算积分中间件
 * 在请求完成后根据实际使用量结算
 */
export async function settleCreditsAfterRequest(
  req: Request,
  usageData: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    latencyMs?: number;
    status: 'success' | 'error';
    errorMessage?: string;
    /** 真实 provider（从渠道选择结果获取） */
    provider?: string;
    /** 渠道 ID */
    channelId?: string;
    /** 请求 ID（外部传入优先） */
    requestId?: string;
  }
): Promise<void> {
  const userId = req.userId;
  const preChargeId = req.preChargeId;
  if (!userId || !preChargeId) {
    return;
  }

  // 阶段 1：计费 + 结算/退款
  let actualCredits = 0;
  let quotaUsed = 0;
  let balanceCreditsConsumed = 0;
  let settlementFinalized = false;

  try {
    const calculation = await billingService.calculateCredits(
      usageData.model,
      usageData.inputTokens,
      usageData.outputTokens,
      usageData.cacheReadTokens,
      usageData.cacheWriteTokens
    );

    const shouldCharge = usageData.status === 'success' && usageData.outputTokens > 0;
    if (shouldCharge) {
      actualCredits = calculation.totalCredits;
    }

    if (actualCredits > 0) {
      const settlement = await billingService.settleCredits(userId, actualCredits, preChargeId);
      quotaUsed = settlement.quotaUsed;
      balanceCreditsConsumed = settlement.balanceCreditsConsumed ?? 0;
      settlementFinalized = true;
    } else {
      await billingService.refundPreCharge(userId, preChargeId);
      settlementFinalized = true;
    }
  } catch (error) {
    console.error('[Balance] 积分结算失败:', error);
    // 结算未完成时兜底退款，防止预扣蒸发
    if (!settlementFinalized) {
      try {
        await billingService.refundPreCharge(userId, preChargeId);
        // 兜底成功：清零，确保后续 recordUsage 不会记成收费
        actualCredits = 0;
        quotaUsed = 0;
        balanceCreditsConsumed = 0;
      } catch (refundError) {
        console.error('[Balance] 兜底退款也失败，预扣可能蒸发:', refundError);
      }
    }
  }

  // 阶段 2：记录使用日志（独立 try/catch，不退款）
  try {
    const requestId = usageData.requestId
      ?? (req.headers['x-request-id'] as string)
      ?? `req_${Date.now()}`;

    const provider = usageData.provider || 'anthropic';

    await billingService.recordUsage(userId, {
      requestId,
      model: usageData.model,
      provider,
      inputTokens: usageData.inputTokens,
      outputTokens: usageData.outputTokens,
      cacheReadTokens: usageData.cacheReadTokens,
      cacheWriteTokens: usageData.cacheWriteTokens,
      latencyMs: usageData.latencyMs,
      status: usageData.status,
      errorMessage: usageData.errorMessage,
      creditsConsumed: actualCredits,
      quotaUsed,
      metadata: {
        preChargeId,
        estimatedCredits: req.estimatedCredits,
        channelId: usageData.channelId,
        balanceCreditsConsumed,
      },
    });
  } catch (error) {
    console.error('[Balance] 使用记录写入失败:', error);
  }
}

/**
 * 请求失败时退还预扣积分
 */
export async function refundOnError(req: Request): Promise<void> {
  const userId = req.userId;
  const preChargeId = req.preChargeId;

  if (!userId || !preChargeId) {
    return;
  }

  try {
    await billingService.refundPreCharge(userId, preChargeId);
  } catch (error) {
    console.error('[Balance] 退还预扣积分失败:', error);
  }
}

/**
 * 检查用户是否有足够积分（不预扣）
 */
export async function checkCredits(
  userId: string,
  requiredCredits: number = 0.01
): Promise<{ hasCredits: boolean; currentCredits: number }> {
  const balanceResult = await db
    .select()
    .from(userBalances)
    .where(eq(userBalances.userId, userId))
    .limit(1);

  const currentCredits = balanceResult.length > 0
    ? parseFloat(balanceResult[0]!.credits)
    : 0;

  return {
    hasCredits: currentCredits >= requiredCredits,
    currentCredits,
  };
}

export default balanceCheck;

/**
 * 异步发送余额不足提醒邮件
 * 内部查询用户信息，不阻塞主流程
 * 只对充值过的用户发送提醒（total_deposited > 0）
 */
async function sendLowBalanceNotification(userId: string, currentCredits: number): Promise<void> {
  try {
    const { users } = await import('../db/schema.js');

    // 联合查询用户信息和余额信息
    const result = await db
      .select({
        email: users.email,
        name: users.name,
        totalDeposited: userBalances.totalDeposited
      })
      .from(users)
      .leftJoin(userBalances, eq(users.id, userBalances.userId))
      .where(eq(users.id, userId))
      .limit(1);

    const user = result[0];
    if (!user) {
      return;
    }

    // 只对充值过的用户发送提醒
    const totalDeposited = parseFloat(user.totalDeposited ?? '0');
    if (totalDeposited <= 0) {
      console.info(`[Balance] 跳过余额不足提醒: 用户 ${userId} 未充值过`);
      return;
    }

    await emailService.sendLowBalanceEmail(
      user.email,
      user.name ?? user.email.split('@')[0] ?? 'User',
      currentCredits.toFixed(2),
      userId
    );
  } catch (error) {
    console.error('[Balance] 发送余额不足提醒失败:', error);
  }
}
