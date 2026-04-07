import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/ui/components/ui';
import { useRouter } from '@/ui/hooks/useRouter';
import { UsageHistory } from './UsageHistory';
import { TransactionHistory } from './TransactionHistory';
import { ActivePeriodCard } from '@/ui/components/billing/ActivePeriodCard';

/**
 * UsagePage 页面属性
 */
export interface UsagePageProps {
  /** 额外的 CSS 类名 */
  className?: string;
  /** 打开充值弹窗 */
  onOpenRechargeModal?: () => void;
}

/**
 * Tab 类型
 */
type Tab = 'usage' | 'transactions' | 'periodCard';

/**
 * 使用记录页面（包含消费记录、交易记录和期卡三个Tab）
 */
export function UsagePage({ className, onOpenRechargeModal }: UsagePageProps) {
  const { t } = useTranslation();
  const { navigate } = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('usage');

  const tabs: { value: Tab; label: string }[] = [
    { value: 'usage', label: t('auth.usageHistory', '消费记录') },
    { value: 'transactions', label: t('payment.history', '交易记录') },
    { value: 'periodCard', label: t('periodCard.title', '期卡') },
  ];

  return (
    <div className={cn('flex flex-col h-full bg-[#faf9f5] dark:bg-[#141413]', className)}>
      {/* 返回按钮 + Tab 导航 */}
      <div className="flex items-center gap-1.5 px-6 py-3 border-b border-[#1414130a] dark:border-[#ffffff08]">
        <button
          onClick={() => navigate('/chat')}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[#87867f] hover:bg-[#1414130a] hover:text-[#141413] dark:hover:bg-[#ffffff08] dark:hover:text-[#faf9f5] transition-colors duration-150"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t('common.back', '返回')}
        </button>
        <div className="w-px h-5 bg-[#1414131a] dark:bg-[#ffffff12] mx-2" />
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'px-4 py-1.5 text-sm font-medium rounded-full transition-colors duration-150',
                activeTab === tab.value
                  ? 'bg-[#ae5630] text-white'
                  : 'text-[#87867f] hover:bg-[#1414130a] hover:text-[#141413] dark:hover:bg-[#ffffff08] dark:hover:text-[#faf9f5]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'usage' && <UsageHistory />}
        {activeTab === 'transactions' && <TransactionHistory />}
        {activeTab === 'periodCard' && (
          <div className="p-6 overflow-y-auto h-full space-y-4">
            <ActivePeriodCard />
            <div className="text-center pt-2">
              <button
                onClick={() => onOpenRechargeModal?.()}
                className="text-sm text-[#ae5630] hover:text-[#c4633a] hover:underline transition-colors duration-150"
              >
                {t('periodCard.goToRecharge', '前往充值中心购买或升级期卡')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UsagePage;
