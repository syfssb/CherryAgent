import { useTranslation } from 'react-i18next';
import { useAuthStatusStore } from '../../hooks/useAuthStatusStore';

/**
 * 认证状态指示器组件
 *
 * 显示 SDK 认证过程的进度和状态
 */
export function AuthStatusIndicator() {
  const { t } = useTranslation();
  const { status } = useAuthStatusStore();

  // 如果没有认证活动，不显示
  if (!status.isAuthenticating && status.output.length === 0 && !status.error) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-md bg-surface dark:bg-[#1a1918] rounded-lg shadow-lg border border-[#1414131a] dark:border-[#faf9f51a] p-4 z-50">
      <div className="flex items-start gap-3">
        {/* 状态图标 */}
        <div className="flex-shrink-0">
          {status.isAuthenticating ? (
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : status.error ? (
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-[#141413] dark:text-[#faf9f5] mb-2">
            {status.isAuthenticating
              ? t('authStatus.authenticating', '正在认证...')
              : status.error
                ? t('authStatus.failed', '认证失败')
                : t('authStatus.success', '认证完成')}
          </h3>

          {/* 输出信息 */}
          {status.output.length > 0 && (
            <div className="space-y-1 mb-2">
              {status.output.map((line, index) => (
                <p key={index} className="text-xs text-[#87867f] dark:text-[#b0aea5] break-words">
                  {line}
                </p>
              ))}
            </div>
          )}

          {/* 错误信息 */}
          {status.error && (
            <p className="text-xs text-red-600 dark:text-red-400 break-words">
              {status.error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
