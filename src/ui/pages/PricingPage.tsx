import { useTranslation } from 'react-i18next';
import { useRouter } from '@/ui/hooks/useRouter';
import { useModels, type Model } from '@/ui/hooks/useModels';
import { ProviderIcon } from '@/ui/components/ProviderIcon';

/**
 * Provider badge 暖色调样式映射
 * 遵循 Anthropic 色彩系统：accent / olive / sky / teal
 */
function getProviderStyle(provider: string): string {
  const p = provider.toLowerCase();
  if (p.includes('anthropic') || p.includes('claude')) {
    return 'bg-[rgba(174,86,48,0.08)] text-[#ae5630] dark:bg-[rgba(174,86,48,0.18)] dark:text-[#d97757]';
  }
  if (p.includes('openai') || p.includes('gpt')) {
    return 'bg-[rgba(120,140,93,0.08)] text-[#788c5d] dark:bg-[rgba(120,140,93,0.18)] dark:text-[#9db57d]';
  }
  if (p.includes('google') || p.includes('gemini')) {
    return 'bg-[rgba(106,155,204,0.08)] text-[#6a9bcc] dark:bg-[rgba(106,155,204,0.18)] dark:text-[#6a9bcc]';
  }
  if (p.includes('deepseek')) {
    return 'bg-[rgba(77,128,120,0.08)] text-[#4d8078] dark:bg-[rgba(77,128,120,0.18)] dark:text-[#8bbdb4]';
  }
  return 'bg-[#1414130a] text-[#87867f] dark:bg-[rgba(250,249,245,0.06)] dark:text-[#b0aea5]';
}

/**
 * Feature 标签样式（accent 暖橙）
 */
const FEATURE_TAG_CLASS =
  'rounded-full bg-[rgba(174,86,48,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[#ae5630] dark:bg-[rgba(174,86,48,0.15)] dark:text-[#d97757]';

/**
 * UseCase 标签样式（sky 蓝灰）
 */
const USECASE_TAG_CLASS =
  'rounded-full bg-[rgba(106,155,204,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[#6a9bcc] dark:bg-[rgba(106,155,204,0.15)] dark:text-[#6a9bcc]';

/** 格式化积分价格 */
function formatCredits(value: number): string {
  if (value === 0) return '0';
  if (value < 0.01) return value.toFixed(4);
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toString();
}

/** 格式化 context 长度 */
function formatContextLength(tokens: number): string {
  if (!tokens) return '-';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return tokens.toString();
}

/**
 * 价格行组件 — flex 两端对齐 + 底部分割线
 */
function PriceRow({
  label,
  value,
  unit,
  isLast = false,
}: {
  label: string;
  value: string;
  unit: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-2 ${
        isLast ? '' : 'border-b border-[#1414130a] dark:border-[rgba(250,249,245,0.06)]'
      }`}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#87867f]">
        {label}
      </span>
      <span className="text-[16px] font-semibold tabular-nums text-[#141413] dark:text-[#faf9f5]">
        {value}
        <span className="ml-1 text-[11px] font-normal text-[#87867f]">{unit}</span>
      </span>
    </div>
  );
}

/**
 * 模型价格卡片 — Anthropic 设计语言
 */
function ModelPricingCard({ model }: { model: Model }) {
  const { t } = useTranslation();

  // 收集价格行数据
  const priceRows: { label: string; value: string }[] = [
    {
      label: t('models.pricing.input', '输入价格'),
      value: formatCredits(model.pricing.inputCreditsPerMtok),
    },
    {
      label: t('models.pricing.output', '输出价格'),
      value: formatCredits(model.pricing.outputCreditsPerMtok),
    },
  ];
  if (model.pricing.cacheReadCreditsPerMtok > 0) {
    priceRows.push({
      label: t('models.pricing.cacheRead', '缓存读取'),
      value: formatCredits(model.pricing.cacheReadCreditsPerMtok),
    });
  }
  if (model.pricing.cacheWriteCreditsPerMtok > 0) {
    priceRows.push({
      label: t('models.pricing.cacheWrite', '缓存写入'),
      value: formatCredits(model.pricing.cacheWriteCreditsPerMtok),
    });
  }

  const unit = t('models.pricing.creditsPerMtok', '积分/M');
  const hasTags = model.features.length > 0 || model.useCases.length > 0;

  return (
    <div
      className={[
        'rounded-2xl border border-[#1414130a] bg-white p-5',
        'shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]',
        'transition-shadow duration-200 hover:shadow-[0_2px_4px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_24px_32px_rgba(0,0,0,0.06)]',
        'dark:border-[rgba(250,249,245,0.06)] dark:bg-[#3d3d3a]',
        'dark:shadow-[0_2px_2px_rgba(0,0,0,0.06),0_4px_4px_rgba(0,0,0,0.08),0_16px_24px_rgba(0,0,0,0.12)]',
      ].join(' ')}
    >
      {/* 头部：模型名 + provider badge */}
      <div className="flex items-center justify-between mb-1">
        <h3
          className="text-[16px] font-semibold text-[#141413] dark:text-[#faf9f5]"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          {model.displayName}
        </h3>
        <span
          className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${getProviderStyle(
            model.provider
          )}`}
        >
          <ProviderIcon provider={model.provider} size="sm" />
          {model.provider}
        </span>
      </div>

      {/* 模型描述 — 衬线体 */}
      {model.description && (
        <p
          className="mb-3 text-[13px] leading-[1.6] text-[#87867f]"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          {model.description}
        </p>
      )}

      {/* 标签 — Anthropic 暖色调 */}
      {hasTags && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {model.features.map((feature) => (
            <span key={`f-${model.id}-${feature}`} className={FEATURE_TAG_CLASS}>
              {feature}
            </span>
          ))}
          {model.useCases.map((useCase) => (
            <span key={`u-${model.id}-${useCase}`} className={USECASE_TAG_CLASS}>
              {useCase}
            </span>
          ))}
        </div>
      )}

      {/* 价格行 */}
      <div>
        {priceRows.map((row, i) => (
          <PriceRow
            key={row.label}
            label={row.label}
            value={row.value}
            unit={unit}
            isLast={i === priceRows.length - 1}
          />
        ))}
      </div>

      {/* 底部元数据 — icon + inline text */}
      {(model.limits.maxTokens > 0 || model.limits.maxContextLength > 0) && (
        <div className="mt-3 flex items-center gap-4">
          {model.limits.maxTokens > 0 && (
            <div className="flex items-center gap-1.5 text-[12px] text-[#87867f]">
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 2v20M2 12h20" />
              </svg>
              <span>
                {t('models.limits.maxOutput', '最大输出')}{' '}
                <span className="font-semibold tabular-nums text-[#141413] dark:text-[#faf9f5]">
                  {formatContextLength(model.limits.maxTokens)}
                </span>
              </span>
            </div>
          )}
          {model.limits.maxContextLength > 0 && (
            <div className="flex items-center gap-1.5 text-[12px] text-[#87867f]">
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              <span>
                {t('models.limits.context', '上下文')}{' '}
                <span className="font-semibold tabular-nums text-[#141413] dark:text-[#faf9f5]">
                  {formatContextLength(model.limits.maxContextLength)}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 模型价格展示页面 — Anthropic 设计语言
 */
export function PricingPage() {
  const { t } = useTranslation();
  const { navigate } = useRouter();
  const { models, loading, error, refresh, note } = useModels();

  return (
    <div className="flex h-full flex-col bg-[#faf9f5] dark:bg-[#141413]">
      {/* 页面标题栏 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1414130a] dark:border-[rgba(250,249,245,0.06)]">
        <div className="flex items-center gap-3">
          {/* 返回按钮 */}
          <button
            onClick={() => navigate('/chat')}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-[#87867f] transition-colors duration-150 hover:bg-[#1414130a] hover:text-[#141413] dark:hover:bg-[rgba(250,249,245,0.06)] dark:hover:text-[#faf9f5]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {t('common.back', '返回')}
          </button>

          <div className="h-5 w-px bg-[#1414131a] dark:bg-[rgba(250,249,245,0.1)]" />

          <div>
            <h1
              className="text-xl font-semibold text-[#141413] dark:text-[#faf9f5]"
              style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
            >
              {t('models.pricingTitle', '模型价格')}
            </h1>
            {note && (
              <p className="mt-0.5 text-[13px] text-[#87867f]">{note}</p>
            )}
          </div>
        </div>

        {/* 刷新按钮 */}
        <button
          onClick={refresh}
          disabled={loading}
          className={[
            'flex items-center gap-2 rounded-lg border border-[#1414130a] bg-white px-3.5 py-1.5',
            'text-[13px] font-medium text-[#141413]',
            'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
            'transition-all duration-150 hover:bg-[#f5f4f0] disabled:opacity-40',
            'dark:border-[rgba(250,249,245,0.06)] dark:bg-[#3d3d3a] dark:text-[#faf9f5] dark:hover:bg-[#4a4a46]',
          ].join(' ')}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          {t('common.refresh', '刷新')}
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading && models.length === 0 ? (
          /* 加载状态 */
          <div className="flex items-center justify-center py-20">
            <svg className="h-8 w-8 animate-spin text-[#ae5630]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-80"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        ) : error ? (
          /* 错误状态 */
          <div className="flex flex-col items-center justify-center py-20">
            <svg
              viewBox="0 0 24 24"
              className="mb-4 h-12 w-12 text-[#87867f]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <p className="text-[16px] font-semibold text-[#141413] dark:text-[#faf9f5]">
              {t('common.error', '加载失败')}
            </p>
            <p className="mt-1 text-[13px] text-[#87867f]">{error}</p>
            <button
              onClick={refresh}
              className="mt-5 rounded-lg bg-[#ae5630] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#c4633a] active:scale-[0.98]"
            >
              {t('common.retry', '重试')}
            </button>
          </div>
        ) : (
          /* 模型卡片网格 */
          <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {models.map((model) => (
              <ModelPricingCard key={model.id} model={model} />
            ))}
          </div>
        )}

        {/* 计费说明卡片 */}
        {models.length > 0 && (
          <div
            className={[
              'mx-auto mt-8 max-w-[1120px] rounded-2xl border border-[#1414130a] bg-white p-5',
              'shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]',
              'dark:border-[rgba(250,249,245,0.06)] dark:bg-[#3d3d3a]',
              'dark:shadow-[0_2px_2px_rgba(0,0,0,0.06),0_4px_4px_rgba(0,0,0,0.08),0_16px_24px_rgba(0,0,0,0.12)]',
            ].join(' ')}
          >
            <h3
              className="mb-2.5 text-[14px] font-semibold text-[#141413] dark:text-[#faf9f5]"
              style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
            >
              {t('models.pricingNote.title', '计费说明')}
            </h3>
            <ul className="space-y-1.5 text-[13px] leading-[1.6] text-[#87867f]">
              <li className="flex items-start gap-2">
                <span className="mt-[7px] block h-1 w-1 shrink-0 rounded-full bg-[#b0aea5]" />
                {t('models.pricingNote.unit', '价格单位为「积分/百万 Token」')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[7px] block h-1 w-1 shrink-0 rounded-full bg-[#b0aea5]" />
                {t(
                  'models.pricingNote.billing',
                  '按实际使用的 Token 数量计费，输入和输出分别计价'
                )}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[7px] block h-1 w-1 shrink-0 rounded-full bg-[#b0aea5]" />
                {t(
                  'models.pricingNote.cache',
                  '缓存价格适用于支持 prompt caching 的模型，可显著降低重复内容的费用'
                )}
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default PricingPage;
