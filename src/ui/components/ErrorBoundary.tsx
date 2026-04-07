/**
 * 错误边界组件
 * 捕获 React 组件树中的 JavaScript 错误，显示友好的错误提示
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button';
import i18n from '@/ui/i18n/config';

// 错误信息接口
export interface ErrorDetails {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
}

// 错误边界 Props
interface ErrorBoundaryProps {
  /** 子组件 */
  children: ReactNode;
  /** 自定义错误 UI */
  fallback?: ReactNode | ((error: ErrorDetails, reset: () => void) => ReactNode);
  /** 错误回调 */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** 错误上报函数 */
  onReport?: (errorDetails: ErrorDetails) => Promise<void>;
  /** 是否显示详细信息（开发环境） */
  showDetails?: boolean;
  /** 重试时重置的 key */
  resetKey?: string | number;
}

// 错误边界 State
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorDetails: ErrorDetails | null;
  isReporting: boolean;
  reportSuccess: boolean;
}

/**
 * 错误边界类组件
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorDetails: null,
      isReporting: false,
      reportSuccess: false,
    };
  }

  /**
   * 从错误派生状态
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * 组件捕获错误
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const errorDetails: ErrorDetails = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack || undefined,
      timestamp: Date.now(),
    };

    this.setState({
      errorInfo,
      errorDetails,
    });

    // 调用错误回调
    this.props.onError?.(error, errorInfo);

    // 在开发环境输出错误信息
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Error info:', errorInfo);
    }
  }

  /**
   * 监听 resetKey 变化，自动重置
   */
  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.props.resetKey !== undefined &&
      prevProps.resetKey !== this.props.resetKey &&
      this.state.hasError
    ) {
      this.handleReset();
    }
  }

  /**
   * 重置错误状态
   */
  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorDetails: null,
      isReporting: false,
      reportSuccess: false,
    });
  };

  /**
   * 上报错误
   */
  handleReport = async (): Promise<void> => {
    const { onReport } = this.props;
    const { errorDetails } = this.state;

    if (!onReport || !errorDetails) return;

    this.setState({ isReporting: true });

    try {
      await onReport(errorDetails);
      this.setState({ reportSuccess: true, isReporting: false });
    } catch (error) {
      console.error('[ErrorBoundary] Failed to report error:', error);
      this.setState({ isReporting: false });
    }
  };

  /**
   * 刷新页面
   */
  handleRefresh = (): void => {
    window.location.reload();
  };

  /**
   * 复制错误信息
   */
  handleCopyError = async (): Promise<void> => {
    const { errorDetails } = this.state;
    if (!errorDetails) return;

    const text = `Error: ${errorDetails.message}\n\nStack:\n${errorDetails.stack || 'N/A'}\n\nComponent Stack:\n${errorDetails.componentStack || 'N/A'}`;

    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('[ErrorBoundary] Failed to copy error:', error);
    }
  };

  render(): ReactNode {
    const { hasError, error, errorDetails, isReporting, reportSuccess } = this.state;
    const { children, fallback, showDetails, onReport } = this.props;

    if (!hasError) {
      return children;
    }

    // 自定义 fallback
    if (fallback) {
      if (typeof fallback === 'function') {
        return fallback(errorDetails!, this.handleReset);
      }
      return fallback;
    }

    // 默认错误 UI
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
        <div className="w-full max-w-md text-center">
          {/* 错误图标 */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
            <svg
              className="h-8 w-8 text-error"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          {/* 错误标题 */}
          <h2 className="text-xl font-semibold text-ink-800">
            {i18n.t('errorBoundary.title', '出错了')}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {i18n.t('errorBoundary.subtitle', '应用遇到了一个错误，请尝试刷新页面或重试。')}
          </p>

          {/* 错误消息 */}
          {error && (
            <div className="mt-4 rounded-lg bg-surface-secondary p-4 text-left">
              <p className="text-sm font-medium text-error">
                {error.message || i18n.t('errorBoundary.unknownError', '未知错误')}
              </p>
            </div>
          )}

          {/* 详细信息（开发环境） */}
          {showDetails && errorDetails?.stack && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm font-medium text-muted hover:text-ink-700">
                {i18n.t('errorBoundary.details', '查看详细信息')}
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-ink-900/5 p-3 text-xs text-ink-600">
                {errorDetails.stack}
              </pre>
              {errorDetails.componentStack && (
                <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-ink-900/5 p-3 text-xs text-ink-600">
                  {errorDetails.componentStack}
                </pre>
              )}
            </details>
          )}

          {/* 操作按钮 */}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={this.handleReset}>
              {i18n.t('common.retry', '重试')}
            </Button>
            <Button variant="outline" onClick={this.handleRefresh}>
              {i18n.t('errorBoundary.refresh', '刷新页面')}
            </Button>
            {showDetails && (
              <Button variant="ghost" onClick={this.handleCopyError}>
                {i18n.t('errorBoundary.copyError', '复制错误信息')}
              </Button>
            )}
          </div>

          {/* 错误上报 */}
          {onReport && !reportSuccess && (
            <div className="mt-6 border-t border-ink-900/10 pt-6">
              <p className="text-sm text-muted">
                {i18n.t('errorBoundary.helpImprove', '帮助我们改进？')}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={this.handleReport}
                disabled={isReporting}
              >
                {isReporting
                  ? i18n.t('errorBoundary.reporting', '上报中...')
                  : i18n.t('errorBoundary.report', '上报此错误')}
              </Button>
            </div>
          )}

          {/* 上报成功 */}
          {reportSuccess && (
            <div className="mt-6 rounded-lg border border-success/20 bg-success/5 p-3">
              <p className="text-sm text-success">
                {i18n.t('errorBoundary.reportSuccess', '感谢您的反馈，我们会尽快修复此问题。')}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }
}

/**
 * 使用 ErrorBoundary 包装组件的 HOC
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary: React.FC<P> = (props) => {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

/**
 * 错误回退组件 - 简单版本
 */
export function SimpleErrorFallback({
  error,
  onReset,
}: {
  error: Error | null;
  onReset?: () => void;
}) {
  const t = i18n.t.bind(i18n);
  return (
    <div className="flex flex-col items-center justify-center p-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
        <svg
          className="h-6 w-6 text-error"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="text-sm text-muted">
        {error?.message || t('errorBoundary.loadFailed', '加载失败')}
      </p>
      {onReset && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={onReset}>
          {t('common.retry', '重试')}
        </Button>
      )}
    </div>
  );
}

/**
 * 错误回退组件 - 内联版本
 */
export function InlineErrorFallback({
  error,
  onReset,
}: {
  error: Error | null;
  onReset?: () => void;
}) {
  const t = i18n.t.bind(i18n);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-error/20 bg-error/5 px-3 py-2">
      <svg
        className="h-4 w-4 flex-shrink-0 text-error"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="flex-1 text-sm text-error">
        {error?.message || t('errorBoundary.loadFailed', '加载失败')}
      </span>
      {onReset && (
        <button
          type="button"
          className="text-sm font-medium text-error hover:text-error/80"
          onClick={onReset}
        >
          {t('common.retry', '重试')}
        </button>
      )}
    </div>
  );
}

export default ErrorBoundary;
