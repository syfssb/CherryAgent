import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { PermissionMode, AgentProvider } from "../types";
import type { PermissionRequest } from "../store/useAppStore";
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from "../store/useAppStore";
import { useAuthStore } from "../store/useAuthStore";
import { StartSessionModal } from "./StartSessionModal";
import { SettingsModal } from "./SettingsModal";
import { LoginModal } from "./auth/LoginModal";
import { RechargeModal } from "./billing/RechargeModal";
import { AuthGuard } from "./auth/AuthGuard";
import { PermissionDialog } from "./chat/PermissionDialog";

interface PendingPermissionItem {
  sessionId: string;
  title: string;
  request: PermissionRequest;
  provider?: AgentProvider;
}

interface GlobalDialogsProps {
  showStartModal: boolean;
  showSettingsModal: boolean;
  settingsInitialTab?: string;
  showLoginModal: boolean;
  showRechargeModal: boolean;
  globalError: string | null;
  cwd: string;
  permissionMode: PermissionMode;
  startSkillMode: "manual" | "auto";
  startActiveSkillIds: string[];
  pendingStart: boolean;
  pendingPermissionQueue: PendingPermissionItem[];
  onCloseStartModal: () => void;
  onCloseSettingsModal: () => void;
  onCloseLoginModal: () => void;
  onOpenLoginModal: () => void;
  onCloseRechargeModal: () => void;
  onOpenRechargeModal: () => void;
  onClearGlobalError: () => void;
  onCwdChange: (cwd: string) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  onSkillModeChange: (mode: "manual" | "auto") => void;
  onActiveSkillIdsChange: (ids: string[]) => void;
  onStartFromModal: () => void;
  onLoginSuccess: () => void;
  onRechargeSuccess: () => void;
  onPermissionResult: (sessionId: string, toolUseId: string, result: PermissionResult) => void;
}

export function GlobalDialogs({
  showStartModal,
  showSettingsModal,
  settingsInitialTab,
  showLoginModal,
  showRechargeModal,
  globalError,
  cwd,
  permissionMode,
  startSkillMode,
  startActiveSkillIds,
  pendingStart,
  pendingPermissionQueue,
  onCloseStartModal,
  onCloseSettingsModal,
  onCloseLoginModal,
  onOpenLoginModal,
  onCloseRechargeModal,
  onOpenRechargeModal,
  onClearGlobalError,
  onCwdChange,
  onPermissionModeChange,
  onSkillModeChange,
  onActiveSkillIdsChange,
  onStartFromModal,
  onLoginSuccess,
  onRechargeSuccess,
  onPermissionResult,
}: GlobalDialogsProps) {
  const { t } = useTranslation();
  const setActivePage = useAppStore((s) => s.setActivePage);

  const [availableUpdateInfo, setAvailableUpdateInfo] = useState<{
    version: string;
    releaseDate?: string;
    releaseNotes?: string | null;
  } | null>(null);

  // 后台更新下载完成时显示通知卡片
  const [updateReadyInfo, setUpdateReadyInfo] = useState<{
    version: string;
    releaseDate?: string;
    isInApplications: boolean;
  } | null>(null);

  useEffect(() => {
    const unsubAvailable = window.electron?.update?.onAvailable?.((info) => {
      setAvailableUpdateInfo(info);
    });
    const unsubDownloaded = window.electron?.update?.onDownloaded?.((info) => {
      setAvailableUpdateInfo(null);
      setUpdateReadyInfo(info);
    });
    return () => {
      unsubAvailable?.();
      unsubDownloaded?.();
    };
  }, []);

  return (
    <>
      {showStartModal && (
        <StartSessionModal
          cwd={cwd}
          permissionMode={permissionMode}
          skillMode={startSkillMode}
          activeSkillIds={startActiveSkillIds}
          pendingStart={pendingStart}
          onCwdChange={onCwdChange}
          onPermissionModeChange={onPermissionModeChange}
          onSkillModeChange={onSkillModeChange}
          onActiveSkillIdsChange={onActiveSkillIdsChange}
          onStart={onStartFromModal}
          onClose={onCloseStartModal}
        />
      )}

      {showSettingsModal && (
        <SettingsModal initialTab={settingsInitialTab} onClose={onCloseSettingsModal} onNavigateToRecharge={onOpenRechargeModal} />
      )}

      <LoginModal
        open={showLoginModal}
        onClose={onCloseLoginModal}
        onSuccess={onLoginSuccess}
      />

      <AuthGuard silent>
        <RechargeModal
          open={showRechargeModal}
          onClose={onCloseRechargeModal}
          onSuccess={onRechargeSuccess}
        />
      </AuthGuard>

      {globalError && (() => {
        const isBalanceError = globalError.includes("积分不足") || globalError.includes("余额不足");
        const isLoginError = globalError.includes("登录已过期");
        return (
          <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 w-full max-w-[360px] px-4 animate-in slide-in-from-bottom-2 fade-in duration-200">
            <div className="rounded-2xl border border-[#1414130d] bg-surface shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] overflow-hidden dark:bg-[#2b2a27] dark:border-[#faf9f50d]">
              {/* colored top accent bar */}
              <div className="h-[2px] w-full bg-[#DC2626]/50" />
              <div className="flex items-start gap-3 px-4 py-3.5">
                {/* error icon */}
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#FEE2E2] dark:bg-[#DC2626]/15">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#DC2626]" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                {/* message */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] leading-relaxed text-[#141413] dark:text-[#faf9f5]">
                    {globalError}
                  </p>
                  {isBalanceError && (
                    <button
                      className="mt-2 inline-flex items-center gap-1 bg-[#ae5630] text-white rounded-full px-3 py-1 text-[12px] font-medium hover:bg-[#c4633a] transition-colors"
                      onClick={() => { onClearGlobalError(); onOpenRechargeModal(); }}
                    >
                      去充值
                    </button>
                  )}
                  {isLoginError && (
                    <button
                      className="mt-2 inline-flex items-center gap-1 bg-[#ae5630] text-white rounded-full px-3 py-1 text-[12px] font-medium hover:bg-[#c4633a] transition-colors"
                      onClick={() => {
                        onClearGlobalError();
                        useAuthStore.getState().logout();
                        onOpenLoginModal();
                      }}
                    >
                      重新登录
                    </button>
                  )}
                </div>
                {/* close button */}
                <button
                  onClick={onClearGlobalError}
                  className="flex-shrink-0 rounded-lg p-1 text-[#b0aea5] hover:bg-[#1414130a] hover:text-[#87867f] dark:hover:bg-[#faf9f50a] dark:hover:text-[#9a9893] transition-colors duration-150"
                  aria-label="关闭"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingPermissionQueue.length > 0 &&
        pendingPermissionQueue[0].request.toolName !== "AskUserQuestion" && (
          <PermissionDialog
            request={pendingPermissionQueue[0].request}
            sessionTitle={pendingPermissionQueue[0].title}
            queueCount={pendingPermissionQueue.length}
            provider={pendingPermissionQueue[0].provider}
            onJumpToSession={() => {
              setActivePage('chat');
              useAppStore.getState().setActiveSessionId(pendingPermissionQueue[0].sessionId);
            }}
            onResult={(toolUseId, result) =>
              onPermissionResult(pendingPermissionQueue[0].sessionId, toolUseId, result)
            }
          />
        )}

      {availableUpdateInfo && (
        <div className="fixed bottom-24 left-1/2 z-50 w-full max-w-[360px] -translate-x-1/2 px-4 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="overflow-hidden rounded-2xl border border-[#1414130d] bg-surface shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] dark:border-[#faf9f50d] dark:bg-[#2b2a27]">
            <div className="h-[2px] w-full bg-[#0EA5E9]/55" />
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#E0F2FE] dark:bg-[#0EA5E9]/15">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#0284C7]" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#141413] dark:text-[#faf9f5]">
                  {t('update.available', '发现新版本')}
                </p>
                <p className="mt-0.5 text-[12px] text-[#87867f]">
                  {t('update.availableDescription', '新版本 {{version}} 已可用。', {
                    version: availableUpdateInfo.version,
                  })}
                </p>
                <button
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#0284C7] px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-[#0EA5E9]"
                  onClick={() => {
                    void (async () => {
                      const result = await window.electron?.update?.download?.();
                      if (result?.success) {
                        setAvailableUpdateInfo(null);
                      }
                    })();
                  }}
                >
                  {t('update.downloadNow', '立即下载')}
                </button>
              </div>
              <button
                onClick={() => setAvailableUpdateInfo(null)}
                className="flex-shrink-0 rounded-lg p-1 text-[#b0aea5] transition-colors duration-150 hover:bg-[#1414130a] hover:text-[#87867f] dark:hover:bg-[#faf9f50a]"
                aria-label={t('update.remindLater', '稍后')}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 后台更新下载完成通知卡片 */}
      {updateReadyInfo && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 w-full max-w-[360px] px-4 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="rounded-2xl border border-[#1414130d] bg-surface shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] overflow-hidden dark:bg-[#2b2a27] dark:border-[#faf9f50d]">
            <div className="h-[2px] w-full bg-[#16A34A]/50" />
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#DCFCE7] dark:bg-[#16A34A]/15">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#16A34A]" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#141413] dark:text-[#faf9f5]">
                  {t('update.readyTitle', `新版本 v${updateReadyInfo.version} 已就绪`)}
                </p>
                {updateReadyInfo.isInApplications ? (
                  <>
                    <p className="mt-0.5 text-[12px] text-[#87867f]">
                      {t('update.readyDesc', '退出时将自动安装')}
                    </p>
                    <button
                      className="mt-2 inline-flex items-center gap-1 bg-[#ae5630] text-white rounded-full px-3 py-1 text-[12px] font-medium hover:bg-[#c4633a] transition-colors"
                      onClick={() => {
                        void (async () => {
                          const result = await window.electron?.update?.install?.();
                          if (result?.success) {
                            setUpdateReadyInfo(null);
                          }
                        })();
                      }}
                    >
                      {t('update.installNow', '立即安装')}
                    </button>
                  </>
                ) : (
                  <p className="mt-0.5 text-[12px] text-[#87867f]">
                    {t('update.moveToApplications', '请将 App 移至"应用程序"文件夹后重启，再安装更新')}
                  </p>
                )}
              </div>
              <button
                onClick={() => setUpdateReadyInfo(null)}
                className="flex-shrink-0 rounded-lg p-1 text-[#b0aea5] hover:bg-[#1414130a] hover:text-[#87867f] dark:hover:bg-[#faf9f50a] transition-colors duration-150"
                aria-label={t('update.remindLater', '稍后')}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
