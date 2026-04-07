import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getCreditsLabel } from "@/ui/store/useAuthStore";
import { ProviderIcon } from "@/ui/components/ProviderIcon";

/**
 * 消息使用量信息
 */
export interface MessageUsageInfo {
  /** 输入 Token 数量 */
  inputTokens: number;
  /** 输出 Token 数量 */
  outputTokens: number;
  /** 总 Token 数量 */
  totalTokens: number;
  /** 缓存读取 Token 数量 */
  cacheReadTokens?: number;
  /** 缓存写入 Token 数量 */
  cacheWriteTokens?: number;
  /** 费用 (积分) */
  cost: number;
  /** 费用明细 */
  costBreakdown?: {
    inputCost: number;
    outputCost: number;
  };
  /** 延迟 (毫秒) */
  latencyMs: number;
  /** 首个 Token 延迟 (毫秒) */
  firstTokenLatencyMs?: number | null;
  /** 模型名称 */
  model: string;
  /** 提供商 */
  provider: string;
  /** 渠道 ID */
  channelId?: string;
  /** 请求 ID */
  requestId?: string;
}

/**
 * 格式化费用显示（积分）
 * 将美元费用转换为积分显示
 * 汇率：1 USD ≈ 7.2 CNY，1 CNY = 10 积分
 */
function formatCostCredits(costUSD: number): string {
  const credits = costUSD * 7.2 * 10;
  const label = getCreditsLabel();
  if (credits < 0.01) {
    return `${credits.toFixed(4)} ${label}`;
  }
  if (credits < 0.1) {
    return `${credits.toFixed(3)} ${label}`;
  }
  if (credits < 1) {
    return `${credits.toFixed(2)} ${label}`;
  }
  return `${credits.toFixed(2)} ${label}`;
}

/**
 * 格式化费用显示（默认显示积分）
 */
function formatCost(cost: number): string {
  return formatCostCredits(cost);
}

/**
 * 格式化 Token 数量显示
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 10_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(2)}K`;
  }
  return tokens.toLocaleString();
}

/**
 * 格式化延迟显示
 */
function formatLatency(ms: number): string {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(1)}min`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

/**
 * 格式化模型名称
 */
function formatModelName(model: string): string {
  // 移除日期后缀
  return model
    .replace(/-\d{8}$/, "")
    .replace(/\d{8}$/, "");
}

/**
 * MessageCost 组件属性
 */
export interface MessageCostProps {
  /** 使用量信息（完整版） */
  usage?: MessageUsageInfo;
  /** 简单费用（降级版，当没有完整 usage 信息时） */
  cost?: number;
  /** 是否默认展开 */
  defaultExpanded?: boolean;
  /** 简洁模式 (只显示总费用) */
  compact?: boolean;
}

/**
 * 消息费用显示组件
 * 显示消息的费用明细、Token 使用量、模型信息等
 *
 * @example
 * // 完整版（带详细信息）
 * <MessageCost usage={usageInfo} />
 *
 * @example
 * // 简单版（只有费用）
 * <MessageCost cost={0.0015} compact />
 */
export function MessageCost({
  usage,
  cost,
  defaultExpanded = false,
  compact = false,
}: MessageCostProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // 如果没有任何数据，返回 null
  if (!usage && !cost) {
    return null;
  }

  // 简洁模式或只有简单费用数据
  if (compact || !usage) {
    const displayCost = usage?.cost || cost || 0;
    return (
      <span className="text-xs text-ink-500 font-mono">
        {formatCost(displayCost)}
      </span>
    );
  }

  // 完整版（带详细信息）

  // 计算统计数据
  const tokensPerSecond = usage.latencyMs > 0
    ? Math.round((usage.outputTokens / usage.latencyMs) * 1000)
    : 0;

  return (
    <div className="mt-3 select-none">
      {/* 折叠的摘要行 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-ink-500 hover:text-ink-700 transition-colors group w-full"
      >
        <span className="flex items-center gap-1.5 font-mono">
          <CostIcon className="w-3.5 h-3.5 text-accent/70" />
          <span className="text-accent font-medium">{formatCost(usage.cost)}</span>
        </span>
        <span className="text-ink-400">|</span>
        <span className="flex items-center gap-1">
          <TokenIcon className="w-3.5 h-3.5 text-ink-400" />
          <span>{formatTokens(usage.totalTokens)}</span>
        </span>
        <span className="text-ink-400">|</span>
        <span className="flex items-center gap-1">
          <ClockIcon className="w-3.5 h-3.5 text-ink-400" />
          <span>{formatLatency(usage.latencyMs)}</span>
        </span>
        <span className="ml-auto text-ink-400 group-hover:text-ink-500">
          {isExpanded ? (
            <ChevronUpIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          )}
        </span>
      </button>

      {/* 展开的详细信息 */}
      {isExpanded && (
        <div className="mt-2 p-3 rounded-lg bg-surface-tertiary/50 border border-ink-900/5 text-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {/* 模型信息 */}
            <div className="col-span-2 flex items-center gap-2 pb-2 border-b border-ink-900/5">
              <ProviderIcon provider={usage.provider} size="xs" />
              <span className="text-ink-600 font-medium">
                {formatModelName(usage.model)}
              </span>
              <span className="text-ink-400 text-[11px]">
                ({usage.provider})
              </span>
            </div>

            {/* Token 详情 */}
            <div className="space-y-1.5">
              <div className="text-ink-400 text-[11px] uppercase tracking-wide">
                {t("messageCost.tokenUsage", "Token 使用量")}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">
                  {t("messageCost.input", "输入")}
                </span>
                <span className="font-mono text-ink-700">
                  {formatTokens(usage.inputTokens)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">
                  {t("messageCost.output", "输出")}
                </span>
                <span className="font-mono text-ink-700">
                  {formatTokens(usage.outputTokens)}
                </span>
              </div>
              {(usage.cacheReadTokens ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">
                    {t("messageCost.cacheRead", "缓存读取")}
                  </span>
                  <span className="font-mono text-green-600">
                    {formatTokens(usage.cacheReadTokens!)}
                  </span>
                </div>
              )}
              {(usage.cacheWriteTokens ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">
                    {t("messageCost.cacheWrite", "缓存写入")}
                  </span>
                  <span className="font-mono text-amber-600">
                    {formatTokens(usage.cacheWriteTokens!)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-ink-900/5">
                <span className="text-ink-600 font-medium">
                  {t("messageCost.total", "总计")}
                </span>
                <span className="font-mono text-ink-700 font-medium">
                  {formatTokens(usage.totalTokens)}
                </span>
              </div>
            </div>

            {/* 费用详情 */}
            <div className="space-y-1.5">
              <div className="text-ink-400 text-[11px] uppercase tracking-wide">
                {t("messageCost.costBreakdown", "费用明细")}
              </div>
              {usage.costBreakdown ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500">
                      {t("messageCost.input", "输入")}
                    </span>
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-ink-700">
                        {formatCostCredits(usage.costBreakdown.inputCost)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500">
                      {t("messageCost.output", "输出")}
                    </span>
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-ink-700">
                        {formatCostCredits(usage.costBreakdown.outputCost)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-ink-400 italic">
                  {t("messageCost.noBreakdown", "无明细")}
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-ink-900/5">
                <span className="text-ink-600 font-medium">
                  {t("messageCost.total", "总计")}
                </span>
                <div className="flex flex-col items-end">
                  <span className="font-mono text-accent font-medium">
                    {formatCostCredits(usage.cost)}
                  </span>
                </div>
              </div>
            </div>

            {/* 性能信息 */}
            <div className="col-span-2 pt-2 mt-1 border-t border-ink-900/5">
              <div className="text-ink-400 text-[11px] uppercase tracking-wide mb-1.5">
                {t("messageCost.performance", "性能")}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-500">
                    {t("messageCost.latency", "总耗时")}
                  </span>
                  <span className="font-mono text-ink-700">
                    {formatLatency(usage.latencyMs)}
                  </span>
                </div>
                {usage.firstTokenLatencyMs && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-500">
                      {t("messageCost.firstToken", "首 Token")}
                    </span>
                    <span className="font-mono text-ink-700">
                      {formatLatency(usage.firstTokenLatencyMs)}
                    </span>
                  </div>
                )}
                {tokensPerSecond > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-500">
                      {t("messageCost.speed", "速度")}
                    </span>
                    <span className="font-mono text-ink-700">
                      {t("messageCost.tokensPerSecond", "{{count}} tok/s", {
                        count: tokensPerSecond,
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 请求 ID */}
            {usage.requestId && (
              <div className="col-span-2 pt-2 mt-1 border-t border-ink-900/5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-ink-400">
                    {t("messageCost.requestId", "请求 ID")}:
                  </span>
                  <code className="text-ink-500 font-mono bg-surface-tertiary px-1.5 py-0.5 rounded">
                    {usage.requestId}
                  </code>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 图标组件
// ==========================================

function CostIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function TokenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

export default MessageCost;
