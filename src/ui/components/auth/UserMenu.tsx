import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cleanPlanName, inferPlanTier, PlanTierIcon } from '@/ui/utils/planTier';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Avatar,
  AvatarImage,
  AvatarFallback,
  cn,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/ui/components/ui';
import { useAuthStore, formatBalance } from '@/ui/store/useAuthStore';
import { useBillingStore } from '@/ui/store/useBillingStore';
import { useSettingsStore } from '@/ui/store/useSettingsStore';
import { PRESET_AVATARS } from '@/ui/components/chat/Avatar';
import { LogoutConfirmDialog } from '@/ui/components/auth/LogoutConfirmDialog';

/**
 * UserMenu 组件属性
 */
export interface UserMenuProps {
  /** 额外的 CSS 类名 */
  className?: string;
  /** 点击账户设置回调 */
  onSettingsClick?: () => void;
  /** 点击充值回调 */
  onRechargeClick?: () => void;
  /** 点击消费记录回调 */
  onHistoryClick?: () => void;
}

/**
 * 设置图标 SVG
 */
function SettingsIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * 充值图标 SVG
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
 * 历史记录图标 SVG
 */
function HistoryIcon({ className }: { className?: string }) {
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
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

/**
 * 退出图标 SVG
 */
function LogOutIcon({ className }: { className?: string }) {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

/**
 * 获取用户名首字母作为头像占位符
 */
function getInitials(name?: string, email?: string): string {
  if (name) {
    return name.trim().charAt(0).toUpperCase();
  }
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  return 'U';
}

/**
 * 用户菜单组件
 * 显示用户头像、名称、余额，以及包含账户设置、充值、消费记录、退出登录的下拉菜单
 */
export function UserMenu({
  className,
  onSettingsClick,
  onRechargeClick,
  onHistoryClick,
}: UserMenuProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const balance = useAuthStore((s) => s.balance);
  const logout = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fetchBalance = useAuthStore((s) => s.fetchBalance);
  const periodCards = useBillingStore((s) => s.periodCards);
  const fetchPeriodCards = useBillingStore((s) => s.fetchPeriodCards);
  const userAvatar = useSettingsStore((s) => s.userAvatar);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 用户认证后自动获取期卡信息
  useEffect(() => {
    if (isAuthenticated) {
      fetchPeriodCards();
    }
  }, [isAuthenticated, fetchPeriodCards]);

  const handleRefreshBalance = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchBalance(true), fetchPeriodCards()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchBalance, fetchPeriodCards]);

  /**
   * 处理账户设置点击
   */
  const handleSettingsClick = useCallback(() => {
    onSettingsClick?.();
  }, [onSettingsClick]);

  /**
   * 处理充值点击
   */
  const handleRechargeClick = useCallback(() => {
    onRechargeClick?.();
  }, [onRechargeClick]);

  /**
   * 处理消费记录点击
   */
  const handleHistoryClick = useCallback(() => {
    onHistoryClick?.();
  }, [onHistoryClick]);

  /**
   * 处理退出登录
   */
  const handleLogout = useCallback(() => {
    setShowLogoutConfirm(true);
  }, []);

  const confirmLogout = useCallback(() => {
    logout();
    setShowLogoutConfirm(false);
  }, [logout]);

  const cancelLogout = useCallback(() => {
    setShowLogoutConfirm(false);
  }, []);

  /**
   * 用户头像首字母
   */
  const initials = useMemo(() => {
    return getInitials(user?.name, user?.email);
  }, [user?.name, user?.email]);

  /**
   * 格式化后的余额显示
   */
  const formattedBalance = useMemo(() => {
    return formatBalance(balance);
  }, [balance]);

  // 未登录时不渲染
  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <>
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              data-tour="user-menu"
              className={cn(
                'group flex items-center gap-1 rounded-full px-1 py-1 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                className
              )}
              aria-label={t('auth.userMenu')}
            >
              <Avatar className="h-8 w-8 group-hover:scale-110 transition-transform duration-200">
                {user.avatar ? (
                  <AvatarImage src={user.avatar} alt={user.name ?? user.email} />
                ) : null}
                <AvatarFallback className="bg-ink-900/8 text-ink-700 text-sm font-medium">
                  {(() => {
                    const preset = userAvatar ? PRESET_AVATARS.find((a) => a.id === userAvatar) : null;
                    if (preset) return <img src={preset.src} alt={preset.label} className="h-5 w-5 object-contain" />;
                    return initials;
                  })()}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          <p>{t('auth.profileMenuHint', '账户菜单 — 点击查看个人信息')}</p>
        </TooltipContent>
      </Tooltip>

      {/* 下拉面板 — Anthropic warm ivory 风格 */}
      <DropdownMenuContent
        align="end"
        className="w-64 border border-[#1414130d] bg-[#faf9f5] dark:bg-[#2b2a27] dark:border-[#ffffff12] rounded-2xl p-0 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]"
      >
        {/* 用户信息头部 */}
        <div className="px-4 pt-4 pb-3">
          <p className="text-[14px] font-semibold text-[#141413] dark:text-[#faf9f5] leading-snug">
            {user.name ?? t('auth.user')}
          </p>
          <p className="text-[12px] text-[#87867f] truncate mt-0.5">{user.email}</p>
        </div>

        {/* 余额卡片 */}
        <div className="mx-3 mb-2 rounded-xl bg-white dark:bg-[#3d3d3a] border border-[#1414130a] dark:border-[#ffffff08] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.05em] text-[#87867f] font-medium">{t('payment.currentBalance')}</span>
            <button
              onClick={handleRefreshBalance}
              disabled={refreshing}
              className="p-1 -mr-1 rounded-md hover:bg-[#1414130a] dark:hover:bg-[#ffffff0a] transition-colors disabled:opacity-40"
              aria-label={t('common.refresh', '刷新')}
            >
              <svg
                className={cn("h-3 w-3 text-[#87867f]", refreshing && "animate-spin")}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>
          <p className="text-[20px] font-semibold text-[#141413] dark:text-[#faf9f5] mt-1 font-[system-ui] tabular-nums">{formattedBalance}</p>

          {/* 期卡摘要 — 内嵌在余额卡片里 */}
          {periodCards.length > 0 && (
            <div className="mt-3 space-y-2.5">
              {periodCards.map((card) => {
                const isTotal = card.quotaMode === 'total';
                const remaining = isTotal ? card.totalRemaining : card.dailyQuotaRemaining;
                const total = isTotal ? card.totalCredits : card.dailyCredits;
                const pct = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
                const tier = inferPlanTier(card.planName);
                const tierColor = tier === 'max' ? '#B8860B' : tier === 'pro' ? '#ae5630' : '#c9956b';
                return (
                  <div key={card.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <PlanTierIcon tier={tier} className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[11px] font-medium text-[#141413] dark:text-[#e5e4df] truncate">{cleanPlanName(card.planName)}</span>
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full leading-none shrink-0"
                          style={{ backgroundColor: `${tierColor}14`, color: tierColor }}
                        >
                          <span className="w-1 h-1 rounded-full inline-block" style={{ backgroundColor: tierColor }} />
                          {t('periodCard.active', '生效中')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[#1414130a] dark:bg-[#ffffff0a] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: tierColor }}
                        />
                      </div>
                      <span className="text-[10px] text-[#87867f] tabular-nums whitespace-nowrap">
                        {remaining.toFixed(1)}/{total.toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 分割线 */}
        <div className="h-px bg-[#1414130a] dark:bg-[#ffffff08] mx-3" />

        {/* 菜单项 */}
        <div className="p-1.5">
          <DropdownMenuItem
            onClick={handleSettingsClick}
            className="cursor-pointer text-[13px] text-[#141413] dark:text-[#e5e4df] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] rounded-lg px-3 py-2.5 gap-3"
          >
            <SettingsIcon className="h-4 w-4 text-[#87867f] shrink-0" />
            <span>{t('auth.accountSettings')}</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleRechargeClick}
            className="cursor-pointer text-[13px] text-[#141413] dark:text-[#e5e4df] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] rounded-lg px-3 py-2.5 gap-3"
          >
            <CreditCardIcon className="h-4 w-4 text-[#87867f] shrink-0" />
            <span>{t('payment.recharge')}</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleHistoryClick}
            className="cursor-pointer text-[13px] text-[#141413] dark:text-[#e5e4df] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] rounded-lg px-3 py-2.5 gap-3"
          >
            <HistoryIcon className="h-4 w-4 text-[#87867f] shrink-0" />
            <span>{t('auth.usageHistory')}</span>
          </DropdownMenuItem>
        </div>

        {/* 退出分割线 */}
        <div className="h-px bg-[#1414130a] dark:bg-[#ffffff08] mx-3" />

        {/* 退出登录 */}
        <div className="p-1.5">
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer text-[13px] text-[#DC2626] focus:text-[#DC2626] hover:bg-[#DC26260a] focus:bg-[#DC26260a] rounded-lg px-3 py-2.5 gap-3"
          >
            <LogOutIcon className="h-4 w-4 shrink-0" />
            <span>{t('auth.logout')}</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>

    {/* 退出确认弹窗 */}
    <LogoutConfirmDialog
      open={showLogoutConfirm}
      onConfirm={confirmLogout}
      onCancel={cancelLogout}
    />
    </>
  );
}

export default UserMenu;
