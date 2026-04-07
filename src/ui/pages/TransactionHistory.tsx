import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ScrollArea,
  cn,
} from '@/ui/components/ui';
import {
  useBillingStore,
  formatAmount,
  formatTimestamp,
  getTransactionTypeLabel,
  type TransactionFilters,
  type Transaction,
  type TransactionType,
} from '@/ui/store/useBillingStore';

// ─── 类型常量 ───────────────────────────────────────────

/** 交易类型对应的暖色标签配色 */
const TX_TAG_STYLES: Record<TransactionType, string> = {
  deposit: 'bg-[#788c5d]/12 text-[#788c5d] dark:bg-[#788c5d]/18 dark:text-[#a3b48a]',
  usage:   'bg-[#d97757]/12 text-[#d97757] dark:bg-[#d97757]/18 dark:text-[#e9a68e]',
  refund:  'bg-[#ae5630]/10 text-[#ae5630] dark:bg-[#ae5630]/16 dark:text-[#d4845f]',
  bonus:   'bg-[#D97706]/10 text-[#D97706] dark:bg-[#D97706]/16 dark:text-[#F59E0B]',
};

/** 交易类型图标容器背景 */
const TX_ICON_BG: Record<TransactionType, string> = {
  deposit: 'bg-[#788c5d]/10 dark:bg-[#788c5d]/14',
  usage:   'bg-[#d97757]/10 dark:bg-[#d97757]/14',
  refund:  'bg-[#ae5630]/8 dark:bg-[#ae5630]/12',
  bonus:   'bg-[#D97706]/8 dark:bg-[#D97706]/12',
};

/** 交易类型图标颜色 */
const TX_ICON_COLOR: Record<TransactionType, string> = {
  deposit: 'text-[#788c5d] dark:text-[#a3b48a]',
  usage:   'text-[#d97757] dark:text-[#e9a68e]',
  refund:  'text-[#ae5630] dark:text-[#d4845f]',
  bonus:   'text-[#D97706] dark:text-[#F59E0B]',
};

/** 金额颜色（正=olive，负=clay） */
const AMOUNT_COLOR = {
  positive: 'text-[#788c5d] dark:text-[#a3b48a]',
  negative: 'text-[#d97757] dark:text-[#e9a68e]',
} as const;

// ─── 图标组件 ───────────────────────────────────────────

export interface TransactionHistoryProps {
  className?: string;
}

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

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

function RotateCcwIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function GiftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function getTransactionTypeIcon(type: TransactionType): React.ReactNode {
  const iconClass = 'h-4 w-4';
  switch (type) {
    case 'deposit': return <ArrowUpIcon className={iconClass} />;
    case 'usage':   return <ArrowDownIcon className={iconClass} />;
    case 'refund':  return <RotateCcwIcon className={iconClass} />;
    case 'bonus':   return <GiftIcon className={iconClass} />;
    default:        return null;
  }
}

// ─── 骨架屏 ─────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3.5">
        <div className="w-9 h-9 rounded-full bg-[#1414130a] dark:bg-[#ffffff0a] animate-pulse" />
        <div className="flex flex-col gap-1.5">
          <div className="h-3.5 w-16 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
          <div className="h-3 w-28 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="h-4 w-20 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
        <div className="flex flex-col items-end gap-1">
          <div className="h-2.5 w-10 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
          <div className="h-3.5 w-16 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function SkeletonStatCard() {
  return (
    <div className="bg-white dark:bg-[#3d3d3a] rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#1414130a] dark:bg-[#ffffff0a] animate-pulse" />
        <div className="flex flex-col gap-1.5">
          <div className="h-3 w-14 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
          <div className="h-5 w-24 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── 交易记录行 ─────────────────────────────────────────

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const { t } = useTranslation();
  const isPositive = transaction.amount > 0;
  const txType = transaction.type as TransactionType;
  const txTimestamp = transaction.timestamp ?? Date.parse(String(transaction.createdAt));
  const txCurrency = transaction.currency ?? 'CNY';

  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1414130a] dark:border-[#ffffff08] last:border-b-0 hover:bg-[#1414130a] dark:hover:bg-[#ffffff06] transition-colors">
      {/* 类型图标 + 信息 */}
      <div className="flex items-center gap-3.5 flex-1 min-w-0">
        <div className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
          TX_ICON_BG[txType] ?? 'bg-[#1414130a] dark:bg-[#ffffff0a]'
        )}>
          <span className={TX_ICON_COLOR[txType] ?? 'text-[#87867f]'}>
            {getTransactionTypeIcon(txType)}
          </span>
        </div>

        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="flex items-center gap-2">
            {/* 类型标签 — 11px UPPERCASE */}
            <span className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium uppercase tracking-[0.05em] leading-none',
              TX_TAG_STYLES[txType] ?? 'bg-[#1414130a] text-[#87867f]'
            )}>
              {getTransactionTypeLabel(txType)}
            </span>
            {transaction.channel && (
              <span className="text-[11px] text-[#87867f] tracking-[0.02em]">
                {transaction.channel === 'stripe' && 'Stripe'}
                {transaction.channel === 'xunhu_wechat' && t('payment.wechat')}
                {transaction.channel === 'xunhu_alipay' && t('payment.alipay')}
              </span>
            )}
          </div>
          <span className="text-xs text-[#87867f]">
            {formatTimestamp(txTimestamp)}
          </span>
          {transaction.description && transaction.description.replace(/虎皮椒/g, '').trim() && (
            <span className="text-[11px] text-[#87867f]/70 truncate max-w-[220px]">
              {transaction.description.replace(/虎皮椒/g, '').trim()}
            </span>
          )}
        </div>
      </div>

      {/* 金额 + 余额 */}
      <div className="flex items-center gap-6">
        <span className={cn(
          'text-sm font-semibold tabular-nums',
          isPositive ? AMOUNT_COLOR.positive : AMOUNT_COLOR.negative
        )}>
          {isPositive ? '+' : ''}{formatAmount(transaction.amount, txCurrency)}
        </span>

        <div className="min-w-[90px] text-right">
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#87867f] leading-none mb-0.5">
            {t('payment.balance')}
          </p>
          <p className="text-sm font-semibold tabular-nums text-[#141413] dark:text-[#faf9f5]">
            {formatAmount(transaction.balanceAfter, txCurrency)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── 主组件 ─────────────────────────────────────────────

export function TransactionHistory({ className }: TransactionHistoryProps) {
  const { t } = useTranslation();
  const transactions = useBillingStore((s) => s.transactions);
  const transactionsLoading = useBillingStore((s) => s.transactionsLoading);
  const transactionsPagination = useBillingStore((s) => s.transactionsPagination);
  const fetchTransactions = useBillingStore((s) => s.fetchTransactions);

  const [typeFilter, setTypeFilter] = useState<TransactionType | ''>('');
  const [currentPage, setCurrentPage] = useState(1);

  const typeOptions: { value: TransactionType | ''; label: string }[] = [
    { value: '', label: t('transactions.filter.all', '全部类型') },
    { value: 'deposit', label: t('transactions.filter.recharge', '充值') },
    { value: 'usage', label: t('transactions.filter.usage', '消费') },
    { value: 'refund', label: t('transactions.filter.refund', '退款') },
    { value: 'bonus', label: t('transactions.filter.bonus', '奖励') },
  ];

  const loadData = useCallback(async () => {
    const filters: TransactionFilters = { page: currentPage, pageSize: 20 };
    if (typeFilter) filters.type = typeFilter;
    await fetchTransactions(filters);
  }, [currentPage, typeFilter, fetchTransactions]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(() => { loadData(); }, [loadData]);

  const handleTypeChange = useCallback((type: TransactionType | '') => {
    setTypeFilter(type);
    setCurrentPage(1);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const stats = React.useMemo(() => {
    let totalRecharge = 0;
    let totalConsumption = 0;
    transactions.forEach((tx) => {
      if (tx.type === 'deposit' || tx.type === 'bonus' || tx.type === 'refund') {
        totalRecharge += tx.amount;
      } else if (tx.type === 'usage') {
        totalConsumption += Math.abs(tx.amount);
      }
    });
    return { totalRecharge, totalConsumption };
  }, [transactions]);

  return (
    <div className={cn('flex flex-col h-full bg-[#faf9f5] dark:bg-[#141413]', className)}>
      {/* ── 页面标题栏 ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1414130a] dark:border-[#ffffff08]">
        <h1 className="text-lg font-semibold text-[#141413] dark:text-[#faf9f5]">
          {t('payment.history')}
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={transactionsLoading}
          className="border-[#1414130a] dark:border-[#ffffff08] text-[#141413] dark:text-[#faf9f5] hover:bg-[#1414130a] dark:hover:bg-[#ffffff06]"
        >
          <RefreshIcon className={cn('h-4 w-4 mr-1.5', transactionsLoading && 'animate-spin')} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* ── 统计卡片 ── */}
      <div className="grid grid-cols-2 gap-4 px-6 py-4">
        {transactionsLoading && transactions.length === 0 ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            {/* 总收入 — olive */}
            <div className="bg-white dark:bg-[#3d3d3a] rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#788c5d]/10 dark:bg-[#788c5d]/14 flex items-center justify-center">
                  <ArrowUpIcon className="h-5 w-5 text-[#788c5d] dark:text-[#a3b48a]" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#87867f] mb-0.5">
                    {t('transactions.stats.totalIncome', '总收入')}
                  </p>
                  <p className="text-xl font-semibold tabular-nums text-[#788c5d] dark:text-[#a3b48a]">
                    +{formatAmount(stats.totalRecharge, 'CNY')}
                  </p>
                </div>
              </div>
            </div>

            {/* 总支出 — clay */}
            <div className="bg-white dark:bg-[#3d3d3a] rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#d97757]/10 dark:bg-[#d97757]/14 flex items-center justify-center">
                  <ArrowDownIcon className="h-5 w-5 text-[#d97757] dark:text-[#e9a68e]" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#87867f] mb-0.5">
                    {t('transactions.stats.totalExpense', '总支出')}
                  </p>
                  <p className="text-xl font-semibold tabular-nums text-[#d97757] dark:text-[#e9a68e]">
                    -{formatAmount(stats.totalConsumption, 'CNY')}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── 类型筛选器 ── */}
      <div className="flex items-center px-6 py-2.5 border-b border-[#1414130a] dark:border-[#ffffff08]">
        <div className="flex rounded-xl overflow-hidden border border-[#1414130a] dark:border-[#ffffff08]">
          {typeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleTypeChange(option.value)}
              className={cn(
                'px-3.5 py-1.5 text-xs font-medium transition-colors',
                typeFilter === option.value
                  ? 'bg-[#ae5630] text-white'
                  : 'bg-white dark:bg-[#3d3d3a] text-[#141413] dark:text-[#faf9f5] hover:bg-[#1414130a] dark:hover:bg-[#ffffff06]'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 交易列表 ── */}
      <div className="flex-1 overflow-hidden">
        {transactionsLoading && transactions.length === 0 ? (
          /* 骨架屏 */
          <div className="px-6 py-2">
            <div className="bg-white dark:bg-[#3d3d3a] rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          </div>
        ) : transactions.length === 0 ? (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center h-full">
            <EmptyIcon className="h-14 w-14 mb-3 text-[#87867f]/50" />
            <p className="text-base font-medium text-[#141413] dark:text-[#faf9f5]">
              {t('payment.noHistory')}
            </p>
            <p className="text-sm text-[#87867f] mt-1">
              {t('transactions.emptyHint', '交易记录将显示在这里')}
            </p>
          </div>
        ) : (
          /* 列表 — 白底卡片包裹，border-b 分割 */
          <ScrollArea className="h-full">
            <div className="px-6 py-2">
              <div className="bg-white dark:bg-[#3d3d3a] rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] overflow-hidden">
                {transactions.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* ── 分页 ── */}
      {transactionsPagination && transactionsPagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#1414130a] dark:border-[#ffffff08]">
          <p className="text-xs text-[#87867f] tabular-nums">
            {t('transactions.pagination', '共 {{total}} 条记录，第 {{page}} / {{pages}} 页', {
              total: transactionsPagination.total,
              page: transactionsPagination.page,
              pages: transactionsPagination.totalPages,
            })}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#1414130a] dark:border-[#ffffff08] text-[#141413] dark:text-[#faf9f5] hover:bg-[#1414130a] dark:hover:bg-[#ffffff06] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums text-[#141413] dark:text-[#faf9f5] px-2">
              {currentPage}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= transactionsPagination.totalPages}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#1414130a] dark:border-[#ffffff08] text-[#141413] dark:text-[#faf9f5] hover:bg-[#1414130a] dark:hover:bg-[#ffffff06] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionHistory;
