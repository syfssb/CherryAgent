import { User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UserMenu } from "./auth/UserMenu";
import { NotificationBell } from "./NotificationBell";
import { isWindows } from "@/ui/utils/platform";

// Windows titleBarOverlay 按钮区域宽度（三个按钮 × 46px，100% DPI）
const WIN_CONTROLS_WIDTH = 138;

interface TopBarProps {
  isAuthenticated: boolean;
  isRunning?: boolean;
  hasActiveSession?: boolean;
  sessionTitle?: string;
  /** 右侧是否有面板（非 overlay 且未收起）挡住 Windows 窗口控件 */
  hasRightPanel?: boolean;
  onRechargeClick: () => void;
  onLoginClick: () => void;
  onSettingsClick: () => void;
  onHistoryClick: () => void;
}

export function TopBar({
  isAuthenticated,
  isRunning = false,
  hasActiveSession = false,
  sessionTitle,
  hasRightPanel = false,
  onRechargeClick,
  onLoginClick,
  onSettingsClick,
  onHistoryClick,
}: TopBarProps) {
  const { t } = useTranslation();

  return (
    <div
      className="relative z-30 flex h-12 select-none items-center justify-between border-b border-[#1414130d] bg-surface-cream px-4 dark:bg-[#141413] dark:border-[#faf9f50d]"
      style={{
        WebkitAppRegion: 'drag',
        // Windows titleBarOverlay 按钮覆盖右上角；右侧有展开面板（非 overlay）时控件盖在面板上，TopBar 不需避让
        paddingRight: isWindows() && !hasRightPanel ? WIN_CONTROLS_WIDTH : undefined,
      } as React.CSSProperties}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="max-w-[220px] truncate text-sm font-medium text-[#141413] dark:text-[#faf9f5]"
          title={sessionTitle || undefined}
        >
          {sessionTitle || (hasActiveSession ? t("app.name", "Cherry Agent") : t("chat.newSession", "新对话"))}
        </span>
        {isRunning && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#87867f]/60 animate-pulse" />}
      </div>

      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {isAuthenticated ? (
          <>
            <NotificationBell />
            <UserMenu
              onSettingsClick={onSettingsClick}
              onRechargeClick={onRechargeClick}
              onHistoryClick={onHistoryClick}
            />
          </>
        ) : (
          <>
            <NotificationBell />
            <button
              onClick={onLoginClick}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <User className="h-4 w-4" />
              <span>{t("auth.login", "登录")}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
