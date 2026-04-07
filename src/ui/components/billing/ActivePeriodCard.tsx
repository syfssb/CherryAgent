import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/ui/components/ui';
import { useBillingStore } from '@/ui/store/useBillingStore';
import { useAuthStore } from '@/ui/store/useAuthStore';
import { cleanPlanName, inferPlanTier, PlanTierIcon } from '@/ui/utils/planTier';
import { formatDateTime, calculateDaysLeft } from '@/ui/utils/date';

export interface ActivePeriodCardProps {
  className?: string;
}

/* ---------- 进度条颜色映射：随套餐等级变化 ---------- */
const TIER_BAR_COLOR: Record<ReturnType<typeof inferPlanTier>, string> = {
  max:   'bg-[#B8860B]',   // 金
  pro:   'bg-[#ae5630]',   // 橙（accent）
  plus:  'bg-[#c9956b]',   // 铜
  basic: 'bg-[#b0aea5]',   // 中性灰
};

/* ---------- 骨架块复用样式 ---------- */
const SKEL = 'bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse';

/**
 * 当前生效期卡组件 — Anthropic UI 设计系统
 *
 * 设计要素：三层微阴影 · rounded-2xl · olive 状态标签 · 等级进度条
 */
export function ActivePeriodCard({ className }: ActivePeriodCardProps) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const periodCards = useBillingStore((s) => s.periodCards);
  const periodCardLoading = useBillingStore((s) => s.periodCardLoading);
  const fetchPeriodCard = useBillingStore((s) => s.fetchPeriodCards);

  useEffect(() => {
    if (isAuthenticated) {
      fetchPeriodCard();
    }
  }, [isAuthenticated, fetchPeriodCard]);

  /* ======================== 骨架屏 ======================== */
  if (periodCardLoading) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-[#1414130a] dark:border-[#ffffff08]',
          'bg-white dark:bg-[#3d3d3a] p-5',
          'shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]',
          className,
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <div className={cn('h-3 w-20', SKEL)} />
          <div className={cn('h-5 w-14 !rounded-full', SKEL)} />
        </div>
        <div className={cn('h-5 w-32 mb-4', SKEL)} />
        <div className={cn('h-1.5 w-full !rounded-full mb-3', SKEL)} />
        <div className={cn('h-3 w-48', SKEL)} />
      </div>
    );
  }

  /* ======================== 空状态 ======================== */
  if (periodCards.length === 0) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-dashed border-[#1414130a] dark:border-[#ffffff08]',
          'bg-white dark:bg-[#3d3d3a] p-5 text-center',
          className,
        )}
      >
        <div className="flex items-center justify-center mb-3">
          <div className="w-10 h-10 rounded-full bg-[#1414130a] dark:bg-[#ffffff0a] flex items-center justify-center">
            <svg
              className="w-5 h-5 text-[#b0aea5]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <path d="M2 10h20" />
            </svg>
          </div>
        </div>
        <p className="text-sm font-medium text-[#141413] dark:text-[#faf9f5] mb-1">
          {t('periodCard.noActiveCard')}
        </p>
        <p className="text-xs text-[#87867f]">{t('periodCard.noActiveCardHint')}</p>
      </div>
    );
  }

  /* ======================== 卡片列表 ======================== */
  return (
    <div className={cn('space-y-3', className)}>
      {periodCards.map((card) => {
        const tier = inferPlanTier(card.planName);
        const daysLeft = calculateDaysLeft(card.expiresAt);
        const isTotal = card.quotaMode === 'total';

        const quotaPercent = isTotal
          ? card.totalCredits > 0
            ? Math.min(100, (card.totalRemaining / card.totalCredits) * 100)
            : 0
          : card.dailyCredits > 0
            ? Math.min(100, (card.dailyQuotaRemaining / card.dailyCredits) * 100)
            : 0;

        const isLow = quotaPercent < 20;

        return (
          <div
            key={card.id}
            className={cn(
              'relative rounded-2xl border border-[#1414130a] dark:border-[#ffffff08]',
              'bg-white dark:bg-[#3d3d3a] overflow-hidden',
              'shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]',
            )}
          >
            {/* 左侧 accent 边条 — 活跃高亮 */}
            <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-[#ae5630]" />

            <div className="p-5 pl-6">
            {/* ---- 头部：标签 + 套餐名 + 状态 ---- */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f] mb-1">
                  {t('periodCard.currentPlan', '当前套餐')}
                </p>
                <h3 className="text-base font-semibold text-[#141413] dark:text-[#faf9f5] flex items-center gap-1.5">
                  <PlanTierIcon tier={tier} className="w-5 h-5 shrink-0" />
                  {cleanPlanName(card.planName)}
                </h3>
              </div>
              {/* olive 生效中标签 */}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#788c5d14] text-[#788c5d]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#788c5d] inline-block" />
                {t('periodCard.active')}
              </span>
            </div>

            {/* ---- 额度区域 ---- */}
            <div className="mb-4">
              <div className="flex items-end justify-between mb-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f]">
                  {isTotal ? t('periodCard.totalRemaining') : t('periodCard.dailyRemaining')}
                </span>
                <span className="text-sm font-semibold text-[#141413] dark:text-[#faf9f5] tabular-nums">
                  {isTotal
                    ? `${card.totalRemaining.toFixed(1)} / ${card.totalCredits.toFixed(1)}`
                    : `${card.dailyQuotaRemaining.toFixed(1)} / ${card.dailyCredits.toFixed(1)}`}
                </span>
              </div>

              {/* 进度条 — 颜色随套餐等级 */}
              <div className="h-1.5 rounded-full bg-[#1414130a] dark:bg-[#ffffff0a] overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    isLow ? 'bg-[#D97706]' : TIER_BAR_COLOR[tier],
                  )}
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>

              {isLow && (
                <p className="text-[11px] text-[#D97706] mt-1.5 font-medium">
                  {t('periodCard.quotaLow', '额度即将用尽')}
                </p>
              )}

              <p className="text-[11px] text-[#b0aea5] dark:text-[#87867f] mt-1">
                {isTotal ? t('periodCard.totalPoolHint') : t('periodCard.quotaReset')}
              </p>
            </div>

            {/* ---- 分隔线 ---- */}
            <div className="h-px bg-[#1414130a] dark:bg-[#ffffff08] mb-3" />

            {/* ---- 时间信息 ---- */}
            <div className="flex items-center justify-between text-xs text-[#87867f]">
              <span className="tabular-nums">
                {t('periodCard.startsAt', '开始')}
                {': '}
                {formatDateTime(card.startsAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="tabular-nums">
                  {t('periodCard.expiresAt')}
                  {': '}
                  {formatDateTime(card.expiresAt)}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1414130a] dark:bg-[#ffffff0a] text-[#87867f] tabular-nums">
                  {t('periodCard.daysLeft', { days: daysLeft })}
                </span>
              </span>
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ActivePeriodCard;
