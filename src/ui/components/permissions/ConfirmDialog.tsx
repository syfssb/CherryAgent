import { useCallback, useEffect, useRef, useState } from "react";

export type ConfirmDialogAction = "allow" | "deny";

export type ConfirmDialogOptions = {
  title: string;
  message: string;
  operationType?: string;
  details?: Record<string, string | number | boolean>;
  allowLabel?: string;
  denyLabel?: string;
  showRemember?: boolean;
  timeoutSeconds?: number;
  defaultAction?: ConfirmDialogAction;
  dangerous?: boolean;
};

export type ConfirmDialogResult = {
  action: ConfirmDialogAction;
  remember: boolean;
};

interface ConfirmDialogProps extends ConfirmDialogOptions {
  open: boolean;
  onClose: (result: ConfirmDialogResult) => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  operationType,
  details,
  allowLabel = "Allow",
  denyLabel = "Deny",
  showRemember = false,
  timeoutSeconds = 0,
  defaultAction = "deny",
  dangerous = false,
  onClose
}: ConfirmDialogProps) {
  const [remember, setRemember] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(timeoutSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 处理超时自动拒绝
  useEffect(() => {
    if (!open || timeoutSeconds <= 0) return;

    setTimeRemaining(timeoutSeconds);

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          onClose({ action: defaultAction, remember: false });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, timeoutSeconds, defaultAction, onClose]);

  // 清理定时器
  useEffect(() => {
    if (!open && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [open]);

  // 重置记住选择
  useEffect(() => {
    if (open) {
      setRemember(false);
    }
  }, [open]);

  const handleAllow = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    onClose({ action: "allow", remember });
  }, [remember, onClose]);

  const handleDeny = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    onClose({ action: "deny", remember });
  }, [remember, onClose]);

  // 键盘快捷键
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDeny();
      } else if (e.key === "Enter" && !dangerous) {
        handleAllow();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleAllow, handleDeny, dangerous]);

  if (!open) return null;

  // 获取操作类型图标
  const getOperationIcon = () => {
    switch (operationType?.toLowerCase()) {
      case "file":
      case "write":
      case "edit":
        return (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10,9 9,9 8,9" />
          </svg>
        );
      case "execute":
      case "bash":
      case "command":
        return (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4,17 10,11 4,5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        );
      case "network":
      case "fetch":
      case "http":
        return (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        );
      case "delete":
      case "remove":
        return (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3,6 5,6 21,6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-ink-900/5 bg-surface p-6 shadow-elevated animate-in fade-in zoom-in-95 duration-200">
        {/* 标题和图标 */}
        <div className="flex items-start gap-4">
          <div className={`flex items-center justify-center h-10 w-10 rounded-xl ${
            dangerous ? "bg-error/10 text-error" : "bg-warning/10 text-warning"
          }`}>
            {getOperationIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-ink-800">{title}</h3>
            {operationType && (
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${
                dangerous ? "bg-error/10 text-error" : "bg-warning/10 text-warning"
              }`}>
                {operationType}
              </span>
            )}
          </div>
        </div>

        {/* 消息内容 */}
        <p className="mt-4 text-sm text-muted leading-relaxed">{message}</p>

        {/* 详细信息 */}
        {details && Object.keys(details).length > 0 && (
          <div className="mt-4 rounded-xl border border-ink-900/5 bg-surface-secondary p-3">
            <div className="grid gap-2 text-xs">
              {Object.entries(details).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-muted capitalize flex-shrink-0">{key}:</span>
                  <span className="text-ink-800 break-all font-mono">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 超时提示 */}
        {timeoutSeconds > 0 && timeRemaining > 0 && (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>
              Auto {defaultAction === "deny" ? "denying" : "allowing"} in {timeRemaining}s
            </span>
            {/* 进度条 */}
            <div className="flex-1 h-1 bg-ink-900/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-warning transition-all duration-1000 ease-linear"
                style={{ width: `${(timeRemaining / timeoutSeconds) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 记住选择 */}
        {showRemember && (
          <label className="mt-4 flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-ink-900/20 text-accent focus-visible:ring-accent/20"
            />
            <span className="text-sm text-muted">Remember this choice for this session</span>
          </label>
        )}

        {/* 操作按钮 */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleDeny}
            className="flex-1 rounded-full border border-ink-900/10 bg-surface px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
          >
            {denyLabel}
          </button>
          <button
            type="button"
            onClick={handleAllow}
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium text-white transition-colors ${
              dangerous
                ? "bg-error hover:bg-error/90"
                : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {allowLabel}
          </button>
        </div>

        {/* 键盘快捷键提示 */}
        <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-ink-900/5 font-mono">Esc</kbd>
            <span>to {denyLabel.toLowerCase()}</span>
          </span>
          {!dangerous && (
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-ink-900/5 font-mono">Enter</kbd>
              <span>to {allowLabel.toLowerCase()}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 使用确认对话框的 Hook
 */
export function useConfirmDialog() {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    options: ConfirmDialogOptions;
    resolve: ((result: ConfirmDialogResult) => void) | null;
  }>({
    open: false,
    options: { title: "", message: "" },
    resolve: null
  });

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<ConfirmDialogResult> => {
    return new Promise((resolve) => {
      setDialogState({
        open: true,
        options,
        resolve
      });
    });
  }, []);

  const handleClose = useCallback((result: ConfirmDialogResult) => {
    if (dialogState.resolve) {
      dialogState.resolve(result);
    }
    setDialogState((prev) => ({ ...prev, open: false, resolve: null }));
  }, [dialogState.resolve]);

  const Dialog = useCallback(() => (
    <ConfirmDialog
      open={dialogState.open}
      {...dialogState.options}
      onClose={handleClose}
    />
  ), [dialogState.open, dialogState.options, handleClose]);

  return { confirm, Dialog };
}

export default ConfirmDialog;
