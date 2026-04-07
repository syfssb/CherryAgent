import { useMemo, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cn } from '@/ui/components/ui';
import { useAuthStore, formatBalance } from '@/ui/store/useAuthStore';
import { useBillingStore } from '@/ui/store/useBillingStore';
import { cleanPlanName, inferPlanTier, PlanTierIcon } from '@/ui/utils/planTier';
import { LoginModal } from '@/ui/components/auth/LoginModal';
import { formatDateTime, calculateDaysLeft } from '@/ui/utils/date';

/**
 * BalanceDisplay 组件属性
 */
export interface BalanceDisplayProps {
  /** 额外的 CSS 类名 */
  className?: string;
  /** 余额不足阈值（单位：分），默认 100（1 积分） */
  lowBalanceThreshold?: number;
  /** 是否显示充值按钮 */
  showRechargeButton?: boolean;
  /** 是否紧凑模式 */
  compact?: boolean;
  /** 点击充值回调 */
  onRechargeClick?: () => void;
}

/**
 * 钱包图标 SVG
 */
function WalletIcon({ className }: { className?: string }) {
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
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

/**
 * 警告图标 SVG
 */
function AlertIcon({ className }: { className?: string }) {
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
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/**
 * 加号图标 SVG
 */
function PlusIcon({ className }: { className?: string }) {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

/**
 * 期卡图标 SVG
 */
function CardIcon({ className }: { className?: string }) {
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
      <path d="M2 10h20" />
    </svg>
  );
}

/**
 * 余额显示组件
 * 显示当前余额，余额不足时显示警告，支持点击跳转充值
 */
export function BalanceDisplay({
  className,
  lowBalanceThreshold = 100, // 默认 1 积分
  showRechargeButton = true,
  compact = false,
  onRechargeClick,
}: BalanceDisplayProps) {
  const { t } = useTranslation();
  const balance = useAuthStore((s) => s.balance);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const welcomeBonus = useAuthStore((s) => s.welcomeBonus);
  const fetchPeriodCard = useBillingStore((s) => s.fetchPeriodCard);
  const periodCards = useBillingStore((s) => s.periodCards);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // 登录后获取期卡信息
  useEffect(() => {
    if (isAuthenticated) {
      fetchPeriodCard();
    }
  }, [isAuthenticated, fetchPeriodCard]);

  /**
   * 格式化后的余额
   */
  const formattedBalance = useMemo(() => {
    return formatBalance(balance);
  }, [balance]);

  /**
   * 是否余额不足
   */
  const isLowBalance = useMemo(() => {
    if (!balance) return false;
    // balance.amount 是积分，需要转换为分进行比较
    return balance.amount * 100 < lowBalanceThreshold;
  }, [balance, lowBalanceThreshold]);

  const hasWelcomeBonus = useMemo(() => {
    return !!welcomeBonus && welcomeBonus.amount > 0;
  }, [welcomeBonus]);

  const welcomeBonusLabel = useMemo(() => {
    return welcomeBonus?.label || t('auth.welcomeBonusLabel', '新手礼包');
  }, [welcomeBonus, t]);

  /**
   * 处理点击充值或登录
   */
  const handleClick = useCallback(() => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
    } else {
      onRechargeClick?.();
    }
  }, [isAuthenticated, onRechargeClick]);

  // 未登录时显示登录按钮
  if (!isAuthenticated) {
    if (compact) {
      return (
        <>
          <button
            onClick={handleClick}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors',
              'hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              'text-accent',
              className
            )}
            aria-label={t('auth.login')}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="text-sm font-medium">{t('auth.login')}</span>
          </button>
          <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
        </>
      );
    }
    return null;
  }

  // 紧凑模式
  if (compact) {
    return (
      <>
        <button
          onClick={handleClick}
          data-tour="balance"
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors',
            'hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            isLowBalance ? 'text-warning' : 'text-ink-700',
            className
          )}
          aria-label={`${t('payment.currentBalance')}: ${formattedBalance}${isLowBalance ? ` - ${t('error.quotaExceeded')}` : ''}`}
        >
          {isLowBalance ? (
            <AlertIcon className="h-4 w-4" />
          ) : (
            <WalletIcon className="h-4 w-4" />
          )}
          <span className="text-sm font-medium">{formattedBalance}</span>
          {periodCards.length > 0 && (
            <span className="ml-0.5 flex items-center gap-0.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              <CardIcon className="h-3 w-3" />
              {periodCards.reduce((sum, c) => sum + (c.quotaMode === 'total' ? c.totalRemaining : c.dailyQuotaRemaining), 0).toFixed(1)}
            </span>
          )}
          {hasWelcomeBonus && periodCards.length === 0 && (
            <span className="ml-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
              {welcomeBonusLabel}
            </span>
          )}
        </button>
        <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-3 p-4 rounded-xl border',
          isLowBalance
            ? 'border-warning/30 bg-warning/5'
            : 'border-ink-400/20 bg-surface',
          className
        )}
      >
        <div className="flex items-center justify-between">
          {/* 余额信息 */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full',
                isLowBalance ? 'bg-warning/10' : 'bg-accent/10'
              )}
            >
              {isLowBalance ? (
                <AlertIcon className="h-5 w-5 text-warning" />
              ) : (
                <WalletIcon className="h-5 w-5 text-accent" />
              )}
            </div>

            <div className="flex flex-col">
              <span className="text-xs text-muted">{t('payment.currentBalance')}</span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xl font-semibold',
                    isLowBalance ? 'text-warning' : 'text-ink-900'
                  )}
                >
                  {formattedBalance}
                </span>
                {hasWelcomeBonus && (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                    {welcomeBonusLabel}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 余额不足警告 */}
          {isLowBalance && (
            <div className="hidden sm:block mr-4">
              <p className="text-sm text-warning">{t('error.quotaExceeded')}</p>
            </div>
          )}

          {/* 充值按钮 */}
          {showRechargeButton && (
            <Button
              variant={isLowBalance ? 'default' : 'outline'}
              size="sm"
              onClick={handleClick}
              className={cn(
                isLowBalance && 'bg-warning hover:bg-warning/90 text-white border-warning'
              )}
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              {t('payment.recharge')}
            </Button>
          )}
        </div>

        {/* 期卡信息 */}
        {periodCards.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-ink-400/10">
            {periodCards.map((card) => {
              const daysLeft = calculateDaysLeft(card.expiresAt);
              const isTotal = card.quotaMode === 'total';
              return (
                <div key={card.id} className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent/10">
                    <CardIcon className="h-5 w-5 text-accent" />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-xs text-muted flex items-center gap-1">
                      <PlanTierIcon tier={inferPlanTier(card.planName)} className="w-3.5 h-3.5 shrink-0" />
                      {cleanPlanName(card.planName)}
                    </span>
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-ink-900">
                        {isTotal
                          ? `${t('periodCard.totalRemaining')}: ${card.totalRemaining.toFixed(2)} / ${card.totalCredits.toFixed(2)}`
                          : `${t('periodCard.dailyRemaining')}: ${card.dailyQuotaRemaining.toFixed(2)} / ${card.dailyCredits.toFixed(2)}`}
                      </span>
                      <span className="text-muted">
                        {t('periodCard.startsAt', '开始')}: {formatDateTime(card.startsAt)}
                      </span>
                      {isTotal ? (
                        <span className="text-muted">
                          {t('periodCard.expiresAt')}: {formatDateTime(card.expiresAt)}
                          {' · '}
                          {t('periodCard.daysLeft', { days: daysLeft })}
                        </span>
                      ) : (
                        <>
                          <span className="text-muted">
                            {t('periodCard.expiresAt')}: {formatDateTime(card.expiresAt)}
                            {' · '}
                            {t('periodCard.daysLeft', { days: daysLeft })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </>
  );
}

export default BalanceDisplay;
