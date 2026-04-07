/**
 * ShortcutsHelp - 快捷键帮助面板
 *
 * 显示所有可用快捷键的分组列表。
 * 使用项目现有的 Dialog 样式（参考 SettingsModal）。
 */

import { useMemo } from "react";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";

interface ShortcutItem {
  id: string;
  displayLabel: string;
  description: string;
  group: "navigation" | "session" | "interface";
}

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutItem[];
}

/**
 * 将快捷键标签拆分为按键片段，用于渲染 <kbd> 标签
 */
function parseKeys(label: string): string[] {
  return label.split(/\s*\+\s*/);
}

/**
 * 分组标题映射
 */
const GROUP_TITLES: Record<string, string> = {
  navigation: "Navigation",
  session: "Session",
  interface: "Interface",
};

const GROUP_ICONS: Record<string, JSX.Element> = {
  navigation: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12h18M12 3l9 9-9 9" />
    </svg>
  ),
  session: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  interface: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
};

const GROUP_ORDER: Array<"navigation" | "session" | "interface"> = [
  "navigation",
  "session",
  "interface",
];

const EXTRA_SHORTCUTS: ShortcutItem[] = [
  {
    id: "browse-input-history",
    displayLabel: "↑ / ↓",
    description: "上下切换输入历史",
    group: "interface",
  },
];

export function ShortcutsHelp({ open, onClose, shortcuts }: ShortcutsHelpProps) {
  const { t } = useTranslation();

  const grouped = useMemo(() => {
    const groups: Record<string, ShortcutItem[]> = {};
    for (const shortcut of [...shortcuts, ...EXTRA_SHORTCUTS]) {
      const group = shortcut.group;
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(shortcut);
    }
    return groups;
  }, [shortcuts]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-ink-900/5 bg-surface shadow-elevated overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-ink-900/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12" />
            </svg>
            <h2 className="text-base font-semibold text-ink-900">
              {t("shortcutsHelp.title", "快捷键")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-900/5 hover:text-ink-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-6">
          {GROUP_ORDER.map((groupKey) => {
            const items = grouped[groupKey];
            if (!items || items.length === 0) return null;

            return (
              <div key={groupKey}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-ink-500">
                    {GROUP_ICONS[groupKey]}
                  </span>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                    {t(`shortcutsHelp.group.${groupKey}`, GROUP_TITLES[groupKey])}
                  </h3>
                </div>
                <div className="space-y-1">
                  {items.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-ink-900/[0.03] transition-colors"
                    >
                      <span className="text-sm text-ink-700">
                        {t(`shortcutsHelp.actions.${shortcut.id}`, shortcut.description)}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        {parseKeys(shortcut.displayLabel).map((key, idx) => (
                          <span key={idx}>
                            {idx > 0 && (
                              <span className="text-ink-400 text-xs mx-0.5">+</span>
                            )}
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md border border-ink-900/10 bg-ink-900/[0.04] text-xs font-medium text-ink-600 shadow-sm">
                              {key}
                            </kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部提示 */}
        <div className="border-t border-ink-900/10 px-6 py-3">
          <p className="text-xs text-ink-400 text-center">
            {t("shortcutsHelp.hint", "按 Escape 关闭此面板")}
          </p>
        </div>
      </div>
    </div>
  );
}
