import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  ScrollArea,
  cn,
} from '@/ui/components/ui';
import {
  useBillingStore,
  formatAmount,
  formatTokens,
  formatTimestamp,
  type UsageFilters,
  type UsageRecord,
} from '@/ui/store/useBillingStore';
import { ModelProviderIcon } from '@/ui/components/ProviderIcon';

/**
 * UsageHistory 页面属性
 */
export interface UsageHistoryProps {
  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * 时间范围选项
 */
type TimeRange = 'today' | 'week' | 'month' | 'custom';

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
 * 搜索图标
 */
function SearchIcon({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/**
 * 日历图标
 */
function CalendarIcon({ className }: { className?: string }) {
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
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

/**
 * 刷新图标
 */
function RefreshIcon({ className }: { className?: string }) {
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
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

/**
 * 左箭头图标
 */
function ChevronLeftIcon({ className }: { className?: string }) {
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
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

/**
 * 右箭头图标
 */
function ChevronRightIcon({ className }: { className?: string }) {
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * 空状态图标
 */
function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect width="7" height="5" x="7" y="7" rx="1" />
      <rect width="7" height="5" x="10" y="12" rx="1" />
    </svg>
  );
}

/**
 * 骨架屏组件 — 统计卡片
 */
function StatCardSkeleton() {
  return (
    <div className="bg-white dark:bg-[#3d3d3a] rounded-2xl p-5 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]">
      <div className="h-3 w-16 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse mb-3" />
      <div className="h-7 w-24 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
    </div>
  );
}

/**
 * 骨架屏组件 — 记录行
 */
function RecordRowSkeleton() {
  return (
    <div className="flex items-center justify-between py-3.5 px-5 border-b border-[#1414130a] dark:border-[#ffffff08]">
      <div className="flex items-center gap-4 flex-1">
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-28 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
          <div className="h-3 w-20 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
        </div>
        <div className="h-5 w-32 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-full animate-pulse" />
      </div>
      <div className="flex items-center gap-6">
        <div className="h-4 w-16 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
        <div className="h-4 w-14 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
        <div className="h-4 w-14 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
        <div className="h-4 w-16 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

/**
 * 获取时间范围的开始时间
 */
function getTimeRangeStart(range: TimeRange): number {
  const now = new Date();
  switch (range) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    case 'week':
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return weekAgo.getTime();
    case 'month':
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return monthAgo.getTime();
    default:
      return 0;
  }
}

/**
 * 模型颜色映射
 * 基于 provider 关键字动态匹配，不硬编码具体模型名
 */
function getModelColor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('claude') || m.includes('anthropic')) {
    return 'bg-[#ae5630]/10 text-[#ae5630] dark:bg-[#ae5630]/20 dark:text-[#d97757]';
  }
  if (m.includes('gpt') || m.includes('openai') || m.includes('o1') || m.includes('o3')) {
    return 'bg-[#788c5d]/15 text-[#788c5d] dark:bg-[#788c5d]/20 dark:text-[#9db57d]';
  }
  if (m.includes('gemini') || m.includes('google')) {
    return 'bg-[#DBEAFE] text-[#2563EB] dark:bg-[#6a9bcc]/20 dark:text-[#6a9bcc]';
  }
  if (m.includes('deepseek')) {
    return 'bg-[#bcd1ca] text-[#4d8078] dark:bg-[#bcd1ca]/20 dark:text-[#bcd1ca]';
  }
  if (m.includes('llama') || m.includes('meta')) {
    return 'bg-[#cbcadb] text-[#5b5b8d] dark:bg-[#cbcadb]/20 dark:text-[#cbcadb]';
  }
  if (m.includes('mistral')) {
    return 'bg-[#ae5630]/10 text-[#ae5630] dark:bg-[#ae5630]/20 dark:text-[#d97757]';
  }
  return 'bg-[#1414130a] text-[#87867f] dark:bg-[#ffffff0a] dark:text-[#b0aea5]';
}

/**
 * 消费记录行组件
 */
function UsageRecordRow({ record }: { record: UsageRecord }) {
  const { t } = useTranslation();
  const balanceCreditsConsumed = record.balanceCreditsConsumed ?? Math.max(0, record.cost - (record.quotaUsed ?? 0));

  return (
    <div className="flex items-center justify-between py-3.5 px-5 hover:bg-[#1414130a] dark:hover:bg-[#ffffff06] transition-colors duration-100 border-b border-[#1414130a] dark:border-[#ffffff08] last:border-b-0">
      {/* 时间和模型 */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-[#141413] dark:text-[#faf9f5] tabular-nums">
            {formatTimestamp(record.timestamp ?? Date.parse(String(record.createdAt)))}
          </span>
          {record.sessionId && (
            <span className="text-[11px] text-[#87867f] truncate max-w-[150px]">
              {t('usage.session', '会话')}: {record.sessionId.slice(0, 8)}...
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          <ModelProviderIcon modelId={record.model} size="xs" />
          <Badge className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', getModelColor(record.model))}>
            {record.model}
          </Badge>
        </span>
      </div>

      {/* Token 数量 */}
      <div className="flex flex-col items-end mx-4 min-w-[100px]">
        <span className="text-sm text-[#141413] dark:text-[#faf9f5] font-semibold tabular-nums">
          {formatTokens(record.totalTokens)}
        </span>
        <span className="text-[11px] text-[#87867f] tabular-nums">
          {formatTokens(record.inputTokens)} / {formatTokens(record.outputTokens)}
        </span>
      </div>

      {/* 缓存读取 */}
      <div className="min-w-[70px] text-right mx-2">
        <span className="text-sm text-[#141413]/70 dark:text-[#faf9f5]/60 tabular-nums">
          {formatTokens(record.cacheReadTokens ?? 0)}
        </span>
      </div>

      {/* 缓存写入 */}
      <div className="min-w-[70px] text-right mx-2">
        <span className="text-sm text-[#141413]/70 dark:text-[#faf9f5]/60 tabular-nums">
          {formatTokens(record.cacheWriteTokens ?? 0)}
        </span>
      </div>

      {/* 费用 */}
      <div className="min-w-[80px] text-right">
        {record.quotaUsed && record.quotaUsed > 0 ? (
          <div className="space-y-0.5">
            <span className="text-[11px] text-[#ae5630] block tabular-nums">
              {t('usage.periodCardCost', '期卡')} -{(record.quotaUsed / 100).toFixed(2)}
            </span>
            {balanceCreditsConsumed > 0 && (
              <span className="text-[11px] text-[#DC2626] block tabular-nums">
                {t('usage.creditsCost', '积分')} -{formatAmount(balanceCreditsConsumed, record.currency)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm font-semibold text-[#DC2626] tabular-nums">
            -{formatAmount(record.cost, record.currency)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 消费记录页面
 */
export function UsageHistory({ className }: UsageHistoryProps) {
  const { t } = useTranslation();
  const usageRecords = useBillingStore((s) => s.usageRecords);
  // 过滤掉消费为 0 且 token 也为 0 的无效记录（如 haiku 内部探测请求）
  const filteredRecords = usageRecords.filter(
    (r) => r.cost > 0 || r.totalTokens > 0
  );
  const usageLoading = useBillingStore((s) => s.usageLoading);
  const usageSummary = useBillingStore((s) => s.usageSummary);
  const usagePagination = useBillingStore((s) => s.usagePagination);
  const fetchUsage = useBillingStore((s) => s.fetchUsage);

  // 筛选状态
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [modelFilter, setModelFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  /**
   * 可用的模型列表（从记录中提取）
   */
  const availableModels = useMemo(() => {
    const models = new Set(filteredRecords.map((r) => r.model));
    return Array.from(models).sort();
  }, [filteredRecords]);

  /**
   * 加载数据
   */
  const loadData = useCallback(async () => {
    const filters: UsageFilters = {
      page: currentPage,
      pageSize: 20,
    };

    if (timeRange !== 'custom') {
      filters.startTime = getTimeRangeStart(timeRange);
      filters.endTime = Date.now();
    }

    if (modelFilter) {
      filters.model = modelFilter;
    }

    await fetchUsage(filters);
  }, [currentPage, timeRange, modelFilter, fetchUsage]);

  /**
   * 初始加载
   */
  useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * 刷新数据
   */
  const handleRefresh = useCallback(() => {
    loadData();
  }, [loadData]);

  /**
   * 切换时间范围
   */
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    setTimeRange(range);
    setCurrentPage(1);
  }, []);

  /**
   * 切换模型筛选
   */
  const handleModelChange = useCallback((model: string) => {
    setModelFilter(model);
    setCurrentPage(1);
  }, []);

  /**
   * 切换页码
   */
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  /**
   * 时间范围选项
   */
  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: 'today', label: t('usage.range.today', '今天') },
    { value: 'week', label: t('usage.range.week', '最近一周') },
    { value: 'month', label: t('usage.range.month', '最近一月') },
  ];

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* 统计摘要卡片 */}
      <div className="grid grid-cols-3 gap-4 px-6 pt-5 pb-4">
        {usageLoading && !usageSummary ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : usageSummary ? (
          <>
            {/* 总请求数 */}
            <div className="bg-white dark:bg-[#3d3d3a] rounded-2xl p-5 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f] mb-2">
                {t('usage.stats.totalRequests', '总请求数')}
              </p>
              <p className="text-2xl font-semibold text-[#141413] dark:text-[#faf9f5] tabular-nums">
                {usageSummary.totalRequests.toLocaleString()}
              </p>
            </div>
            {/* 总 Token 数 */}
            <div className="bg-white dark:bg-[#3d3d3a] rounded-2xl p-5 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f] mb-2">
                {t('usage.stats.totalTokens', '总 Token 数')}
              </p>
              <p className="text-2xl font-semibold text-[#141413] dark:text-[#faf9f5] tabular-nums">
                {formatTokens(usageSummary.totalTokens)}
              </p>
            </div>
            {/* 总费用 */}
            <div className="bg-white dark:bg-[#3d3d3a] rounded-2xl p-5 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f] mb-2">
                {t('usage.stats.totalCost', '总费用')}
              </p>
              <p className="text-2xl font-semibold text-[#DC2626] tabular-nums">
                {formatAmount(usageSummary.totalCost, usageSummary.currency)}
              </p>
            </div>
          </>
        ) : null}
      </div>

      {/* 筛选器 */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-[#1414130a] dark:border-[#ffffff08]">
        {/* 时间范围 */}
        <div className="flex items-center gap-2.5">
          <CalendarIcon className="h-4 w-4 text-[#87867f]" />
          <div className="flex items-center gap-1">
            {timeRangeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleTimeRangeChange(option.value)}
                className={cn(
                  'px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors duration-150',
                  timeRange === option.value
                    ? 'bg-[#ae5630] text-white'
                    : 'text-[#87867f] hover:bg-[#1414130a] hover:text-[#141413] dark:hover:bg-[#ffffff08] dark:hover:text-[#faf9f5]'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-5 bg-[#1414131a] dark:bg-[#ffffff12]" />

        {/* 模型筛选 */}
        <div className="flex items-center gap-2">
          <SearchIcon className="h-4 w-4 text-[#87867f]" />
          <select
            value={modelFilter}
            onChange={(e) => handleModelChange(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] text-[#141413] dark:text-[#faf9f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630]/40 transition-shadow duration-150"
          >
            <option value="">{t('usage.model.all', '全部模型')}</option>
            {availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        {/* 右侧刷新按钮 */}
        <div className="ml-auto">
          <button
            onClick={handleRefresh}
            disabled={usageLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#87867f] hover:text-[#141413] dark:hover:text-[#faf9f5] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] rounded-lg transition-colors duration-150 disabled:opacity-40"
          >
            <RefreshIcon className={cn('h-3.5 w-3.5', usageLoading && 'animate-spin')} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* 记录列表 */}
      <div className="flex-1 overflow-hidden">
        {usageLoading && filteredRecords.length === 0 ? (
          /* 骨架屏加载态 */
          <div className="flex flex-col">
            {/* 表头骨架 */}
            <div className="flex items-center justify-between py-2.5 px-5 border-b border-[#1414130a] dark:border-[#ffffff08]">
              <div className="h-3 w-20 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
              <div className="flex gap-6">
                <div className="h-3 w-16 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
                <div className="h-3 w-12 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
                <div className="h-3 w-12 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
                <div className="h-3 w-14 bg-[#1414130a] dark:bg-[#ffffff0a] rounded-lg animate-pulse" />
              </div>
            </div>
            <RecordRowSkeleton />
            <RecordRowSkeleton />
            <RecordRowSkeleton />
            <RecordRowSkeleton />
            <RecordRowSkeleton />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <EmptyIcon className="h-14 w-14 text-[#87867f]/50 mb-4" />
            <p className="text-base font-medium text-[#141413] dark:text-[#faf9f5]">
              {t('usage.emptyTitle', '暂无消费记录')}
            </p>
            <p className="text-sm text-[#87867f] mt-1">
              {t('usage.emptyHint', '当您开始使用 API 后，消费记录将显示在这里')}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            {/* 表头 */}
            <div className="sticky top-0 z-10 flex items-center justify-between py-2.5 px-5 bg-[#faf9f5]/90 dark:bg-[#141413]/90 backdrop-blur-md border-b border-[#1414130a] dark:border-[#ffffff08]">
              <span className="flex-1 text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f]">
                {t('usage.table.timeModel', '时间 / 模型')}
              </span>
              <span className="min-w-[100px] text-right mr-4 text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f]">
                {t('usage.table.tokens', 'Token (输入/输出)')}
              </span>
              <span className="min-w-[70px] text-right mx-2 text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f]">
                {t('usage.table.cacheRead', '缓存读取')}
              </span>
              <span className="min-w-[70px] text-right mx-2 text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f]">
                {t('usage.table.cacheWrite', '缓存写入')}
              </span>
              <span className="min-w-[80px] text-right text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f]">
                {t('usage.table.cost', '费用')}
              </span>
            </div>

            {/* 记录列表 */}
            <div>
              {filteredRecords.map((record) => (
                <UsageRecordRow key={record.id} record={record} />
              ))}
            </div>

            {/* 列表底部加载状态 */}
            {usageLoading && filteredRecords.length > 0 && (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner className="h-5 w-5 text-[#ae5630]" />
              </div>
            )}
          </ScrollArea>
        )}
      </div>

      {/* 分页器 */}
      {usagePagination && usagePagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#1414130a] dark:border-[#ffffff08]">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f] tabular-nums">
            {t('usage.pagination', '共 {{total}} 条记录，第 {{page}} / {{pages}} 页', {
              total: usagePagination.total,
              page: usagePagination.page,
              pages: usagePagination.totalPages,
            })}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center justify-center h-8 w-8 rounded-lg border border-[#1414130a] dark:border-[#ffffff08] text-[#87867f] hover:bg-[#1414130a] hover:text-[#141413] dark:hover:bg-[#ffffff08] dark:hover:text-[#faf9f5] transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-[#141413] dark:text-[#faf9f5] tabular-nums px-2.5 min-w-[2rem] text-center">
              {currentPage}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= usagePagination.totalPages}
              className="flex items-center justify-center h-8 w-8 rounded-lg border border-[#1414130a] dark:border-[#ffffff08] text-[#87867f] hover:bg-[#1414130a] hover:text-[#141413] dark:hover:bg-[#ffffff08] dark:hover:text-[#faf9f5] transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default UsageHistory;
