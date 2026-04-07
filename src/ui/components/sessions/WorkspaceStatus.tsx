import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export type WorkspaceStatusData = {
  path: string;
  exists: boolean;
  isWatching: boolean;
  lastChecked: number;
};

interface WorkspaceStatusProps {
  path: string;
  onReselect?: () => void;
  showReselect?: boolean;
  className?: string;
}

export function WorkspaceStatus({
  path,
  onReselect,
  showReselect = true,
  className = ""
}: WorkspaceStatusProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<WorkspaceStatusData | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // 检查工作目录状态
  const checkStatus = useCallback(async () => {
    if (!path) return;

    setIsChecking(true);
    try {
      const result = await (window.electron.workspace as any).exists(path);
      if (result.success && result.data) {
        setStatus({
          path: result.data.path,
          exists: result.data.exists,
          isWatching: false,
          lastChecked: Date.now()
        });
      }
    } catch (error) {
      console.error("Failed to check workspace status:", error);
      setStatus({
        path,
        exists: false,
        isWatching: false,
        lastChecked: Date.now()
      });
    }
    setIsChecking(false);
  }, [path]);

  // 初始检查
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // 监听工作区事件
  useEffect(() => {
    const unsubscribe = (window.electron.workspace as any).onWorkspaceEvent((event: any) => {
      if (event.path === path) {
        if (event.type === "workspace:exists") {
          setStatus((prev) => prev ? { ...prev, exists: event.exists, lastChecked: Date.now() } : null);
        } else if (event.type === "workspace:deleted") {
          setStatus((prev) => prev ? { ...prev, exists: false, lastChecked: Date.now() } : null);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [path]);

  // 定期检查状态
  useEffect(() => {
    const interval = setInterval(checkStatus, 30000); // 每 30 秒检查一次
    return () => clearInterval(interval);
  }, [checkStatus]);

  if (!path) {
    return null;
  }

  // 获取显示名称
  const displayName = path.split(/[/\\]/).pop() || path;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* 状态指示器 */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className={`flex items-center justify-center h-6 w-6 rounded-lg ${
          isChecking
            ? "bg-ink-900/5"
            : status?.exists
              ? "bg-success/10"
              : "bg-warning/10"
        }`}>
          {isChecking ? (
            <svg className="h-3.5 w-3.5 animate-spin text-muted" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : status?.exists ? (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-success" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-warning" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          )}
        </div>

        {/* 路径信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-ink-800 truncate" title={path}>
              {displayName}
            </span>
            {status?.exists === false && (
              <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
                {t("workspace.notFound", "未找到")}
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted truncate" title={path}>
            {path}
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1.5">
        {/* 刷新按钮 */}
        <button
          type="button"
          onClick={checkStatus}
          disabled={isChecking}
          className="p-1.5 rounded-lg hover:bg-ink-900/5 text-muted hover:text-ink-700 transition-colors disabled:opacity-50"
          title={t("workspace.refreshStatus", "刷新状态")}
        >
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${isChecking ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>

        {/* 重新选择按钮 */}
        {showReselect && onReselect && (
          <button
            type="button"
            onClick={onReselect}
            className="px-2 py-1 rounded-lg text-xs text-muted hover:text-ink-700 hover:bg-ink-900/5 transition-colors"
          >
            {t("workspace.change", "更换")}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 精简版工作区状态指示器
 */
export function WorkspaceStatusBadge({
  path,
  className = ""
}: {
  path: string;
  className?: string;
}) {
  const [exists, setExists] = useState<boolean | null>(null);

  useEffect(() => {
    if (!path) return;

    const checkExists = async () => {
      try {
        const result = await (window.electron.workspace as any).exists(path);
        if (result.success && result.data) {
          setExists(result.data!.exists);
        }
      } catch {
        setExists(false);
      }
    };

    checkExists();

    // 监听工作区事件
    const unsubscribe = (window.electron.workspace as any).onWorkspaceEvent((event: any) => {
      if (event.path === path) {
        if (event.type === "workspace:exists") {
          setExists(event.exists);
        } else if (event.type === "workspace:deleted") {
          setExists(false);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [path]);

  if (!path) return null;

  const displayName = path.split(/[/\\]/).pop() || path;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
        exists === null
          ? "bg-ink-900/5 text-muted"
          : exists
            ? "bg-success/10 text-success"
            : "bg-warning/10 text-warning"
      } ${className}`}
      title={path}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      <span className="truncate max-w-[120px]">{displayName}</span>
      {exists === false && (
        <svg viewBox="0 0 24 24" className="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )}
    </div>
  );
}

export default WorkspaceStatus;
