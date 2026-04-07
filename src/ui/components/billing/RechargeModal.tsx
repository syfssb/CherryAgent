import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
  cn,
} from '@/ui/components/ui';
import { useAuthStore } from '@/ui/store/useAuthStore';
import {
  useBillingStore,
  formatRMB,
  type RechargeOrder,
  type RechargeStatus,
} from '@/ui/store/useBillingStore';
import { apiClient, ApiError } from '@/ui/lib/api-client';
import { QRCodePayment } from './QRCodePayment';
import { formatDateTime, calculateDaysLeft } from '@/ui/utils/date';

/**
 * 折扣验证结果类型
 */
interface DiscountValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 折扣类型: percentage(百分比) 或 fixed(固定金额) */
  discountType: 'percentage' | 'fixed';
  /** 折扣值（百分比时为 0-100，固定金额时为分） */
  discountValue: number;
  /** 折扣金额（单位：分） */
  discountAmount: number;
  /** 最终金额（单位：分） */
  finalAmount: number;
  /** 提示信息 */
  message: string;
}

/**
 * RechargeModal 组件属性
 */
export interface RechargeModalProps {
  /** 是否打开模态框 */
  open: boolean;
  /** 关闭模态框回调 */
  onClose: () => void;
  /** 充值成功回调 */
  onSuccess?: () => void;
}

/**
 * 预设金额选项（单位：分）
 * 从大到小排列：1000元、500元、200元、100元、50元
 */
const PRESET_AMOUNTS = [100000, 50000, 20000, 10000, 5000];

/**
 * 支付渠道类型
 */
type PaymentChannel = 'stripe' | 'xunhu_wechat' | 'xunhu_alipay';

/**
 * 支付渠道选项
 */
interface ChannelOption {
  id: PaymentChannel;
  name: string;
  icon: React.ReactNode;
  description: string;
}

/**
 * 加载 Spinner 组件
 */
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/**
 * 信用卡图标
 */
function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

/**
 * 微信支付图标
 */
function WechatPayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89l-.004-.031-.402-.001zm-2.05 2.865c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" fill="#07C160"/>
    </svg>
  );
}

/**
 * 支付宝图标
 */
function AlipayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.424 16.45c-1.721-.658-3.392-1.358-5.009-2.098l-.165-.08-.21-.103c1.04-1.6 1.755-3.341 2.106-5.17H20V7h-6V5h-2v2H6v2h8.152a14.3 14.3 0 0 1-1.631 3.988c-.935-.416-1.94-.81-3.021-1.175-2.12-.72-4.267-.998-5.5-.583-1.232.416-2 1.333-2 2.667 0 1.333.768 2.5 2.5 3.333 1.732.834 3.964.667 5.5-.083.89-.434 1.727-1.043 2.488-1.808a41.136 41.136 0 0 0 4.178 1.925c1.344.543 2.66 1.012 3.934 1.408V24h2V0h-2v16.45zM6.5 16.5c-1.333 0-2-.5-2-1.167 0-.666.333-1.166 1.333-1.5 1-.333 2.667 0 4 .5.667.25 1.253.526 1.744.833C10.267 16.833 8.5 16.5 6.5 16.5z" fill="#1677FF"/>
    </svg>
  );
}

/**
 * 充值弹窗组件
 * 支持预设金额、自定义金额、多种支付方式
 */
/**
 * 期卡购买结果
 */
interface PeriodCardPurchaseResult {
  orderId: string;
  payUrl: string;
  qrcodeUrl?: string;
  plan: { id: string; name: string; priceCents: number; priceYuan: string };
}

type RechargeTab = 'recharge' | 'periodCard';
type PeriodCardPaymentType = 'wechat' | 'alipay' | 'stripe';

/**
 * 清洁套餐名称：移除 emoji 前缀，返回纯文字名称
 */
import { cleanPlanName, inferPlanTier, PlanTierIcon } from '@/ui/utils/planTier';

/**
 * 检查套餐名中是否包含"可叠加购买"标记
 */
function hasStackableTag(name: string): boolean {
  return /可叠加|stackable|叠加购买/i.test(name);
}

/**
 * 可叠加购买标签 — 替代 💰 emoji
 */
function StackableBadge({ className }: { className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium',
      'bg-[#788c5d14] text-[#788c5d]',
      className
    )}>
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
        <rect x="3" y="1" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <rect x="5" y="4" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path d="M6.5 8.5L8 10L11 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      可叠加
    </span>
  );
}

/**
 * 将管理员填写的套餐描述拆分为更易读的短句标签
 */
function splitPlanDescription(description: string | null | undefined): string[] {
  if (!description) return [];

  const normalized = description.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const punctuationSplit = normalized
    .split(/[，,。；;、|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (punctuationSplit.length > 1) {
    return punctuationSplit;
  }

  const keywordSplit = normalized
    .replace(/\s+(?=(有效期|每日0点|每日|每周|每月|重置|满足|适合|支持|赠送|可叠加|推荐|含))/g, '\n')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  if (keywordSplit.length > 1) {
    return keywordSplit;
  }

  return [normalized];
}

export function RechargeModal({ open, onClose, onSuccess }: RechargeModalProps) {
  const { t } = useTranslation();
  const fetchBalance = useAuthStore((s) => s.fetchBalance);
  const createRecharge = useBillingStore((s) => s.createRecharge);
  const cancelRecharge = useBillingStore((s) => s.cancelRecharge);
  const rechargeLoading = useBillingStore((s) => s.rechargeLoading);
  const rechargeError = useBillingStore((s) => s.rechargeError);
  const currentOrder = useBillingStore((s) => s.currentOrder);
  const clearRechargeError = useBillingStore((s) => s.clearRechargeError);
  const periodCards = useBillingStore((s) => s.periodCards);
  const periodCardPlans = useBillingStore((s) => s.periodCardPlans);
  const periodCardPlansLoading = useBillingStore((s) => s.periodCardPlansLoading);
  const fetchPeriodCard = useBillingStore((s) => s.fetchPeriodCard);
  const fetchPeriodCardPlans = useBillingStore((s) => s.fetchPeriodCardPlans);
  const pollPaymentStatus = useBillingStore((s) => s.pollPaymentStatus);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Tab 状态（默认期卡 tab）
  const [activeTab, setActiveTab] = useState<RechargeTab>('periodCard');

  // 充值状态
  const [selectedAmount, setSelectedAmount] = useState<number | null>(PRESET_AMOUNTS[0]);
  const [customAmount, setCustomAmount] = useState((PRESET_AMOUNTS[0] / 100).toString());
  const [selectedChannel, setSelectedChannel] = useState<PaymentChannel>('xunhu_wechat');
  const [step, setStep] = useState<'select' | 'payment'>('select');

  // 期卡购买状态
  const [pcSelectedPlan, setPcSelectedPlan] = useState<string | null>(null);
  const [pcPaymentType, setPcPaymentType] = useState<PeriodCardPaymentType>('wechat');
  const [pcPurchasing, setPcPurchasing] = useState(false);
  const [pcError, setPcError] = useState<string | null>(null);
  const [pcPurchaseResult, setPcPurchaseResult] = useState<PeriodCardPurchaseResult | null>(null);
  const pcOrderCreatedAtRef = useRef<number>(0);
  const rechargeSubmitLockRef = useRef(false);
  const periodCardSubmitLockRef = useRef(false);

  // 折扣码状态
  const [discountCode, setDiscountCode] = useState('');
  const [discountValidating, setDiscountValidating] = useState(false);
  const [discountResult, setDiscountResult] = useState<DiscountValidationResult | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);

  // 兑换码状态
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemValidating, setRedeemValidating] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ success: boolean; creditsAwarded: number; message: string; redeemType?: string } | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  /** 用于追踪上一次的 actualAmount，以便在金额变化时清除折扣结果 */
  const prevAmountRef = useRef<number>(0);
  /** 记录每个订单首次创建时间，避免轮询刷新时倒计时被重置 */
  const orderCreatedAtRef = useRef<Record<string, number>>({});

  /**
   * 获取或初始化订单创建时间
   */
  const getOrCreateOrderCreatedAt = useCallback((orderId: string): number => {
    const existingCreatedAt = orderCreatedAtRef.current[orderId];
    if (existingCreatedAt) {
      return existingCreatedAt;
    }
    const now = Date.now();
    orderCreatedAtRef.current[orderId] = now;
    return now;
  }, []);

  /**
   * 清理订单创建时间缓存
   */
  const clearOrderCreatedAt = useCallback((orderId?: string) => {
    if (!orderId) return;
    delete orderCreatedAtRef.current[orderId];
  }, []);

  /**
   * 弹窗打开时加载期卡数据
   */
  useEffect(() => {
    if (open && isAuthenticated) {
      fetchPeriodCard();
      fetchPeriodCardPlans();
    }
  }, [open, isAuthenticated, fetchPeriodCard, fetchPeriodCardPlans]);

  /**
   * 期卡选中的套餐信息
   */
  const pcSelectedPlanInfo = useMemo(() => {
    if (!pcSelectedPlan) return null;
    return periodCardPlans.find((p) => p.id === pcSelectedPlan) ?? null;
  }, [pcSelectedPlan, periodCardPlans]);

  /**
   * 默认选中第一个套餐
   */
  useEffect(() => {
    if (periodCardPlans.length > 0 && !pcSelectedPlan) {
      setPcSelectedPlan(periodCardPlans[0].id);
    }
  }, [periodCardPlans, pcSelectedPlan]);

  /**
   * 计算「最划算」套餐：省钱比例最高的
   * 官方价值 = 积分总量 × 0.1 元/积分
   */
  const bestValuePlanId = useMemo(() => {
    if (periodCardPlans.length === 0) return null;
    let bestId = '';
    let bestSavings = 0;
    for (const plan of periodCardPlans) {
      const creditsValue = plan.quotaMode === 'total'
        ? plan.totalCredits * 0.1
        : plan.dailyCredits * plan.periodDays * 0.1;
      const price = parseFloat(plan.priceYuan);
      const savings = creditsValue > 0 ? (creditsValue - price) / creditsValue * 100 : 0;
      if (savings > bestSavings) {
        bestSavings = savings;
        bestId = plan.id;
      }
    }
    return bestSavings > 10 ? bestId : null;
  }, [periodCardPlans]);

  /**
   * 期卡购买
   */
  const handlePcPurchase = useCallback(async () => {
    if (!pcSelectedPlan || periodCardSubmitLockRef.current) return;
    periodCardSubmitLockRef.current = true;
    setPcPurchasing(true);
    setPcError(null);

    try {
      if (pcPaymentType === 'stripe') {
        // Stripe: 通过 apiClient 创建 checkout session
        const response = await apiClient.post<{ orderId: string; sessionId: string; checkoutUrl: string }>(
          '/billing/purchase-period-card/stripe',
          { planId: pcSelectedPlan },
          { requireAuth: true }
        );
        if (response.success && response.data) {
          // 打开 Stripe checkout 页面
          await (window.electron?.billing as any)?.openExternalUrl?.(response.data.checkoutUrl);
          // 设置结果用于轮询
          setPcPurchaseResult({
            orderId: response.data.orderId,
            payUrl: response.data.checkoutUrl,
            plan: pcSelectedPlanInfo ? {
              id: pcSelectedPlanInfo.id,
              name: pcSelectedPlanInfo.name,
              priceCents: pcSelectedPlanInfo.priceCents,
              priceYuan: pcSelectedPlanInfo.priceYuan,
            } : { id: pcSelectedPlan, name: '', priceCents: 0, priceYuan: '0' },
          });
          pcOrderCreatedAtRef.current = Date.now();
          setStep('payment');
        } else {
          setPcError(typeof response.error === 'string' ? response.error : response.error?.message ?? t('periodCard.purchaseFailed'));
        }
      } else {
        // 虎皮椒: wechat / alipay
        const result = await window.electron?.billing?.purchasePeriodCard?.(pcSelectedPlan, pcPaymentType);
        if (result?.success && result.data) {
          const data = result.data as PeriodCardPurchaseResult;
          setPcPurchaseResult(data);
          pcOrderCreatedAtRef.current = Date.now();
          setStep('payment');
        } else {
          setPcError(typeof result?.error === 'string' ? result.error : result?.error?.message ?? t('periodCard.purchaseFailed'));
        }
      }
    } catch (err) {
      setPcError(err instanceof Error ? err.message : t('periodCard.purchaseFailed'));
    } finally {
      setPcPurchasing(false);
      periodCardSubmitLockRef.current = false;
    }
  }, [pcSelectedPlan, pcPaymentType, pcSelectedPlanInfo, t]);

  /**
   * 期卡 QRCodePayment 订单
   */
  const pcQrCodeOrder: RechargeOrder | null = useMemo(() => {
    if (!pcPurchaseResult) return null;
    const createdAt = pcOrderCreatedAtRef.current || Date.now();
    return {
      id: pcPurchaseResult.orderId,
      amount: pcPurchaseResult.plan.priceCents,
      currency: 'CNY',
      channel: pcPaymentType === 'wechat' ? 'xunhu_wechat' : 'xunhu_alipay',
      status: 'pending' as RechargeStatus,
      createdAt,
      expiresAt: createdAt + 5 * 60 * 1000,
      paymentUrl: pcPurchaseResult.payUrl,
      qrCodeUrl: pcPurchaseResult.qrcodeUrl,
    };
  }, [pcPurchaseResult, pcPaymentType]);

  /**
   * 期卡支付成功
   */
  const handlePcPaymentSuccess = useCallback(async () => {
    await fetchPeriodCard();
    await fetchBalance();
    setPcPurchaseResult(null);
    setPcSelectedPlan(null);
    setStep('select');
    onSuccess?.();
  }, [fetchPeriodCard, fetchBalance, onSuccess]);

  /**
   * 期卡支付失败
   */
  const handlePcPaymentFailed = useCallback(() => {
    setPcPurchaseResult(null);
    setStep('select');
  }, []);

  /**
   * 期卡支付返回
   */
  const handlePcBack = useCallback(() => {
    setPcPurchaseResult(null);
    setStep('select');
  }, []);

  /**
   * 期卡支付渠道
   */
  const pcPaymentChannels: { id: PeriodCardPaymentType; name: string; icon: React.ReactNode }[] = useMemo(() => [
    { id: 'wechat', name: t('payment.wechat'), icon: <WechatPayIcon className="h-5 w-5" /> },
    { id: 'alipay', name: t('payment.alipay'), icon: <AlipayIcon className="h-5 w-5" /> },
    { id: 'stripe', name: t('payment.creditCard'), icon: <CreditCardIcon className="h-5 w-5" /> },
  ], [t]);

  /**
   * 支付渠道选项
   */
  const channelOptions: ChannelOption[] = useMemo(() => [
    {
      id: 'xunhu_wechat',
      name: t('payment.wechat'),
      icon: <WechatPayIcon className="h-6 w-6" />,
      description: t('payment.wechatDescription', '使用微信扫码支付'),
    },
    {
      id: 'xunhu_alipay',
      name: t('payment.alipay'),
      icon: <AlipayIcon className="h-6 w-6" />,
      description: t('payment.alipayDescription', '使用支付宝扫码支付'),
    },
    {
      id: 'stripe',
      name: t('payment.creditCard'),
      icon: <CreditCardIcon className="h-6 w-6" />,
      description: t('payment.creditCardDescription', '支持 Visa、MasterCard 等国际卡'),
    },
  ], [t]);

  /**
   * 计算实际金额（单位：分）
   */
  const actualAmount = useMemo(() => {
    if (selectedAmount !== null) {
      return selectedAmount;
    }
    if (customAmount) {
      const parsed = parseFloat(customAmount);
      if (!isNaN(parsed) && parsed > 0) {
        return Math.round(parsed * 100); // 积分转分
      }
    }
    return 0;
  }, [selectedAmount, customAmount]);

  /**
   * 金额是否有效
   */
  const isAmountValid = useMemo(() => {
    return actualAmount >= 100; // 最低 1 积分
  }, [actualAmount]);

  /**
   * 最终支付金额（考虑折扣）
   */
  const finalPayAmount = useMemo(() => {
    if (discountResult?.valid) {
      return discountResult.finalAmount;
    }
    return actualAmount;
  }, [actualAmount, discountResult]);

  /**
   * 金额变化时清除折扣验证结果
   */
  useEffect(() => {
    if (prevAmountRef.current !== 0 && prevAmountRef.current !== actualAmount) {
      setDiscountResult(null);
      setDiscountError(null);
    }
    prevAmountRef.current = actualAmount;
  }, [actualAmount]);

  /**
   * 处理预设金额选择
   */
  const handlePresetSelect = useCallback((amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount((amount / 100).toString());
    clearRechargeError();
  }, [clearRechargeError]);

  /**
   * 处理自定义金额变化
   */
  const handleCustomAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // 只允许数字和小数点
    if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
      setCustomAmount(value);
      setSelectedAmount(null);
      clearRechargeError();
    }
  }, [clearRechargeError]);

  /**
   * 处理支付渠道选择
   */
  const handleChannelSelect = useCallback((channel: PaymentChannel) => {
    setSelectedChannel(channel);
    clearRechargeError();
  }, [clearRechargeError]);

  /**
   * 验证折扣码
   */
  const handleValidateDiscount = useCallback(async () => {
    if (!discountCode.trim() || !isAmountValid) return;

    setDiscountValidating(true);
    setDiscountError(null);
    setDiscountResult(null);

    try {
      const response = await apiClient.post<DiscountValidationResult>(
        '/billing/discount/validate',
        { code: discountCode.trim(), amount: actualAmount },
        { requireAuth: true }
      );

      if (!response.success || !response.data) {
        setDiscountError(response.error || t('payment.discount.validateFailed', '折扣码验证失败'));
        return;
      }

      if (response.data.valid) {
        setDiscountResult(response.data);
        setDiscountError(null);
      } else {
        setDiscountError(response.data.message || t('payment.discount.invalid', '折扣码无效'));
        setDiscountResult(null);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setDiscountError(error.message);
      } else {
        setDiscountError(t('payment.discount.validateFailed', '折扣码验证失败'));
      }
      setDiscountResult(null);
    } finally {
      setDiscountValidating(false);
    }
  }, [discountCode, isAmountValid, actualAmount, t]);

  /**
   * 清除折扣码
   */
  const handleClearDiscount = useCallback(() => {
    setDiscountCode('');
    setDiscountResult(null);
    setDiscountError(null);
  }, []);

  /**
   * 兑换码兑换
   */
  const handleRedeem = useCallback(async () => {
    if (!redeemCode.trim()) return;

    setRedeemValidating(true);
    setRedeemError(null);
    setRedeemResult(null);

    try {
      const response = await apiClient.post<{ success: boolean; creditsAwarded: number; message: string; redeemType?: string }>(
        '/billing/redeem',
        { code: redeemCode.trim() },
        { requireAuth: true }
      );

      if (!response.success || !response.data) {
        setRedeemError(response.error || t('payment.redeem.failed', '兑换失败'));
        return;
      }

      if (response.data.success) {
        setRedeemResult(response.data);
        setRedeemError(null);
        // 按 redeemType 分别刷新
        if (response.data.redeemType === 'period_card') {
          await fetchPeriodCard();
        }
        await fetchBalance();
      } else {
        setRedeemError(response.data.message || t('payment.redeem.failed', '兑换失败'));
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setRedeemError(error.message);
      } else {
        setRedeemError(t('payment.redeem.failed', '兑换失败'));
      }
    } finally {
      setRedeemValidating(false);
    }
  }, [redeemCode, t, fetchBalance, fetchPeriodCard]);

  /**
   * 清除兑换码
   */
  const handleClearRedeem = useCallback(() => {
    setRedeemCode('');
    setRedeemResult(null);
    setRedeemError(null);
  }, []);

  /**
   * 提交充值
   */
  const handleSubmit = useCallback(async () => {
    if (!isAmountValid || rechargeSubmitLockRef.current) return;
    rechargeSubmitLockRef.current = true;

    try {
      const validatedDiscountCode = discountResult?.valid ? discountCode.trim() : undefined;
      const order = await createRecharge(finalPayAmount, selectedChannel, validatedDiscountCode);

      if (selectedChannel === 'stripe' && order.paymentUrl) {
        // Stripe 跳转到支付页面
        await (window.electron?.billing as any)?.openExternalUrl?.(order.paymentUrl);
        // 开始轮询状态
        setStep('payment');
      } else {
        // 虎皮椒显示二维码
        setStep('payment');
      }
    } catch {
      // 错误已在 store 中处理
    } finally {
      rechargeSubmitLockRef.current = false;
    }
  }, [isAmountValid, finalPayAmount, selectedChannel, discountResult, discountCode, createRecharge]);

  /**
   * 关闭弹窗（必须在 handlePaymentSuccess 之前定义，避免 TDZ）
   */
  const handleClose = useCallback(() => {
    clearOrderCreatedAt(currentOrder?.orderId);
    setStep('select');
    setActiveTab('periodCard');
    setSelectedAmount(PRESET_AMOUNTS[0]);
    setCustomAmount((PRESET_AMOUNTS[0] / 100).toString());
    setSelectedChannel('xunhu_wechat');
    setDiscountCode('');
    setDiscountResult(null);
    setDiscountError(null);
    setRedeemCode('');
    setRedeemResult(null);
    setRedeemError(null);
    setPcSelectedPlan(null);
    setPcPaymentType('wechat');
    setPcError(null);
    setPcPurchaseResult(null);
    cancelRecharge();
    clearRechargeError();
    onClose();
  }, [cancelRecharge, clearOrderCreatedAt, clearRechargeError, currentOrder?.orderId, onClose]);

  /**
   * 支付成功处理
   */
  const handlePaymentSuccess = useCallback(async () => {
    await fetchBalance(true);
    onSuccess?.();
    handleClose();
  }, [fetchBalance, onSuccess, handleClose]);

  /**
   * 支付失败处理
   */
  const handlePaymentFailed = useCallback(() => {
    clearOrderCreatedAt(currentOrder?.orderId);
    setStep('select');
    cancelRecharge();
  }, [cancelRecharge, clearOrderCreatedAt, currentOrder?.orderId]);

  /**
   * 将 currentOrder (RechargeResult) 转换为 QRCodePayment 需要的 RechargeOrder 格式
   */
  const qrCodeOrder: import('@/ui/store/useBillingStore').RechargeOrder | null = useMemo(() => {
    if (!currentOrder) return null;
    const createdAt = getOrCreateOrderCreatedAt(currentOrder.orderId);
    return {
      id: currentOrder.orderId,
      amount: finalPayAmount,
      currency: 'CNY',
      channel: selectedChannel,
      status: currentOrder.status ?? 'pending',
      createdAt,
      expiresAt: createdAt + 5 * 60 * 1000,
      paymentUrl: currentOrder.paymentUrl ?? currentOrder.url,
      qrCodeUrl: currentOrder.qrcodeUrl,
    };
  }, [currentOrder, finalPayAmount, selectedChannel, getOrCreateOrderCreatedAt]);

  /**
   * Stripe 积分充值轮询
   */
  useEffect(() => {
    if (step !== 'payment' || activeTab !== 'recharge' || selectedChannel !== 'stripe' || !currentOrder) return;

    const timer = setInterval(async () => {
      try {
        const status = await pollPaymentStatus(currentOrder.orderId);
        if (status === 'paid' || status === 'succeeded') {
          clearInterval(timer);
          handlePaymentSuccess();
        } else if (
          status === 'failed'
          || status === 'expired'
          || status === 'cancelled'
          || status === 'needs_review'
          || status === 'refunded'
        ) {
          clearInterval(timer);
          handlePaymentFailed();
        }
      } catch {
        // 轮询失败，继续尝试
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [step, activeTab, selectedChannel, currentOrder, pollPaymentStatus, handlePaymentSuccess, handlePaymentFailed]);

  /**
   * Stripe 期卡购买轮询
   */
  useEffect(() => {
    if (step !== 'payment' || activeTab !== 'periodCard' || pcPaymentType !== 'stripe' || !pcPurchaseResult) return;

    const timer = setInterval(async () => {
      try {
        const status = await pollPaymentStatus(pcPurchaseResult.orderId);
        if (status === 'paid' || status === 'succeeded') {
          clearInterval(timer);
          handlePcPaymentSuccess();
        } else if (
          status === 'failed'
          || status === 'expired'
          || status === 'cancelled'
          || status === 'needs_review'
          || status === 'refunded'
        ) {
          clearInterval(timer);
          handlePcPaymentFailed();
        }
      } catch {
        // 轮询失败，继续尝试
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [step, activeTab, pcPaymentType, pcPurchaseResult, pollPaymentStatus, handlePcPaymentSuccess, handlePcPaymentFailed]);

  /**
   * 返回选择步骤
   */
  const handleBack = useCallback(() => {
    clearOrderCreatedAt(currentOrder?.orderId);
    setStep('select');
    cancelRecharge();
  }, [cancelRecharge, clearOrderCreatedAt, currentOrder?.orderId]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[540px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden bg-surface-cream dark:bg-[#2b2a27] rounded-2xl border border-[#1414130d] dark:border-[#faf9f50d] shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-0">

        {/* 顶部标题区 — 固定 */}
        <div className="px-6 pt-6 pb-4 shrink-0">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-semibold text-ink-900 tracking-tight">{t('payment.rechargeCenter', '充值中心')}</DialogTitle>
            <DialogDescription className="text-[13px] text-[#87867f] mt-1">
              {step === 'select'
                ? (activeTab === 'recharge' ? t('payment.selectAmount') : t('periodCard.selectPlan', '选择适合你的套餐'))
                : t('payment.completePayment', '请完成支付')}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* 可滚动中间区域 */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

        {/* 选择步骤 */}
        {step === 'select' && (
          <div className="px-6 pb-6">
            {/* Tab 切换 — 胶囊分段控制器 */}
            <div className="flex rounded-xl bg-[#f0eee6] dark:bg-[#faf9f50a] p-1 gap-0.5 mb-5 mt-2 overflow-visible">
              <button
                onClick={() => setActiveTab('periodCard')}
                className={cn(
                  'flex-1 rounded-[10px] py-2.5 px-4 text-[13px] font-medium transition-all duration-200 relative outline-none',
                  activeTab === 'periodCard'
                    ? 'bg-white dark:bg-[#3d3d3a] text-[#141413] dark:text-[#faf9f5] shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
                    : 'text-[#87867f] hover:text-[#141413] dark:text-[#9a9893] dark:hover:text-[#faf9f5]'
                )}
              >
                {t('payment.tabPeriodCard', '期卡套餐')}
                {periodCards.length === 0 && (
                  <span className="absolute -top-1.5 -right-0.5 inline-flex items-center rounded-full bg-[#ae5630] px-1.5 py-px text-[9px] font-semibold text-white leading-none">
                    HOT
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('recharge')}
                className={cn(
                  'flex-1 rounded-[10px] py-2.5 px-4 text-[13px] font-medium transition-all duration-200 outline-none',
                  activeTab === 'recharge'
                    ? 'bg-white dark:bg-[#3d3d3a] text-[#141413] dark:text-[#faf9f5] shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
                    : 'text-[#87867f] hover:text-[#141413] dark:text-[#9a9893] dark:hover:text-[#faf9f5]'
                )}
              >
                {t('payment.tabRecharge', '积分充值')}
              </button>
            </div>

            {/* ===== 期卡套餐 Tab ===== */}
            {activeTab === 'periodCard' && (
              <div className="space-y-5">
                {/* 活跃期卡 — 紧凑横幅 */}
                {periodCards.length > 0 && (
                  <div className="space-y-2">
                    {periodCards.map((card) => {
                      const isTotal = card.quotaMode === 'total';
                      const pct = isTotal
                        ? (card.totalCredits > 0 ? Math.min(100, (card.totalRemaining / card.totalCredits) * 100) : 0)
                        : (card.dailyCredits > 0 ? Math.min(100, (card.dailyQuotaRemaining / card.dailyCredits) * 100) : 0);
                      const daysLeft = calculateDaysLeft(card.expiresAt);
                      const isLow = pct < 20;
                      return (
                        <div
                          key={card.id}
                          className="rounded-2xl bg-white dark:bg-[#3d3d3a] border border-[#1414130d] dark:border-[#faf9f50d] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-[#788c5d14] px-2 py-0.5 text-[10px] font-medium text-[#788c5d]">
                                <span className="w-1 h-1 rounded-full bg-[#788c5d] inline-block" />
                                {t('periodCard.active', '生效中')}
                              </span>
                              <span className="text-[13px] font-medium text-[#141413] dark:text-[#faf9f5] truncate flex items-center gap-1.5">
                                <PlanTierIcon tier={inferPlanTier(card.planName)} className="w-4 h-4 shrink-0" />
                                {cleanPlanName(card.planName)}
                              </span>
                            </div>
                            <span className="text-[12px] font-semibold text-[#141413] dark:text-[#faf9f5] tabular-nums shrink-0 ml-2">
                              {isTotal
                                ? `${card.totalRemaining.toFixed(1)}/${card.totalCredits.toFixed(1)}`
                                : `${card.dailyQuotaRemaining.toFixed(1)}/${card.dailyCredits.toFixed(1)}`
                              }
                            </span>
                          </div>
                          {/* 进度条 */}
                          <div className="h-1.5 rounded-full bg-[#f0eee6] dark:bg-[#faf9f514] overflow-hidden mb-1.5">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                isLow ? 'bg-[#D97706]' : 'bg-[#ae5630]'
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[#b0aea5]">
                            <span>{formatDateTime(card.startsAt)} ~ {formatDateTime(card.expiresAt)}</span>
                            <span className="tabular-nums">{t('periodCard.daysLeft', '剩余 {{days}} 天', { days: daysLeft })}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 套餐选择 */}
                {periodCardPlansLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner className="h-5 w-5 text-[#b0aea5]" />
                  </div>
                ) : periodCardPlans.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#1414131a] dark:border-[#faf9f51a] p-8 text-center">
                    <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#1414130a] dark:bg-[#faf9f50a] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#b0aea5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></svg>
                    </div>
                    <p className="text-sm text-[#87867f]">{t('periodCard.noPlan', '暂无可用套餐')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {periodCardPlans.map((plan, planIndex) => {
                      const isTotal = plan.quotaMode === 'total';
                      const descriptionTags = splitPlanDescription(plan.description).slice(0, 3);
                      const isBestValue = plan.id === bestValuePlanId;
                      const isSelected = pcSelectedPlan === plan.id;

                      const creditsValue = isTotal
                        ? plan.totalCredits * 0.1
                        : plan.dailyCredits * plan.periodDays * 0.1;
                      const priceNum = parseFloat(plan.priceYuan);
                      const savingsPercent = creditsValue > 0
                        ? Math.round((creditsValue - priceNum) / creditsValue * 100)
                        : 0;

                      return (
                        <button
                          key={plan.id}
                          onClick={() => { setPcSelectedPlan(plan.id); setPcError(null); }}
                          className={cn(
                            'w-full text-left rounded-2xl border-2 transition-all duration-200 relative overflow-hidden group/card',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630]/40 focus-visible:ring-offset-2',
                            'active:scale-[0.99]',
                            isSelected
                              ? 'border-[#ae5630] bg-white dark:bg-[#3d3d3a] dark:border-[#d97757] shadow-[0_2px_8px_rgba(174,86,48,0.12)] dark:shadow-none'
                              : isBestValue
                                ? 'border-[#ae563040] bg-white dark:bg-[#3d3d3a] dark:border-[#d9775740] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] dark:shadow-none'
                                : 'border-[#1414130d] bg-white dark:bg-[#3d3d3a] dark:border-[#faf9f51a] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] dark:shadow-none hover:border-[#14141320] dark:hover:border-[#faf9f533]'
                          )}
                        >
                          {/* 最划算 — 角标 */}
                          {isBestValue && (
                            <div className="absolute top-0 right-0">
                              <div className="bg-[#ae5630] text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                                {t('periodCard.bestValue', '最划算')}
                              </div>
                            </div>
                          )}

                          <div className="p-4">
                            {/* 套餐名 + 选中状态 */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2.5">
                                {/* 选中圆点 */}
                                <div className={cn(
                                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
                                  isSelected
                                    ? 'border-[#ae5630] bg-[#ae5630]'
                                    : 'border-[#d0cfc9] dark:border-[#5a5a57] group-hover/card:border-[#ae563080]'
                                )}>
                                  {isSelected && (
                                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M2.5 6l2.5 2.5 4.5-5" />
                                    </svg>
                                  )}
                                </div>
                                <PlanTierIcon tier={inferPlanTier(plan.name)} className="w-5 h-5 shrink-0" />
                                <h3 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]">
                                  {cleanPlanName(plan.name)}
                                </h3>
                                {hasStackableTag(plan.name) && <StackableBadge />}
                                {savingsPercent > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ae563014] text-[#ae5630]">
                                    {t('periodCard.bonusPercent', '附赠{{percent}}%', { percent: savingsPercent })}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 价格行 */}
                            <div className="flex items-baseline justify-between mb-3 pl-[30px]">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[11px] text-[#87867f] self-start mt-1">¥</span>
                                <span className="text-[28px] font-bold text-[#141413] dark:text-[#faf9f5] tracking-tight tabular-nums leading-none">
                                  {plan.priceYuan}
                                </span>
                                {savingsPercent > 0 && (
                                  <span className="text-[13px] text-[#b0aea5] line-through tabular-nums ml-1">
                                    ¥{creditsValue.toFixed(0)}
                                  </span>
                                )}
                              </div>
                              {savingsPercent > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#d9775714] text-[#c6613f] dark:bg-[#d9775720] dark:text-[#d97757] tabular-nums">
                                  {t('periodCard.discountAmount', '优惠 ¥{{amount}}', { amount: (creditsValue - priceNum).toFixed(0) })}
                                </span>
                              )}
                            </div>

                            {/* 分隔线 */}
                            <div className="h-px bg-[#1414130a] dark:bg-[#faf9f50a] mb-3 ml-[30px]" />

                            {/* 功能标签 */}
                            <div className="flex items-center gap-1.5 flex-wrap pl-[30px]">
                              <span className="inline-flex items-center px-2 py-[3px] rounded-md text-[10px] font-medium bg-[#f0eee6] dark:bg-[#faf9f50a] text-[#6b6a68] dark:text-[#9a9893]">
                                {isTotal
                                  ? `${plan.totalCredits.toFixed(0)} ${t('periodCard.totalCreditsLabel', '总额度')}`
                                  : `${plan.dailyCredits.toFixed(0)} ${t('periodCard.dailyCredits', '积分')}${t('periodCard.perDay', '/天')}`
                                }
                              </span>
                              <span className="inline-flex items-center px-2 py-[3px] rounded-md text-[10px] font-medium bg-[#f0eee6] dark:bg-[#faf9f50a] text-[#6b6a68] dark:text-[#9a9893]">
                                {plan.periodDays}{t('periodCard.dayUnit', '天')}
                              </span>
                              {isTotal && (
                                <span className="inline-flex items-center px-2 py-[3px] rounded-md text-[10px] font-medium bg-[#f0eee6] dark:bg-[#faf9f50a] text-[#6b6a68] dark:text-[#9a9893]">
                                  {t('periodCard.noDaily', '不限每日用量')}
                                </span>
                              )}
                              {descriptionTags.map((tag, index) => (
                                <span
                                  key={`${plan.id}-tag-${index}`}
                                  className="inline-flex items-center px-2 py-[3px] rounded-md text-[10px] font-medium bg-[#f0eee6] dark:bg-[#faf9f50a] text-[#6b6a68] dark:text-[#9a9893]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 兑换码 — 折叠式 */}
                <div className="space-y-2">
                  <label htmlFor="redeem-code-pc" className="text-[11px] font-medium uppercase tracking-wider text-[#87867f]">
                    {t('payment.redeem.label', '兑换码')}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="redeem-code-pc"
                        type="text"
                        placeholder={t('payment.redeem.placeholderGeneric', '输入兑换码兑换积分或期卡')}
                        value={redeemCode}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setRedeemCode(e.target.value.toUpperCase());
                          if (redeemResult) setRedeemResult(null);
                          if (redeemError) setRedeemError(null);
                        }}
                        disabled={redeemValidating}
                        className={cn(
                          'border border-[#1414131a] dark:border-[#faf9f51a] rounded-xl bg-white dark:bg-[#3d3d3a] placeholder:text-[#b0aea5] h-10',
                          redeemResult?.success && 'border-[#16A34A]/50',
                          redeemError && 'border-[#DC2626]/50'
                        )}
                      />
                      {redeemResult?.success && (
                        <button type="button" onClick={handleClearRedeem} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b0aea5] hover:text-[#141413] transition-colors" aria-label={t('payment.redeem.clear', '清除兑换码')}>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    {redeemCode.trim() && !redeemResult?.success && (
                      <Button variant="outline" onClick={handleRedeem} disabled={redeemValidating} className="shrink-0 rounded-xl h-10">
                        {redeemValidating ? <><LoadingSpinner className="h-3.5 w-3.5 mr-1.5" />{t('payment.redeem.redeeming', '兑换中')}</> : t('payment.redeem.submit', '兑换')}
                      </Button>
                    )}
                  </div>
                  {redeemResult?.success && (
                    <div className="rounded-xl border border-[#16A34A]/20 bg-[#DCFCE7] dark:bg-[rgba(52,211,153,0.18)] px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-[#16A34A] dark:text-[#34D399] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                        <span className="text-sm font-medium text-[#16A34A] dark:text-[#34D399]">{redeemResult.message || t('payment.redeem.success', '兑换成功，已获得 {{amount}} 积分', { amount: redeemResult.creditsAwarded })}</span>
                      </div>
                    </div>
                  )}
                  {redeemError && (
                    <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-[#DC2626] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        <span className="text-sm text-[#DC2626]">{redeemError}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 错误提示 */}
                {pcError && (
                  <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 px-4 py-3">
                    <p className="text-sm text-[#DC2626]">{pcError}</p>
                  </div>
                )}
              </div>
            )}

            {/* ===== 积分充值 Tab ===== */}
            {activeTab === 'recharge' && (
              <div className="space-y-5">
                {/* 活跃期卡提示 */}
                {periodCards.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('periodCard')}
                    className="w-full rounded-2xl bg-[#ae563008] border border-[#ae563020] p-3.5 text-left transition-all hover:bg-[#ae563010] hover:border-[#ae563040] group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center rounded-full bg-[#ae563014] px-2 py-0.5 text-[10px] font-bold text-[#ae5630]">
                        {t('periodCard.promoBanner.limitedOffer', '限时优惠')}
                      </span>
                      <span className="text-[13px] font-medium text-[#141413] dark:text-[#faf9f5]">
                        {t('periodCard.promoBanner.title', '期卡套餐更划算')}
                      </span>
                      <svg className="h-4 w-4 text-[#ae5630] ml-auto opacity-50 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>
                    <p className="text-[12px] text-[#87867f] pl-0.5">
                      {t('periodCard.promoBanner.subtitle', '按月发放总额度，用完再扣余额，省心又省钱')}
                    </p>
                  </button>
                )}

                {/* 预设金额 — 网格卡片 */}
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#87867f] mb-2.5">
                    {t('payment.selectAmount')}
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {PRESET_AMOUNTS.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => handlePresetSelect(amount)}
                        className={cn(
                          'py-3 rounded-xl border-2 text-center transition-all duration-200',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630]/40 focus-visible:ring-offset-1',
                          'active:scale-[0.97]',
                          selectedAmount === amount
                            ? 'border-[#ae5630] bg-white dark:bg-[#3d3d3a] dark:border-[#d97757] shadow-[0_2px_8px_rgba(174,86,48,0.12)] dark:shadow-none'
                            : 'border-[#1414130d] bg-white dark:bg-[#3d3d3a] dark:border-[#faf9f51a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none hover:border-[#14141320] dark:hover:border-[#faf9f533]'
                        )}
                      >
                        <span className="text-[18px] font-bold text-[#141413] dark:text-[#faf9f5] tabular-nums">{amount / 100}</span>
                        <span className="text-[11px] text-[#87867f] ml-0.5">元</span>
                        <p className="text-[10px] text-[#b0aea5] mt-0.5 tabular-nums">
                          {amount / 10} {t('payment.credits', '积分')}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 自定义金额 */}
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#87867f] mb-2">
                    {t('payment.customAmount')}
                  </p>
                  <div className="relative">
                    <Input
                      id="custom-amount"
                      type="text"
                      inputMode="decimal"
                      placeholder={t('payment.customAmountPlaceholder')}
                      value={customAmount}
                      onChange={handleCustomAmountChange}
                      className="pr-12 border border-[#1414131a] dark:border-[#faf9f51a] rounded-xl bg-white dark:bg-[#3d3d3a] placeholder:text-[#b0aea5] h-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#87867f] text-[12px] font-medium">元</span>
                  </div>
                  {customAmount && !isAmountValid && (
                    <p className="text-[12px] text-[#DC2626] mt-1.5">{t('payment.minimumAmount', '最低充值金额为 1 元')}</p>
                  )}
                </div>

                {/* 折扣码 */}
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#87867f] mb-2">
                    {t('payment.discount.label', '折扣码')}
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="discount-code"
                        type="text"
                        placeholder={t('payment.discount.placeholder', '输入折扣码（可选）')}
                        value={discountCode}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setDiscountCode(e.target.value);
                          if (discountResult) setDiscountResult(null);
                          if (discountError) setDiscountError(null);
                        }}
                        disabled={discountValidating}
                        className={cn(
                          'border border-[#1414131a] dark:border-[#faf9f51a] rounded-xl bg-white dark:bg-[#3d3d3a] placeholder:text-[#b0aea5] h-10',
                          discountResult?.valid && 'border-[#16A34A]/50',
                          discountError && 'border-[#DC2626]/50'
                        )}
                      />
                      {discountResult?.valid && (
                        <button type="button" onClick={handleClearDiscount} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b0aea5] hover:text-[#141413] transition-colors" aria-label={t('payment.discount.clear', '清除折扣码')}>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    {discountCode.trim() && !discountResult?.valid && (
                      <Button variant="outline" onClick={handleValidateDiscount} disabled={discountValidating || !isAmountValid} className="shrink-0 rounded-xl h-10">
                        {discountValidating ? <><LoadingSpinner className="h-3.5 w-3.5 mr-1.5" />{t('payment.discount.validating', '验证中')}</> : t('payment.discount.validate', '验证')}
                      </Button>
                    )}
                  </div>
                  {discountResult?.valid && (
                    <div className="rounded-xl border border-[#16A34A]/20 bg-[#DCFCE7] dark:bg-[rgba(52,211,153,0.18)] px-3 py-2 mt-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <svg className="h-4 w-4 text-[#16A34A] dark:text-[#34D399] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                        <span className="text-sm font-medium text-[#16A34A] dark:text-[#34D399]">{discountResult.message || t('payment.discount.applied', '折扣码已应用')}</span>
                      </div>
                      <div className="text-[12px] text-[#87867f] pl-[22px] space-y-0.5">
                        <p>{discountResult.discountType === 'percentage' ? t('payment.discount.percentOff', '折扣: {{value}}% off', { value: discountResult.discountValue }) : t('payment.discount.fixedOff', '优惠: {{value}}', { value: formatRMB(discountResult.discountValue) })}</p>
                        <p>{t('payment.discount.savedAmount', '节省: {{amount}}', { amount: formatRMB(discountResult.discountAmount) })}</p>
                      </div>
                    </div>
                  )}
                  {discountError && (
                    <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 px-3 py-2 mt-2">
                      <div className="flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-[#DC2626] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        <span className="text-sm text-[#DC2626]">{discountError}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 兑换码 */}
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#87867f] mb-2">
                    {t('payment.redeem.label', '兑换码')}
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="redeem-code"
                        type="text"
                        placeholder={t('payment.redeem.placeholder', '输入兑换码直接获得积分')}
                        value={redeemCode}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setRedeemCode(e.target.value.toUpperCase());
                          if (redeemResult) setRedeemResult(null);
                          if (redeemError) setRedeemError(null);
                        }}
                        disabled={redeemValidating}
                        className={cn(
                          'border border-[#1414131a] dark:border-[#faf9f51a] rounded-xl bg-white dark:bg-[#3d3d3a] placeholder:text-[#b0aea5] h-10',
                          redeemResult?.success && 'border-[#16A34A]/50',
                          redeemError && 'border-[#DC2626]/50'
                        )}
                      />
                      {redeemResult?.success && (
                        <button type="button" onClick={handleClearRedeem} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b0aea5] hover:text-[#141413] transition-colors" aria-label={t('payment.redeem.clear', '清除兑换码')}>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    {redeemCode.trim() && !redeemResult?.success && (
                      <Button variant="outline" onClick={handleRedeem} disabled={redeemValidating} className="shrink-0 rounded-xl h-10">
                        {redeemValidating ? <><LoadingSpinner className="h-3.5 w-3.5 mr-1.5" />{t('payment.redeem.redeeming', '兑换中')}</> : t('payment.redeem.submit', '兑换')}
                      </Button>
                    )}
                  </div>
                  {redeemResult?.success && (
                    <div className="rounded-xl border border-[#16A34A]/20 bg-[#DCFCE7] dark:bg-[rgba(52,211,153,0.18)] px-3 py-2 mt-2">
                      <div className="flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-[#16A34A] dark:text-[#34D399] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                        <span className="text-sm font-medium text-[#16A34A] dark:text-[#34D399]">{redeemResult.message || t('payment.redeem.success', '兑换成功，已获得 {{amount}} 积分', { amount: redeemResult.creditsAwarded })}</span>
                      </div>
                    </div>
                  )}
                  {redeemError && (
                    <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 px-3 py-2 mt-2">
                      <div className="flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-[#DC2626] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        <span className="text-sm text-[#DC2626]">{redeemError}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 错误提示 */}
                {rechargeError && (
                  <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 px-4 py-3">
                    <p className="text-sm text-[#DC2626]">{rechargeError}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 支付步骤 — 积分充值 */}
        {step === 'payment' && activeTab === 'recharge' && currentOrder && (
          <div className="px-6 pb-6">
            {selectedChannel === 'stripe' ? (
              <div className="flex flex-col items-center py-8">
                <LoadingSpinner className="h-12 w-12 text-[#ae5630] mb-4" />
                <h3 className="text-lg font-semibold text-[#141413] dark:text-[#faf9f5] mb-2">
                  {t('payment.waitingForPayment', '正在等待支付...')}
                </h3>
                <p className="text-sm text-[#87867f] mb-2 text-center">
                  {t('payment.paymentWindowOpened', '已在新窗口打开支付页面，请在该页面完成支付')}
                </p>
                <div className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-[#3d3d3a] rounded-full shadow-sm border border-[#1414130d] mb-4">
                  <LoadingSpinner className="h-3 w-3 text-[#ae5630]" />
                  <span className="text-xs text-[#87867f]">{t('payment.polling', '检测中')}</span>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleBack} className="rounded-xl">{t('common.back', '返回')}</Button>
                  <Button onClick={() => currentOrder.paymentUrl && (window.electron?.billing as any)?.openExternalUrl?.(currentOrder.paymentUrl)} className="rounded-xl">
                    {t('payment.reopenPaymentPage', '重新打开支付页面')}
                  </Button>
                </div>
              </div>
            ) : qrCodeOrder ? (
              <QRCodePayment order={qrCodeOrder} onSuccess={handlePaymentSuccess} onFailed={handlePaymentFailed} onCancel={handleBack} />
            ) : null}
          </div>
        )}

        {/* 支付步骤 — 期卡购买 */}
        {step === 'payment' && activeTab === 'periodCard' && pcPurchaseResult && (
          <div className="px-6 pb-6">
            {pcPaymentType === 'stripe' ? (
              <div className="flex flex-col items-center py-8">
                <LoadingSpinner className="h-12 w-12 text-[#ae5630] mb-4" />
                <h3 className="text-lg font-semibold text-[#141413] dark:text-[#faf9f5] mb-2">
                  {t('payment.waitingForPayment', '正在等待支付...')}
                </h3>
                <p className="text-sm text-[#87867f] mb-2 text-center">
                  {t('payment.paymentWindowOpened', '已在新窗口打开支付页面，请在该页面完成支付')}
                </p>
                <div className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-[#3d3d3a] rounded-full shadow-sm border border-[#1414130d] mb-4">
                  <LoadingSpinner className="h-3 w-3 text-[#ae5630]" />
                  <span className="text-xs text-[#87867f]">{t('payment.polling', '检测中')}</span>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handlePcBack} className="rounded-xl">{t('common.back', '返回')}</Button>
                  <Button onClick={() => pcPurchaseResult.payUrl && (window.electron?.billing as any)?.openExternalUrl?.(pcPurchaseResult.payUrl)} className="rounded-xl">
                    {t('payment.reopenPaymentPage', '重新打开支付页面')}
                  </Button>
                </div>
              </div>
            ) : pcQrCodeOrder ? (
              <QRCodePayment order={pcQrCodeOrder} onSuccess={handlePcPaymentSuccess} onFailed={handlePcPaymentFailed} onCancel={handlePcBack} />
            ) : null}
          </div>
        )}

        </div>{/* 滚动区域结束 */}

        {/* 底部渐变提示 + 固定操作栏 — 仅在选择步骤显示 */}
        {step === 'select' && (
          <>
            {/* 底部渐变遮罩 — 提示可滚动 */}
            <div className="pointer-events-none h-6 -mt-6 relative z-10 bg-gradient-to-t from-[#faf9f5] dark:from-[#2b2a27] to-transparent shrink-0" />

            {/* 固定底部操作栏 */}
            {activeTab === 'periodCard' && periodCardPlans.length > 0 && (
              <div className="shrink-0 px-6 py-3 border-t border-[#1414130d] dark:border-[#faf9f50d] bg-surface-cream dark:bg-[#2b2a27] space-y-3">
                {/* 支付方式 — 内嵌胶囊 */}
                {pcSelectedPlan && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#87867f] shrink-0">{t('payment.paymentMethod')}</span>
                    <div className="inline-flex items-center rounded-lg bg-[#f0eee6] dark:bg-[#faf9f50a] p-0.5 gap-0.5">
                      {pcPaymentChannels.map((ch) => (
                        <button
                          key={ch.id}
                          onClick={() => { setPcPaymentType(ch.id); setPcError(null); }}
                          className={cn(
                            'flex items-center gap-1 rounded-md px-2.5 py-1.5 transition-all duration-200',
                            'text-[12px] font-medium',
                            pcPaymentType === ch.id
                              ? 'bg-white dark:bg-[#3d3d3a] text-[#141413] dark:text-[#faf9f5] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                              : 'text-[#87867f] hover:text-[#141413] dark:hover:text-[#faf9f5]'
                          )}
                        >
                          {ch.icon}
                          <span>{ch.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* 金额 + 按钮 */}
                <div className="flex items-center justify-between">
                  {pcSelectedPlanInfo ? (
                    <div>
                      <p className="text-[11px] text-[#87867f] mb-0.5">{t('payment.rechargeAmountLabel', '支付金额')}</p>
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-[11px] text-[#87867f]">¥</span>
                        <span className="text-[22px] font-bold text-[#141413] dark:text-[#faf9f5] tracking-tight tabular-nums leading-none">
                          {pcSelectedPlanInfo.priceYuan}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div />
                  )}
                  <button
                    onClick={handlePcPurchase}
                    disabled={!pcSelectedPlan || pcPurchasing}
                    className={cn(
                      'inline-flex items-center justify-center gap-2',
                      'bg-[#141413] dark:bg-[#faf9f5] text-white dark:text-[#141413]',
                      'hover:bg-[#3d3d3a] dark:hover:bg-[#f0eee6]',
                      'active:scale-[0.98] transition-all duration-200',
                      'px-6 py-2.5 rounded-xl text-[14px] font-semibold',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630] focus-visible:ring-offset-2',
                      (!pcSelectedPlan || pcPurchasing) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {pcPurchasing ? (
                      <><LoadingSpinner className="h-4 w-4" /><span>{t('payment.processing')}</span></>
                    ) : (
                      t('periodCard.confirmPurchase', '立即购买')
                    )}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'recharge' && (
              <div className="shrink-0 px-6 py-3 border-t border-[#1414130d] dark:border-[#faf9f50d] bg-surface-cream dark:bg-[#2b2a27] space-y-3">
                {/* 支付方式 — 内嵌胶囊 */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#87867f] shrink-0">{t('payment.paymentMethod')}</span>
                  <div className="inline-flex items-center rounded-lg bg-[#f0eee6] dark:bg-[#2b2a27] p-0.5 gap-0.5">
                    {channelOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => handleChannelSelect(option.id)}
                        className={cn(
                          'flex items-center gap-1 rounded-md px-2.5 py-1.5 transition-all duration-200',
                          'text-[12px] font-medium',
                          selectedChannel === option.id
                            ? 'bg-white dark:bg-[#3d3d3a] text-[#141413] dark:text-[#faf9f5] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                            : 'text-[#87867f] hover:text-[#141413] dark:hover:text-[#faf9f5]'
                        )}
                      >
                        <span className="shrink-0">{option.icon}</span>
                        <span>{option.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* 金额 + 按钮 */}
                <div className="flex items-center justify-between">
                  <div>
                    {isAmountValid && (
                      <div>
                        {discountResult?.valid ? (
                          <>
                            <p className="text-[11px] text-[#87867f]">
                              {t('payment.originalAmount', '原价')}：
                              <span className="line-through ml-1">{formatRMB(actualAmount)}</span>
                            </p>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-[11px] text-[#87867f]">¥</span>
                              <span className="text-[22px] font-bold text-[#16A34A] dark:text-[#34D399] tracking-tight tabular-nums leading-none">
                                {(finalPayAmount / 100).toFixed(2)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-[11px] text-[#87867f] mb-0.5">{t('payment.rechargeAmountLabel', '支付金额')}</p>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-[11px] text-[#87867f]">¥</span>
                              <span className="text-[22px] font-bold text-[#141413] dark:text-[#faf9f5] tracking-tight tabular-nums leading-none">
                                {(actualAmount / 100).toFixed(0)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={!isAmountValid || rechargeLoading}
                    className={cn(
                      'inline-flex items-center justify-center gap-2',
                      'bg-[#141413] dark:bg-[#faf9f5] text-white dark:text-[#141413]',
                      'hover:bg-[#3d3d3a] dark:hover:bg-[#f0eee6]',
                      'active:scale-[0.98] transition-all duration-200',
                      'px-6 py-2.5 rounded-xl text-[14px] font-semibold',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630] focus-visible:ring-offset-2',
                      (!isAmountValid || rechargeLoading) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {rechargeLoading ? (
                      <><LoadingSpinner className="h-4 w-4" /><span>{t('payment.processing')}</span></>
                    ) : (
                      t('payment.confirm')
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RechargeModal;
