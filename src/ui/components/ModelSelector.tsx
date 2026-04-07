import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useModels, type Model } from '@/ui/hooks/useModels';
import { useAppStore } from '@/ui/store/useAppStore';
import { ProviderIcon } from '@/ui/components/ProviderIcon';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/ui/components/ui';
import type { AgentProvider } from '@/ui/types';

interface ModelSelectorProps {
  compact?: boolean;
  className?: string;
  disabled?: boolean;
}

/**
 * 推断模型所属的 agent provider
 */
function inferModelProvider(model: Model): AgentProvider | null {
  const p = model.provider.toLowerCase();
  if (p.includes('anthropic') || p.includes('claude')) return 'claude';
  if (p.includes('openai')) return 'codex';

  const id = model.id.toLowerCase();
  if (id.includes('claude') || id.includes('anthropic')) return 'claude';
  if (id.includes('codex') || id.includes('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) return 'codex';

  return null;
}

/**
 * 格式化积分价格
 */
function formatCredits(value: number): string {
  if (value === 0) return '0';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toString();
}

/**
 * 模型选项行 — 紧凑单行风格
 */
function ModelOption({
  model,
  isSelected,
  onSelect,
}: {
  model: Model;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
        isSelected
          ? 'bg-surface-secondary'
          : 'hover:bg-surface-secondary'
      }`}
    >
      <ProviderIcon provider={model.provider} size="xs" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[13px] font-medium truncate ${isSelected ? 'text-accent' : 'text-ink-800'}`}>
            {model.displayName}
          </span>
          {model.tags.map((tag) => (
            <span key={tag} className="shrink-0 text-[10px] text-accent/70 font-medium">
              · {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-px text-[10px] text-muted">
          <span>{t('models.input', '输入')}: {formatCredits(model.pricing.inputCreditsPerMtok)}</span>
          <span>{t('models.output', '输出')}: {formatCredits(model.pricing.outputCreditsPerMtok)}</span>
        </div>
      </div>

      {isSelected && (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}

/**
 * 模型选择器组件
 * 下拉选择可用模型，显示模型名称和价格
 */
export function ModelSelector({
  compact = false,
  className = '',
  disabled = false,
}: ModelSelectorProps) {
  const { t } = useTranslation();
  const { models, loading, selectedModel, selectedModelId, selectModel } =
    useModels();
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 当前活跃会话的 provider，用于过滤可选模型
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const sessions = useAppStore((state) => state.sessions);
  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const sessionProvider = activeSession?.provider;

  // 会话进行中时，只显示同 provider 的模型
  const filteredModels = useMemo(() => {
    if (!sessionProvider || !activeSessionId) return models;
    return models.filter((m) => {
      const mp = inferModelProvider(m);
      return !mp || mp === sessionProvider;
    });
  }, [models, sessionProvider, activeSessionId]);

  const computeDropdownPosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const dropdownWidth = 260;
    const dropdownHeight = 320; // max-h-64 (256) + footer (~40) + padding

    let left = triggerRect.left;
    if (left + dropdownWidth > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - dropdownWidth - margin);
    }

    // 下方空间不足时向上展开
    const spaceBelow = viewportHeight - triggerRect.bottom - margin;
    const openUpward = spaceBelow < dropdownHeight && triggerRect.top > dropdownHeight;

    setDropdownStyle({
      position: 'fixed',
      ...(openUpward
        ? { bottom: viewportHeight - triggerRect.top + 6 }
        : { top: triggerRect.bottom + 6 }),
      left,
      width: dropdownWidth,
      zIndex: 10000,
    });
  }, []);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // 打开时计算位置，并在窗口变化时实时更新
  useEffect(() => {
    if (!open) return;

    computeDropdownPosition();

    const handleUpdatePosition = () => computeDropdownPosition();
    window.addEventListener('resize', handleUpdatePosition);
    window.addEventListener('scroll', handleUpdatePosition, true);
    return () => {
      window.removeEventListener('resize', handleUpdatePosition);
      window.removeEventListener('scroll', handleUpdatePosition, true);
    };
  }, [open, computeDropdownPosition]);

  if (loading && models.length === 0) {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 text-xs text-muted ${className}`}>
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>{t('common.loading', '加载中...')}</span>
      </div>
    );
  }

  if (models.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className={`relative ${className}`} data-tour="model-selector">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => {
              if (disabled) return;
              setOpen((prev) => {
                const next = !prev;
                if (next) {
                  computeDropdownPosition();
                }
                return next;
              });
            }}
            disabled={disabled}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
              open
                ? 'bg-ink-900/8 text-ink-800'
                : 'text-ink-500 hover:bg-ink-900/6 hover:text-ink-700'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {selectedModel && <ProviderIcon provider={selectedModel.provider} size="xs" />}
            <span className={`${compact ? 'max-w-[120px]' : 'max-w-[180px]'} truncate`}>
              {selectedModel?.displayName ||
                t('models.selectModel', '选择模型')}
            </span>
            <svg
              viewBox="0 0 24 24"
              className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          <p className="font-medium">{t('models.modelButtonHint', 'AI 模型 — 点击切换')}</p>
          {selectedModel && (
            <p className="text-[10px] opacity-70 mt-0.5">{selectedModel.displayName} ({selectedModel.provider})</p>
          )}
        </TooltipContent>
      </Tooltip>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="rounded-xl border border-ink-900/10 bg-surface p-1 shadow-elevated"
            style={dropdownStyle}
          >
            <div className="max-h-72 overflow-y-auto">
              {filteredModels.map((model) => (
                <ModelOption
                  key={model.id}
                  model={model}
                  isSelected={model.id === selectedModelId}
                  onSelect={() => {
                    selectModel(model.id);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default ModelSelector;
