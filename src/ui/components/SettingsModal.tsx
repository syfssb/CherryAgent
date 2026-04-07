/**
 * SettingsModal - 设置页面弹窗容器
 * 封装 Settings 页面为 Modal 形式，适配当前应用架构
 */

import React, { Suspense } from 'react';

const SettingsPage = React.lazy(() => import('@/ui/pages/Settings').then(m => ({ default: m.SettingsPage })));

interface SettingsModalProps {
  initialTab?: string;
  onClose: () => void;
  onNavigateToRecharge?: () => void;
}

export function SettingsModal({ initialTab, onClose, onNavigateToRecharge }: SettingsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 backdrop-blur-sm">
      <div className="w-full max-w-5xl h-[90vh] rounded-2xl border border-ink-900/5 bg-surface shadow-elevated overflow-hidden">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        }>
          <SettingsPage initialTab={initialTab} onClose={onClose} onNavigateToRecharge={onNavigateToRecharge} />
        </Suspense>
      </div>
    </div>
  );
}
