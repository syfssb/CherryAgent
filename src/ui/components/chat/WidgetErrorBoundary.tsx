import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Widget 错误边界 — 防止单个 widget 崩溃影响整个聊天界面
 */
class WidgetErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.warn('[WidgetErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] p-3 text-sm">
          <p className="font-medium text-[#DC2626]">Widget 渲染出错</p>
          {this.state.error && (
            <p className="mt-1 text-xs text-muted">
              {this.state.error.message}
            </p>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetErrorBoundary({ children, fallback }: Props) {
  return (
    <WidgetErrorBoundaryInner fallback={fallback}>
      {children}
    </WidgetErrorBoundaryInner>
  );
}
