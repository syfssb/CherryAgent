import { cn } from '@/ui/lib/utils';
import claudeIcon from '@/ui/assets/avatars/claude.png';
import openaiIcon from '@/ui/assets/avatars/openai.png';

/**
 * 根据 provider 字符串判断是否为 Anthropic 系模型
 */
function isAnthropic(provider: string): boolean {
  const p = provider.toLowerCase();
  return p.includes('anthropic') || p.includes('claude');
}

/**
 * 根据 provider 字符串判断是否为 OpenAI 系模型
 */
function isOpenAI(provider: string): boolean {
  const p = provider.toLowerCase();
  return p.includes('openai') || p.includes('gpt') || p.includes('codex') || p.includes('o1') || p.includes('o3');
}

/**
 * 根据模型 ID 字符串判断 provider
 */
export function getProviderFromModelId(modelId: string): 'anthropic' | 'openai' | 'unknown' {
  const m = modelId.toLowerCase();
  if (m.includes('claude') || m.includes('anthropic')) return 'anthropic';
  if (m.includes('gpt') || m.includes('openai') || m.includes('codex') || m.includes('o1') || m.includes('o3')) return 'openai';
  return 'unknown';
}

export interface ProviderIconProps {
  /** provider 名称（如 "anthropic", "openai", "claude", "gpt"） */
  provider: string;
  /** 图标尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** 额外类名 */
  className?: string;
}

const SIZE_MAP = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

/**
 * Provider 图标组件
 * 根据 provider 字符串显示对应的品牌图标（Anthropic / OpenAI）
 */
export function ProviderIcon({ provider, size = 'sm', className }: ProviderIconProps) {
  const sizeClass = SIZE_MAP[size];

  if (isAnthropic(provider)) {
    return (
      <img
        src={claudeIcon}
        alt="Anthropic"
        className={cn(sizeClass, 'rounded-sm object-contain', className)}
      />
    );
  }

  if (isOpenAI(provider)) {
    return (
      <img
        src={openaiIcon}
        alt="OpenAI"
        className={cn(sizeClass, 'rounded-sm object-contain dark:invert', className)}
      />
    );
  }

  // 未知 provider 不显示图标
  return null;
}

/**
 * 根据模型 ID 显示 Provider 图标
 */
export function ModelProviderIcon({
  modelId,
  size = 'sm',
  className,
}: {
  modelId: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const provider = getProviderFromModelId(modelId);
  if (provider === 'unknown') return null;
  return <ProviderIcon provider={provider} size={size} className={className} />;
}

export default ProviderIcon;
