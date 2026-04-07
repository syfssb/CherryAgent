import { useCallback, useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { PermissionMode } from "../../types";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";

interface PermissionModeSelectorProps {
  value: PermissionMode;
  onChange: (mode: PermissionMode) => void;
  disabled?: boolean;
  /** 紧凑模式（对话界面使用） */
  compact?: boolean;
  /** 下拉向上展开 */
  dropUp?: boolean;
}

const PERMISSION_MODES: Array<{
  value: PermissionMode;
  labelKey: string;
  descKey: string;
  icon: "shield-off" | "shield-half" | "shield-check";
  color: string;
}> = [
  {
    value: "bypassPermissions",
    labelKey: "permission.mode.bypass",
    descKey: "permission.mode.bypassDesc",
    icon: "shield-off",
    color: "amber",
  },
  {
    value: "acceptEdits",
    labelKey: "permission.mode.acceptEdits",
    descKey: "permission.mode.acceptEditsDesc",
    icon: "shield-half",
    color: "blue",
  },
  {
    value: "default",
    labelKey: "permission.mode.default",
    descKey: "permission.mode.defaultDesc",
    icon: "shield-check",
    color: "emerald",
  },
];

/**
 * 锁图标（权限）
 */
function LockIcon({ type, className }: { type: string; className?: string }) {
  if (type === "shield-off") {
    // 无需确认 → 开锁
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
    );
  }
  if (type === "shield-half") {
    // 仅确认命令 → 半锁
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        <line x1="12" y1="14" x2="12" y2="17" />
      </svg>
    );
  }
  // 全部确认 → 上锁
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

const colorClasses: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  amber:   { bg: "bg-[#FEF3C7]",            text: "text-[#D97706]",      border: "border-[#D97706]/20",      dot: "bg-[#D97706]" },
  blue:    { bg: "bg-[#DBEAFE]",            text: "text-[#2563EB]",      border: "border-[#2563EB]/20",      dot: "bg-[#2563EB]" },
  emerald: { bg: "bg-[#DCFCE7]",            text: "text-[#16A34A]",      border: "border-[#16A34A]/20",      dot: "bg-[#16A34A]" },
};

/**
 * 权限模式选择器组件
 * 支持在新建会话和对话界面中使用
 */
export function PermissionModeSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
  dropUp = false,
}: PermissionModeSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentMode = PERMISSION_MODES.find((m) => m.value === value) || PERMISSION_MODES[0];

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (mode: PermissionMode) => {
      onChange(mode);
      setIsOpen(false);
    },
    [onChange]
  );

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
    }
  }, [disabled]);

  return (
    <div ref={containerRef} className="relative" data-tour="permission-mode">
      {/* 触发按钮 */}
      {compact ? (
        /* 紧凑模式：无边框，锁图标颜色即状态指示，点击区域充足 */
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleToggle}
                disabled={disabled}
                className={`icon-hover-pop flex items-center rounded-lg p-1.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 text-ink-500 hover:bg-ink-900/8 hover:text-ink-700`}
              >
                <LockIcon type={currentMode.icon} className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t(currentMode.labelKey, currentMode.value)} — {t(currentMode.descKey)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        /* 常规模式：带颜色背景/边框 */
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${colorClasses[currentMode.color].bg} ${colorClasses[currentMode.color].border} hover:brightness-110 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:-translate-y-px active:translate-y-0 active:shadow-none`}
        >
          <LockIcon
            type={currentMode.icon}
            className={`h-4 w-4 ${colorClasses[currentMode.color].text}`}
          />
          <span className={colorClasses[currentMode.color].text}>
            {t(currentMode.labelKey, currentMode.value)}
          </span>
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {/* 下拉菜单 */}
      {isOpen && (
        <div
          className={`absolute left-0 z-50 min-w-[220px] rounded-xl border border-ink-900/10 bg-surface p-1 shadow-elevated ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {PERMISSION_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => handleSelect(mode.value)}
              className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-secondary ${
                value === mode.value ? "bg-surface-secondary" : ""
              }`}
            >
              <LockIcon
                type={mode.icon}
                className={`h-4 w-4 mt-0.5 ${colorClasses[mode.color].text}`}
              />
              <div className="flex-1">
                <div className={`text-sm font-medium ${colorClasses[mode.color].text}`}>
                  {t(mode.labelKey, mode.value)}
                </div>
                <div className="text-xs text-muted">
                  {t(mode.descKey, "")}
                </div>
              </div>
              {value === mode.value && (
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-accent"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
