import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/ui/components/ui';
import { cleanPlanName, inferPlanTier, PlanTierIcon } from '@/ui/utils/planTier';
import {
  useBillingStore,
  type PeriodCardPlan,
  type RechargeOrder,
  type RechargeStatus,
} from '@/ui/store/useBillingStore';
import { useAuthStore } from '@/ui/store/useAuthStore';
import { ActivePeriodCard } from './ActivePeriodCard';
import { QRCodePayment } from './QRCodePayment';

export interface PeriodCardSectionProps {
  className?: string;
}

type PaymentType = 'wechat' | 'alipay';
type Step = 'select' | 'payment';

interface PurchaseResult {
  orderId: string;
  payUrl: string;
  qrCodeUrl?: string;
  plan: {
    id: string;
    name: string;
    priceCents: number;
    priceYuan: string;
  };
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        fill="currentColor"
      />
    </svg>
  );
}

function WechatPayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89l-.004-.031-.402-.001zm-2.05 2.865c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" fill="#07C160"/>
    </svg>
  );
}

function AlipayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.424 16.45c-1.721-.658-3.392-1.358-5.009-2.098l-.165-.08-.21-.103c1.04-1.6 1.755-3.341 2.106-5.17H20V7h-6V5h-2v2H6v2h8.152a14.3 14.3 0 0 1-1.631 3.988c-.935-.416-1.94-.81-3.021-1.175-2.12-.72-4.267-.998-5.5-.583-1.232.416-2 1.333-2 2.667 0 1.333.768 2.5 2.5 3.333 1.732.834 3.964.667 5.5-.083.89-.434 1.727-1.043 2.488-1.808a41.136 41.136 0 0 0 4.178 1.925c1.344.543 2.66 1.012 3.934 1.408V24h2V0h-2v16.45zM6.5 16.5c-1.333 0-2-.5-2-1.167 0-.666.333-1.166 1.333-1.5 1-.333 2.667 0 4 .5.667.25 1.253.526 1.744.833C10.267 16.833 8.5 16.5 6.5 16.5z" fill="#1677FF"/>
    </svg>
  );
}

/**
 * 期卡购买组件 — Anthropic UI 风格
 *
 * 设计语言：暖象牙底 + 白色卡片 + 三层微阴影
 * 选中态用 accent 左边条 + 淡暖底色
 * 支付方式选择器用 pill capsule 模式
 */
export function PeriodCardSection({ className }: PeriodCardSectionProps) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const periodCardPlans = useBillingStore((s) => s.periodCardPlans);
  const periodCardPlansLoading = useBillingStore((s) => s.periodCardPlansLoading);
  const fetchPeriodCardPlans = useBillingStore((s) => s.fetchPeriodCardPlans);
  const fetchPeriodCards = useBillingStore((s) => s.fetchPeriodCards);

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>('wechat');
  const [step, setStep] = useState<Step>('select');
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
  const orderCreatedAtRef = useRef<number>(0);

  useEffect(() => {
    if (isAuthenticated) {
      fetchPeriodCardPlans();
    }
  }, [isAuthenticated, fetchPeriodCardPlans]);

  // 默认选中第一个套餐
  useEffect(() => {
    if (periodCardPlans.length > 0 && !selectedPlan) {
      setSelectedPlan(periodCardPlans[0].id);
    }
  }, [periodCardPlans, selectedPlan]);

  // 计算「最划算」套餐：省钱比例最高的
  const bestValuePlanId = useMemo(() => {
    if (periodCardPlans.length === 0) return null;
    let bestId = '';
    let bestSavings = 0;
    for (const plan of periodCardPlans) {
      const creditsValue =
        plan.quotaMode === 'total'
          ? plan.totalCredits * 0.1
          : plan.dailyCredits * plan.periodDays * 0.1;
      const price = parseFloat(plan.priceYuan);
      const savings = creditsValue > 0 ? ((creditsValue - price) / creditsValue) * 100 : 0;
      if (savings > bestSavings) {
        bestSavings = savings;
        bestId = plan.id;
      }
    }
    return bestSavings > 10 ? bestId : null;
  }, [periodCardPlans]);

  const selectedPlanInfo = useMemo(() => {
    if (!selectedPlan) return null;
    return periodCardPlans.find((p) => p.id === selectedPlan) ?? null;
  }, [selectedPlan, periodCardPlans]);

  const handlePurchase = useCallback(async () => {
    if (!selectedPlan) return;
    setPurchasing(true);
    setError(null);

    try {
      const result = await window.electron?.billing?.purchasePeriodCard?.(selectedPlan, paymentType);
      if (result?.success && result.data) {
        const data = result.data as PurchaseResult;
        setPurchaseResult(data);
        orderCreatedAtRef.current = Date.now();
        setStep('payment');
      } else {
        setError(result?.error ?? t('periodCard.purchaseFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('periodCard.purchaseFailed'));
    } finally {
      setPurchasing(false);
    }
  }, [selectedPlan, paymentType, t]);

  const qrCodeOrder: RechargeOrder | null = useMemo(() => {
    if (!purchaseResult) return null;
    const createdAt = orderCreatedAtRef.current || Date.now();
    return {
      id: purchaseResult.orderId,
      amount: purchaseResult.plan.priceCents,
      currency: 'CNY',
      channel: paymentType === 'wechat' ? 'xunhu_wechat' : 'xunhu_alipay',
      status: 'pending' as RechargeStatus,
      createdAt,
      expiresAt: createdAt + 5 * 60 * 1000,
      paymentUrl: purchaseResult.payUrl,
      qrCodeUrl: purchaseResult.qrCodeUrl,
    };
  }, [purchaseResult, paymentType]);

  const handlePaymentSuccess = useCallback(async () => {
    await fetchPeriodCards();
    setPurchaseResult(null);
    setSelectedPlan(null);
    setStep('select');
  }, [fetchPeriodCards]);

  const handlePaymentFailed = useCallback(() => {
    setPurchaseResult(null);
    setStep('select');
  }, []);

  const handleBack = useCallback(() => {
    setPurchaseResult(null);
    setStep('select');
  }, []);

  if (!isAuthenticated) return null;

  const paymentChannels: { id: PaymentType; label: string; icon: ReactNode }[] = useMemo(
    () => [
      { id: 'wechat' as const, label: t('payment.wechat'), icon: <WechatPayIcon className="h-4 w-4" /> },
      { id: 'alipay' as const, label: t('payment.alipay'), icon: <AlipayIcon className="h-4 w-4" /> },
    ],
    [t]
  );

  return (
    <div className={cn('space-y-5', className)}>
      {/* 当前期卡状态 */}
      <ActivePeriodCard />

      {step === 'select' && (
        <>
          {/* 套餐选择 */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#87867f] mb-3">
              {t('periodCard.selectPlan')}
            </p>

            {periodCardPlansLoading ? (
              /* 骨架屏 — 三张卡片占位 */
              <div className="grid gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-2xl bg-white dark:bg-[#3d3d3a] border border-[#1414130a] dark:border-[#ffffff08] p-5 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]"
                  >
                    <div className="h-3 w-8 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse mb-3" />
                    <div className="h-5 w-36 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse mb-2" />
                    <div className="h-3.5 w-48 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse mb-4" />
                    <div className="flex items-end justify-between mb-4">
                      <div className="h-8 w-24 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
                      <div className="h-3.5 w-16 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
                    </div>
                    <div className="h-px bg-[#1414130a] dark:bg-[#ffffff0a] mb-4" />
                    <div className="space-y-2">
                      <div className="h-3.5 w-52 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
                      <div className="h-3.5 w-40 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : periodCardPlans.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] p-6 text-center">
                <p className="text-sm text-[#87867f]">{t('periodCard.noPlan')}</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {periodCardPlans.map((plan, index) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    index={index}
                    selected={selectedPlan === plan.id}
                    isBestValue={bestValuePlanId === plan.id}
                    onSelect={() => {
                      setSelectedPlan(plan.id);
                      setError(null);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 支付方式 — Pill Capsule 模式 */}
          {selectedPlan && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#87867f] mb-2">
                {t('periodCard.paymentType')}
              </p>
              <div className="inline-flex items-center rounded-full bg-[#1414130a] dark:bg-[#ffffff08] p-[3px] gap-0">
                {paymentChannels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => {
                      setPaymentType(ch.id);
                      setError(null);
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-full px-4 py-1.5',
                      'text-[13px] font-medium font-sans transition-all duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630] focus-visible:ring-offset-1',
                      paymentType === ch.id
                        ? 'bg-white dark:bg-[#3d3d3a] text-[#141413] dark:text-[#faf9f5] shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                        : 'text-[#87867f] hover:text-[#141413] dark:hover:text-[#faf9f5]'
                    )}
                  >
                    {ch.icon}
                    <span>{ch.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="rounded-2xl border border-[#DC262614] bg-[#DC26260a] dark:bg-[#DC262612] px-4 py-3">
              <p className="text-sm text-[#DC2626]">{error}</p>
            </div>
          )}

          {/* 底部：金额 + 购买按钮 */}
          {periodCardPlans.length > 0 && (
            <div className="flex items-center justify-between pt-1">
              {selectedPlanInfo ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#87867f] mb-0.5">
                    {t('payment.rechargeAmountLabel', '支付金额')}
                  </p>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-xs text-[#87867f] mt-0.5">¥</span>
                    <span className="text-2xl font-bold text-[#141413] dark:text-[#faf9f5] tracking-tight tabular-nums">
                      {selectedPlanInfo.priceYuan}
                    </span>
                  </div>
                </div>
              ) : (
                <div />
              )}

              <button
                onClick={handlePurchase}
                disabled={!selectedPlan || purchasing}
                className={cn(
                  'inline-flex items-center justify-center gap-2',
                  'bg-[#141413] dark:bg-[#faf9f5] text-[#faf9f5] dark:text-[#141413]',
                  'hover:bg-[#3d3d3a] dark:hover:bg-[#f0eee6]',
                  'active:scale-[0.98] transition-all duration-200',
                  'px-5 py-2.5 rounded-xl text-sm font-semibold font-sans',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630] focus-visible:ring-offset-2',
                  (!selectedPlan || purchasing) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {purchasing ? (
                  <>
                    <LoadingSpinner className="h-3.5 w-3.5" />
                    <span>{t('payment.processing')}</span>
                  </>
                ) : (
                  t('periodCard.confirmPurchase')
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* 支付步骤 — 二维码 */}
      {step === 'payment' && qrCodeOrder && (
        <QRCodePayment
          order={qrCodeOrder}
          onSuccess={handlePaymentSuccess}
          onFailed={handlePaymentFailed}
          onCancel={handleBack}
        />
      )}
    </div>
  );
}

/**
 * 单个套餐卡片 — Anthropic UI 风格
 *
 * 选中态：accent 左边条(3px) + 极淡暖底色 + 右上角 check 圆圈
 * 未选中：白色卡片 + 透明边框 + hover 边框加深
 * 数字计数器用 tabular-nums mono 字体
 */
function PlanCard({
  plan,
  selected,
  onSelect,
  isBestValue,
  index = 0,
}: {
  plan: PeriodCardPlan;
  selected: boolean;
  onSelect: () => void;
  isBestValue: boolean;
  index?: number;
}) {
  const { t } = useTranslation();

  const creditsValue =
    plan.quotaMode === 'total'
      ? plan.totalCredits * 0.1
      : plan.dailyCredits * plan.periodDays * 0.1;
  const priceNum = parseFloat(plan.priceYuan);
  const savingsPercent =
    creditsValue > 0 ? Math.round(((creditsValue - priceNum) / creditsValue) * 100) : 0;
  const perDayCost = (priceNum / plan.periodDays).toFixed(2);

  const periodLabel = `/ ${plan.periodDays}${t('periodCard.days', '天')}`;

  // 两位数零填充计数器（01, 02 …）
  const counter = String(index + 1).padStart(2, '0');

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group relative w-full text-left rounded-2xl transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630] focus-visible:ring-offset-2',
        'shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]',
        'active:scale-[0.99]',
        selected
          ? 'bg-[#ae563006] dark:bg-[#ae563012] border border-[#1414130a] dark:border-[#ffffff08]'
          : 'bg-white dark:bg-[#3d3d3a] border border-[#1414130a] dark:border-[#ffffff08] hover:border-[#14141320] dark:hover:border-[#ffffff14]'
      )}
    >
      {/* 选中态：左边 accent 边条 */}
      {selected && (
        <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-[#ae5630]" />
      )}

      <div className="p-5">
        {/* 右上角：最划算标签 或 选中 check */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {isBestValue && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-[0.02em] bg-[#d9775714] text-[#c6613f] dark:bg-[#d9775720] dark:text-[#d97757]">
              {t('periodCard.bestValue')}
            </span>
          )}
          {selected && (
            <div className="w-5 h-5 rounded-full bg-[#ae5630] flex items-center justify-center shadow-[0_1px_2px_rgba(174,86,48,0.3)]">
              <Check className="w-3 h-3 text-[#faf9f5]" strokeWidth={3} />
            </div>
          )}
        </div>

        {/* 计数器 */}
        <p className="text-[11px] font-mono font-semibold tracking-widest text-[#b0aea5] dark:text-[#87867f] mb-2 select-none tabular-nums">
          {counter}
        </p>

        {/* 套餐名 */}
        <h3 className="text-lg font-semibold text-[#141413] dark:text-[#faf9f5] leading-snug mb-1 flex items-center gap-1.5">
          <PlanTierIcon tier={inferPlanTier(plan.name)} className="w-5 h-5 shrink-0" />
          {cleanPlanName(plan.name)}
        </h3>

        {/* 副标题 */}
        {plan.description && (
          <p className="text-sm text-[#87867f] mb-4 leading-relaxed">{plan.description}</p>
        )}

        {/* 价格区域 */}
        <div className="flex items-end justify-between mt-3 mb-4">
          <div className="flex items-baseline gap-1">
            <span className="text-xs text-[#87867f]">¥</span>
            <span className="text-3xl font-bold text-[#141413] dark:text-[#faf9f5] tracking-tight tabular-nums">
              {plan.priceYuan}
            </span>
            <span className="text-sm text-[#b0aea5] dark:text-[#87867f]">{periodLabel}</span>
          </div>
          {savingsPercent > 0 && (
            <span className="text-xs text-[#87867f] tabular-nums">
              {t('periodCard.perDayCost', { cost: perDayCost })}
            </span>
          )}
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-[#1414130a] dark:bg-[#ffffff08] mb-4" />

        {/* 功能列表 */}
        <ul className="space-y-2">
          <li className="flex items-start gap-2.5 text-sm text-[#6b6a68] dark:text-[#9a9893]">
            <div className="w-4 h-4 rounded-full bg-[#788c5d14] dark:bg-[#788c5d1a] flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-2.5 h-2.5 text-[#788c5d]" strokeWidth={3} />
            </div>
            <span>
              {plan.quotaMode === 'total'
                ? `${plan.totalCredits.toFixed(0)} ${t('periodCard.totalCreditsLabel')}（${plan.periodDays}${t('periodCard.days', '天')}${t('periodCard.valid', '有效')}）`
                : `${plan.dailyCredits.toFixed(0)} ${t('periodCard.dailyCredits')}${t('periodCard.perDay')}（${plan.periodDays}${t('periodCard.days', '天')}）`}
            </span>
          </li>

          {plan.quotaMode === 'total' && (
            <li className="flex items-start gap-2.5 text-sm text-[#6b6a68] dark:text-[#9a9893]">
              <div className="w-4 h-4 rounded-full bg-[#788c5d14] dark:bg-[#788c5d1a] flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-2.5 h-2.5 text-[#788c5d]" strokeWidth={3} />
              </div>
              <span>{t('periodCard.noDaily')}</span>
            </li>
          )}

          {savingsPercent > 0 && (
            <li className="flex items-start gap-2.5 text-sm text-[#6b6a68] dark:text-[#9a9893]">
              <div className="w-4 h-4 rounded-full bg-[#788c5d14] dark:bg-[#788c5d1a] flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-2.5 h-2.5 text-[#788c5d]" strokeWidth={3} />
              </div>
              <span>{t('periodCard.savePercent', { percent: savingsPercent })}</span>
            </li>
          )}
        </ul>
      </div>
    </button>
  );
}

export default PeriodCardSection;
