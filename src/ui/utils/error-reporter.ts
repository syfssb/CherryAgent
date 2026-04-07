/**
 * 渲染进程全局错误捕获
 *
 * 捕获未被 React ErrorBoundary 拦截的全局错误，
 * 通过 IPC 发送到主进程记录日志。
 */

/** 错误日志条目 */
interface ErrorLogEntry {
  type: "uncaught-error" | "unhandled-rejection";
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  timestamp: number;
}

/** 最近的错误缓存，用于去重 */
const recentErrors: string[] = [];
const MAX_RECENT_ERRORS = 20;
const DEDUP_WINDOW_MS = 3000;

/**
 * 生成错误指纹，用于短时间内去重
 */
function getErrorFingerprint(entry: ErrorLogEntry): string {
  return `${entry.type}:${entry.message}:${entry.source ?? ""}:${entry.lineno ?? 0}`;
}

/**
 * 检查是否为重复错误（短时间内相同错误只上报一次）
 */
function isDuplicate(fingerprint: string): boolean {
  if (recentErrors.includes(fingerprint)) {
    return true;
  }
  recentErrors.push(fingerprint);
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.shift();
  }
  setTimeout(() => {
    const idx = recentErrors.indexOf(fingerprint);
    if (idx !== -1) {
      recentErrors.splice(idx, 1);
    }
  }, DEDUP_WINDOW_MS);
  return false;
}

/**
 * 将错误信息发送到主进程
 */
function sendErrorToMain(entry: ErrorLogEntry): void {
  try {
    const fingerprint = getErrorFingerprint(entry);
    if (isDuplicate(fingerprint)) {
      return;
    }

    // 通过 IPC 发送到主进程记录日志
    if (window.electron?.reportError) {
      window.electron.reportError(entry).catch(() => {
        // 如果 IPC 通道不可用，静默失败
      });
    }
  } catch {
    // 错误上报本身不应该抛出异常
  }
}

/**
 * 设置全局错误处理器
 *
 * 应在应用启动时（main.tsx 中）尽早调用此函数。
 * 捕获两类错误：
 * 1. window.onerror - 同步 JS 错误
 * 2. window.onunhandledrejection - 未处理的 Promise 拒绝
 */
export function setupGlobalErrorHandlers(): void {
  // 保存原有的处理器，以便链式调用
  const originalOnError = window.onerror;
  const originalOnUnhandledRejection = window.onunhandledrejection;

  /**
   * 全局同步错误捕获
   */
  window.onerror = (
    message: string | Event,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error
  ): boolean => {
    const errorMessage =
      typeof message === "string"
        ? message
        : error?.message ?? "Unknown error";

    const entry: ErrorLogEntry = {
      type: "uncaught-error",
      message: errorMessage,
      stack: error?.stack,
      source,
      lineno,
      colno,
      timestamp: Date.now(),
    };

    sendErrorToMain(entry);

    // 开发环境保留控制台输出
    if (import.meta.env.DEV) {
      console.error("[GlobalErrorHandler] Uncaught error:", error ?? message);
    }

    // 调用原有处理器
    if (typeof originalOnError === "function") {
      return originalOnError(message, source, lineno, colno, error);
    }

    // 返回 false 让浏览器继续默认处理（控制台输出）
    return false;
  };

  /**
   * 未处理的 Promise 拒绝捕获
   */
  window.onunhandledrejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const errorMessage =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";

    const entry: ErrorLogEntry = {
      type: "unhandled-rejection",
      message: errorMessage,
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: Date.now(),
    };

    sendErrorToMain(entry);

    // 开发环境保留控制台输出
    if (import.meta.env.DEV) {
      console.error(
        "[GlobalErrorHandler] Unhandled rejection:",
        reason
      );
    }

    // 调用原有处理器
    if (typeof originalOnUnhandledRejection === "function") {
      originalOnUnhandledRejection.call(window, event);
    }
  };
}

/**
 * 手动上报错误（供 ErrorBoundary 等组件调用）
 */
export function reportError(error: Error, context?: string): void {
  const entry: ErrorLogEntry = {
    type: "uncaught-error",
    message: `${context ? `[${context}] ` : ""}${error.message}`,
    stack: error.stack,
    timestamp: Date.now(),
  };

  sendErrorToMain(entry);
}
