/**
 * 设置页面
 * 包含多标签页的完整设置界面
 */

import { useCallback, useEffect, useState, useRef, Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocaleFromLanguage } from '@/ui/i18n/config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/ui/tabs';
import { Button } from '@/ui/components/ui/button';
import { LogoutConfirmDialog } from '@/ui/components/auth/LogoutConfirmDialog';
import { Badge } from '@/ui/components/ui/badge';
import { ScrollArea } from '@/ui/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/ui/avatar';
import { Checkbox } from '@/ui/components/ui/checkbox';
import { useAuthStore, formatBalance, type User } from '@/ui/store/useAuthStore';
import { useTheme, type Theme } from '@/ui/hooks/useTheme';
import { useLanguage } from '@/ui/hooks/useLanguage';
import { useSettingsStore, defaultChatTypography } from '@/ui/store/useSettingsStore';
import { PRESET_AVATARS, type PresetAvatar } from '@/ui/components/chat/Avatar';
import { cn } from '@/ui/lib/utils';
import { toast } from '@/ui/hooks/use-toast';
import { MemoryEditor } from '@/ui/pages/MemoryEditor';
import {
  UpdateNotification,
  type UpdateStatus,
  type UpdateInfo,
  type DownloadProgress,
} from '@/ui/components/UpdateNotification';
import { CloudSync } from '@/ui/components/settings/CloudSync';
import { DataManagement } from '@/ui/components/settings/DataManagement';
import { ActivePeriodCard } from '@/ui/components/billing/ActivePeriodCard';
import { useBillingStore } from '@/ui/store/useBillingStore';
const SkillMarket = lazy(() => import('@/ui/pages/SkillMarket').then(m => ({ default: m.SkillMarket })));
import MarkdownRenderer from '@/ui/components/chat/MarkdownRenderer';
import { resetOnboarding } from '@/ui/components/onboarding/useOnboardingTour';
import { useRemoteConfig } from '@/ui/hooks/useRemoteConfig';

// 设置页面 Props
interface SettingsPageProps {
  /** 初始标签 */
  initialTab?: string;
  /** 关闭回调 */
  onClose?: () => void;
  /** 跳转到充值 */
  onNavigateToRecharge?: () => void;
}

// 应用信息类型
interface AppInfo {
  version: string;
  name: string;
  isPackaged: boolean;
}

/**
 * 主题选项
 */
const THEME_OPTIONS: { value: Theme; labelKey: string; icon: string }[] = [
  { value: 'light', labelKey: 'settings.appearance.light', icon: 'sun' },
  { value: 'dark', labelKey: 'settings.appearance.dark', icon: 'moon' },
  { value: 'system', labelKey: 'settings.appearance.system', icon: 'monitor' },
];

/**
 * 渲染图标
 */
function ThemeIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'sun':
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );
    case 'moon':
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      );
    case 'monitor':
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * 头像滚动网格 — 固定高度 + 自动隐藏滚动条
 * 滚动条仅在滚动时短暂显示，1.5s 无操作后自动消失
 */
/**
 * 设置页面组件
 */
export function SettingsPage({
  initialTab = 'account',
  onClose,
  onNavigateToRecharge,
}: SettingsPageProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState(initialTab);
  const locale = getLocaleFromLanguage(i18n.language);

  // 认证状态
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const balance = useAuthStore((s) => s.balance);
  const logout = useAuthStore((s) => s.logout);
  const periodCards = useBillingStore((s) => s.periodCards);
  const notifications = useSettingsStore((s) => s.notifications);
  const setNotifications = useSettingsStore((s) => s.setNotifications);
  const userAvatar = useSettingsStore((s) => s.userAvatar);
  const setUserAvatar = useSettingsStore((s) => s.setUserAvatar);
  const chatTypography = useSettingsStore((s) => s.chatTypography);
  const setChatTypography = useSettingsStore((s) => s.setChatTypography);
  const resetChatTypography = useSettingsStore((s) => s.resetChatTypography);

  // 远程配置
  const { config: remoteConfig } = useRemoteConfig();
  const [configDialogKey, setConfigDialogKey] = useState<'privacyPolicy' | 'termsOfService' | 'aboutUs' | null>(null);

  // 主题状态
  const { theme, setTheme } = useTheme();

  // 语言状态
  const { language, supportedLanguages, changeLanguage } = useLanguage();

  // 应用信息
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  // 更新状态
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  // 加载应用信息
  useEffect(() => {
    const loadAppInfo = async () => {
      try {
        const result = await window.electron?.app?.getVersion?.();
        if (result?.success && result.data) {
          setAppInfo(result.data);
        }
      } catch (error) {
        console.error('[Settings] Failed to load app info:', error);
      }
    };
    loadAppInfo();
  }, []);

  // 监听更新事件
  useEffect(() => {
    const unsubscribeStatus = window.electron?.update?.onStatus?.((data: any) => {
      setUpdateStatus(data.status);
      if (data.info) setUpdateInfo(data.info);
      if (data.error) setUpdateError(data.error);
    });

    const unsubscribeProgress = window.electron?.update?.onProgress?.((progress: DownloadProgress) => {
      setDownloadProgress(progress);
    });

    return () => {
      unsubscribeStatus?.();
      unsubscribeProgress?.();
    };
  }, []);

  // 检查更新
  const handleCheckUpdate = useCallback(async () => {
    setUpdateStatus('checking');
    setUpdateError(null);

    try {
      const result = await window.electron?.update?.check?.();
      if (result?.success && result.data) {
        if (result.data.error) {
          setUpdateStatus('error');
          setUpdateError(result.data.error || t('update.checkFailed', '检查更新失败'));
          setShowUpdateDialog(true);
          return;
        }
        if (result.data.updateAvailable) {
          setUpdateStatus('available');
          if (result.data.info) setUpdateInfo(result.data.info);
          setShowUpdateDialog(true);
        } else {
          setUpdateStatus('not-available');
          setShowUpdateDialog(true);
        }
      } else if (result) {
        setUpdateStatus('error');
        setUpdateError(result.error || t('update.checkFailed', '检查更新失败'));
        setShowUpdateDialog(true);
      }
    } catch {
      setUpdateStatus('error');
      setUpdateError(t('update.checkFailed', '检查更新失败'));
      setShowUpdateDialog(true);
    }
  }, [t]);

  const handleTestNotification = useCallback(async () => {
    if (!window.electron?.notifications?.check || !window.electron?.notifications?.show) {
      toast({
        title: t('settings.notifications.testUnavailable', '通知不可用'),
        description: t('settings.notifications.testUnavailableDescription', '当前环境不支持系统通知'),
        variant: 'error'
      });
      return;
    }

    const support = await window.electron.notifications.check();
    if (!support.supported) {
      toast({
        title: t('settings.notifications.testUnavailable', '通知不可用'),
        description: support.error || t('settings.notifications.testUnavailableDescription', '当前环境不支持系统通知'),
        variant: 'error'
      });
      return;
    }

    const result = await window.electron.notifications.show({
      title: t('settings.notifications.testTitle', '通知测试'),
      body: t('settings.notifications.testBody', '如果你看到这条通知，说明系统通知已启用'),
      silent: !notifications.soundEnabled
    });

    if (result?.success) {
      toast({
        title: t('settings.notifications.testSent', '已发送测试通知'),
        description: t('settings.notifications.testSentDescription', '请查看系统通知中心'),
        variant: 'success'
      });
    } else {
      toast({
        title: t('settings.notifications.testFailed', '发送失败'),
        description: result?.error || t('settings.notifications.testFailedDescription', '请检查系统通知权限'),
        variant: 'error'
      });
    }
  }, [notifications.soundEnabled, t]);

  // 下载更新
  const handleDownloadUpdate = useCallback(async () => {
    try {
      const result = await window.electron?.update?.download?.();
      if (!result?.success) {
        setUpdateStatus('error');
        setUpdateError(result?.error || t('update.downloadFailed', '下载更新失败'));
        return;
      }

      const platform = window.electron?.app?.getPlatform?.();
      if (platform === 'darwin' || platform === 'win32') {
        setShowUpdateDialog(false);
      }
    } catch {
      setUpdateStatus('error');
      setUpdateError(t('update.downloadFailed', '下载更新失败'));
    }
  }, [t]);

  // 安装更新
  const handleInstallUpdate = useCallback(async () => {
    try {
      const result = await window.electron?.update?.install?.();
      if (!result?.success) {
        setUpdateStatus('error');
        setUpdateError(result?.error || t('update.installFailed', '安装更新失败'));
      }
    } catch {
      setUpdateStatus('error');
      setUpdateError(t('update.installFailed', '安装更新失败'));
    }
  }, [t]);

  // 处理登出
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = useCallback(() => {
    setShowLogoutConfirm(true);
  }, []);

  const confirmLogout = useCallback(() => {
    setShowLogoutConfirm(false);
    logout();
    onClose?.();
  }, [logout, onClose]);

  // 获取用户头像 fallback
  const getUserInitials = (user: User | null): string => {
    if (!user) return '?';
    if (user.name) return user.name.charAt(0).toUpperCase();
    if (user.email) return user.email.charAt(0).toUpperCase();
    return '?';
  };

  return (
    <div className="flex h-full flex-col bg-[#faf9f5] dark:bg-[#141413]">
      {/* 头部 — 无边框，底部微阴影分隔 */}
      <div className="flex items-center justify-between px-6 py-4 shadow-[0_1px_0_rgba(20,20,19,0.06)] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)]">
        <h1 className="text-[17px] font-semibold text-[#141413] dark:text-[#faf9f5] tracking-tight" style={{ fontFamily: 'system-ui' }}>
          {t('settings.title', '设置')}
        </h1>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#ffffff0a] hover:text-[#141413] dark:hover:text-[#faf9f5] transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 内容 */}
      <div className="flex flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1"
          orientation="vertical"
        >
          {/* 侧边标签列表 — Anthropic 风格 */}
          <TabsList className="flex h-full w-52 flex-col items-stretch justify-start gap-0.5 bg-transparent p-3 border-r border-[#1414130a] dark:border-[#ffffff08]">
            <TabsTrigger value="account" className="justify-start gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] hover:text-[#141413] dark:hover:text-[#faf9f5] data-[state=active]:bg-[#ae563010] data-[state=active]:text-[#ae5630] transition-colors font-medium">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {t('settings.account.title', '账号')}
            </TabsTrigger>
            <TabsTrigger value="billing" className="justify-start gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] hover:text-[#141413] dark:hover:text-[#faf9f5] data-[state=active]:bg-[#ae563010] data-[state=active]:text-[#ae5630] transition-colors font-medium">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              {t('settings.billing.title', '充值')}
            </TabsTrigger>
            <TabsTrigger value="memory" className="justify-start gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] hover:text-[#141413] dark:hover:text-[#faf9f5] data-[state=active]:bg-[#ae563010] data-[state=active]:text-[#ae5630] transition-colors font-medium">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              {t('settings.memory.title', '记忆')}
            </TabsTrigger>
            <TabsTrigger value="skills" className="justify-start gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] hover:text-[#141413] dark:hover:text-[#faf9f5] data-[state=active]:bg-[#ae563010] data-[state=active]:text-[#ae5630] transition-colors font-medium">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {t('settings.skills.title', '技能')}
            </TabsTrigger>
            <TabsTrigger value="appearance" className="justify-start gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] hover:text-[#141413] dark:hover:text-[#faf9f5] data-[state=active]:bg-[#ae563010] data-[state=active]:text-[#ae5630] transition-colors font-medium">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
              {t('settings.appearance.title', '外观')}
            </TabsTrigger>
            <TabsTrigger value="sync" className="justify-start gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] hover:text-[#141413] dark:hover:text-[#faf9f5] data-[state=active]:bg-[#ae563010] data-[state=active]:text-[#ae5630] transition-colors font-medium">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
              {t('settings.sync.title', '同步')}
            </TabsTrigger>
            <TabsTrigger value="data" className="justify-start gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] hover:text-[#141413] dark:hover:text-[#faf9f5] data-[state=active]:bg-[#ae563010] data-[state=active]:text-[#ae5630] transition-colors font-medium">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
                <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
              </svg>
              {t('settings.data.title', '数据')}
            </TabsTrigger>
            <TabsTrigger value="about" className="justify-start gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#ffffff08] hover:text-[#141413] dark:hover:text-[#faf9f5] data-[state=active]:bg-[#ae563010] data-[state=active]:text-[#ae5630] transition-colors font-medium">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              {t('settings.about.title', '关于')}
            </TabsTrigger>
          </TabsList>

          {/* 内容区域 */}
          <ScrollArea className="flex-1">
            <div className="p-6">
              {/* 账号标签 */}
              <TabsContent value="account" className="mt-0 space-y-6">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
                    {t('settings.account.profile', '个人资料')}
                  </h2>
                  <p className="text-sm text-[#87867f]">
                    {t('settings.account.profileDescription', '管理您的账号信息')}
                  </p>
                </div>

                {isAuthenticated && user ? (
                  <div className="space-y-4">
                    {/* 用户信息卡片 */}
                    <div className="flex items-center gap-4 rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] p-4">
                      <Avatar className="h-16 w-16">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback className="text-lg bg-accent/10">
                          {userAvatar && PRESET_AVATARS.find((a) => a.id === userAvatar)
                            ? <img src={PRESET_AVATARS.find((a) => a.id === userAvatar)!.src} alt={userAvatar} className="h-10 w-10 object-contain" />
                            : getUserInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium text-[#141413] dark:text-[#faf9f5]">
                          {user.name || t('settings.account.unnamed', '未命名用户')}
                        </p>
                        <p className="text-sm text-[#87867f]">{user.email}</p>
                        {user.provider && (
                          <Badge variant="secondary" className="mt-1">
                            {user.provider}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* 头像选择器 */}
                    <div className="rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] p-4">
                      <h4 className="text-sm font-medium text-[#141413] dark:text-[#e5e4df] mb-3">
                        {t('settings.account.avatarPicker', '选择头像')}
                      </h4>
                      <div className="grid grid-cols-10 gap-2">
                        {PRESET_AVATARS.map((avatar) => (
                          <button
                            key={avatar.id}
                            type="button"
                            onClick={() => setUserAvatar(userAvatar === avatar.id ? '' : avatar.id)}
                            className={cn(
                              'flex items-center justify-center h-9 w-9 rounded-lg transition-all hover:scale-110',
                              userAvatar === avatar.id
                                ? 'bg-accent/20 ring-2 ring-accent'
                                : 'bg-[#1414130d] dark:bg-[#ffffff0d] hover:bg-[#1414131a] dark:hover:bg-[#ffffff1a]'
                            )}
                            title={avatar.label}
                          >
                            <img src={avatar.src} alt={avatar.label} className="h-7 w-7 object-contain" />
                          </button>
                        ))}
                      </div>
                      {userAvatar && (
                        <button
                          type="button"
                          onClick={() => setUserAvatar('')}
                          className="mt-2 text-xs text-[#87867f] hover:text-[#141413] dark:hover:text-[#e5e4df] transition-colors"
                        >
                          {t('settings.account.clearAvatar', '清除头像')}
                        </button>
                      )}
                    </div>

                    {/* 登出按钮 */}
                    <Button variant="destructive" onClick={handleLogout}>
                      {t('settings.account.logout', '退出登录')}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] p-6 text-center">
                    <p className="text-[#87867f]">
                      {t('settings.account.notLoggedIn', '您尚未登录')}
                    </p>
                    <Button className="mt-4">
                      {t('settings.account.login', '登录')}
                    </Button>
                  </div>
                )}

                {/* 通知设置 */}
                <div className="pt-4 border-t border-[#1414130a] dark:border-[#ffffff08]">
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
                      {t('settings.notifications.title', '通知')}
                    </h2>
                    <p className="text-sm text-[#87867f]">
                      {t('settings.notifications.description', '控制系统通知与声音提示')}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3 rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] p-4">
                    <label className="flex items-start gap-3">
                      <Checkbox
                        checked={notifications.enabled}
                        onCheckedChange={(checked) =>
                          setNotifications({ enabled: Boolean(checked) })
                        }
                      />
                      <div>
                        <p className="text-sm font-medium text-[#141413] dark:text-[#faf9f5]">
                          {t('settings.notifications.enable', '启用通知')}
                        </p>
                        <p className="text-xs text-[#87867f]">
                          {t('settings.notifications.enableDescription', '允许应用发送通知')}
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3">
                      <Checkbox
                        checked={notifications.desktopNotifications}
                        disabled={!notifications.enabled}
                        onCheckedChange={(checked) =>
                          setNotifications({ desktopNotifications: Boolean(checked) })
                        }
                      />
                      <div>
                        <p className="text-sm font-medium text-[#141413] dark:text-[#faf9f5]">
                          {t('settings.notifications.system', '系统通知')}
                        </p>
                        <p className="text-xs text-[#87867f]">
                          {t('settings.notifications.systemDescription', 'AI 回复完成时显示系统通知')}
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3">
                      <Checkbox
                        checked={notifications.permissionNotifications}
                        disabled={!notifications.enabled}
                        onCheckedChange={(checked) =>
                          setNotifications({ permissionNotifications: Boolean(checked) })
                        }
                      />
                      <div>
                        <p className="text-sm font-medium text-[#141413] dark:text-[#faf9f5]">
                          {t('settings.notifications.permission', '权限请求通知')}
                        </p>
                        <p className="text-xs text-[#87867f]">
                          {t('settings.notifications.permissionDescription', '有权限请求时发送系统通知')}
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3">
                      <Checkbox
                        checked={notifications.soundEnabled}
                        disabled={!notifications.enabled}
                        onCheckedChange={(checked) =>
                          setNotifications({ soundEnabled: Boolean(checked) })
                        }
                      />
                      <div>
                        <p className="text-sm font-medium text-[#141413] dark:text-[#faf9f5]">
                          {t('settings.notifications.sound', '通知声音')}
                        </p>
                        <p className="text-xs text-[#87867f]">
                          {t('settings.notifications.soundDescription', '通知时播放提示音')}
                        </p>
                      </div>
                    </label>

                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTestNotification}
                        disabled={!notifications.enabled}
                      >
                        {t('settings.notifications.test', '测试通知')}
                      </Button>
                    </div>
                  </div>
                </div>

              </TabsContent>

              {/* 充值标签 */}
              <TabsContent value="billing" className="mt-0 space-y-6">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
                    {t('settings.billing.balance', '余额')}
                  </h2>
                  <p className="text-sm text-[#87867f]">
                    {t('settings.billing.balanceDescription', '查看和管理您的账户余额')}
                  </p>
                </div>

                {/* 余额显示 */}
                <div className="rounded-2xl border border-[#1414131a] dark:border-[#faf9f51a] bg-white dark:bg-[#3d3d3a] p-6 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]">
                  <p className="text-sm text-[#87867f]">
                    {t('settings.billing.currentBalance', '当前余额')}
                  </p>
                  <p className="mt-1 text-3xl font-bold text-accent">
                    {formatBalance(balance)}
                  </p>
                  {balance?.updatedAt && (
                    <p className="mt-2 text-xs text-[#87867f]">
                      {t('settings.billing.lastUpdated', '更新于')}{' '}
                      {new Date(balance.updatedAt).toLocaleString(locale)}
                    </p>
                  )}
                </div>

                {/* 期卡套餐（仅认证且有期卡时展示） */}
                {isAuthenticated && periodCards.length > 0 && (
                  <div className="max-h-[400px] overflow-y-auto">
                    <ActivePeriodCard />
                  </div>
                )}

                {/* 充值入口 */}
                <Button onClick={onNavigateToRecharge}>
                  {t('settings.billing.recharge', '充值')}
                </Button>
              </TabsContent>

              {/* 记忆标签 */}
              <TabsContent value="memory" className="mt-0 space-y-6">
                <MemoryEditor className="min-h-[600px]" />
              </TabsContent>

              {/* Skill 标签 */}
              <TabsContent value="skills" className="mt-0 space-y-6">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
                    {t('settings.skills.market', '技能中心')}
                  </h2>
                  <p className="text-sm text-[#87867f]">
                    {t('settings.skills.marketDescription', '给 AI 安装“专用能力包”，让它在不同任务中表现更稳定。')}
                  </p>
                  <p className="mt-1 text-xs text-[#87867f]">
                    {t('settings.skills.quickStartHint', '你可以先开启常用技能，后续再按需要逐步增加。')}
                  </p>
                </div>

                <div className="rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] p-6">
                  <Suspense fallback={
                    <div className="flex items-center justify-center py-12">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    </div>
                  }>
                    <SkillMarket />
                  </Suspense>
                </div>
              </TabsContent>

              {/* 外观标签 */}
              <TabsContent value="appearance" className="mt-0 space-y-6">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
                    {t('settings.appearance.theme', '主题')}
                  </h2>
                  <p className="text-sm text-[#87867f]">
                    {t('settings.appearance.themeDescription', '选择应用的外观主题')}
                  </p>
                </div>

                {/* 主题选择 */}
                <div className="grid grid-cols-3 gap-3">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTheme(option.value)}
                      className={`flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all duration-200 ${
                        theme === option.value
                          ? 'border-accent bg-accent/5 shadow-md ring-1 ring-accent/20'
                          : 'border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] hover:border-[#14141320] dark:hover:border-[#ffffff20] hover:shadow-sm'
                      }`}
                    >
                      <ThemeIcon icon={option.icon} />
                      <span className="text-sm font-medium text-[#141413] dark:text-[#e5e4df]">
                        {t(option.labelKey, option.value)}
                      </span>
                    </button>
                  ))}
                </div>

                {/* 语言选择 */}
                <div className="mt-8">
                  <h2 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
                    {t('settings.appearance.language', '语言')}
                  </h2>
                  <p className="text-sm text-[#87867f]">
                    {t('settings.appearance.languageDescription', '选择界面语言')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {supportedLanguages.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => changeLanguage(lang.code)}
                      className={`flex items-center justify-center rounded-2xl border p-4 transition-all duration-200 ${
                        language === lang.code
                          ? 'border-accent bg-accent/5 shadow-md ring-1 ring-accent/20'
                          : 'border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] hover:border-[#14141320] dark:hover:border-[#ffffff20] hover:shadow-sm'
                      }`}
                    >
                      <span className="font-medium text-[#141413] dark:text-[#e5e4df]">{lang.nativeName}</span>
                    </button>
                  ))}
                </div>

                {/* 聊天排版 */}
                <div className="mt-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
                        {t('settings.appearance.chatTypography', '聊天排版')}
                      </h2>
                      <p className="text-sm text-[#87867f]">
                        {t('settings.appearance.chatTypographyDesc', '自定义聊天区域的字体大小和间距')}
                      </p>
                    </div>
                    {(chatTypography.fontSize !== defaultChatTypography.fontSize ||
                      chatTypography.lineHeight !== defaultChatTypography.lineHeight ||
                      chatTypography.paragraphSpacing !== defaultChatTypography.paragraphSpacing) && (
                      <button
                        type="button"
                        onClick={() => resetChatTypography()}
                        className="text-sm text-accent hover:text-accent-hover transition-colors"
                      >
                        {t('settings.appearance.resetTypography', '恢复默认')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  {/* 字体大小 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-[#141413] dark:text-[#e5e4df]">
                        {t('settings.appearance.fontSize', '字体大小')}
                      </label>
                      <span className="text-sm tabular-nums text-[#87867f]">{chatTypography.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={13}
                      max={20}
                      step={1}
                      value={chatTypography.fontSize}
                      onChange={(e) => setChatTypography({ fontSize: Number(e.target.value) })}
                      className="w-full h-1.5 rounded-full bg-[#1414130f] dark:bg-[#ffffff0f] appearance-none cursor-pointer accent-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-sm"
                    />
                    <div className="flex justify-between text-[10px] text-[#87867f]">
                      <span>13</span>
                      <span>20</span>
                    </div>
                  </div>

                  {/* 行间距 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-[#141413] dark:text-[#e5e4df]">
                        {t('settings.appearance.lineHeight', '行间距')}
                      </label>
                      <span className="text-sm tabular-nums text-[#87867f]">{chatTypography.lineHeight.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={1.4}
                      max={2.4}
                      step={0.1}
                      value={chatTypography.lineHeight}
                      onChange={(e) => setChatTypography({ lineHeight: Number(e.target.value) })}
                      className="w-full h-1.5 rounded-full bg-[#1414130f] dark:bg-[#ffffff0f] appearance-none cursor-pointer accent-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-sm"
                    />
                    <div className="flex justify-between text-[10px] text-[#87867f]">
                      <span>1.4</span>
                      <span>2.4</span>
                    </div>
                  </div>

                  {/* 段落间距 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-[#141413] dark:text-[#e5e4df]">
                        {t('settings.appearance.paragraphSpacing', '段落间距')}
                      </label>
                      <span className="text-sm tabular-nums text-[#87867f]">{chatTypography.paragraphSpacing.toFixed(2)}em</span>
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={2.0}
                      step={0.05}
                      value={chatTypography.paragraphSpacing}
                      onChange={(e) => setChatTypography({ paragraphSpacing: Number(e.target.value) })}
                      className="w-full h-1.5 rounded-full bg-[#1414130f] dark:bg-[#ffffff0f] appearance-none cursor-pointer accent-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-sm"
                    />
                    <div className="flex justify-between text-[10px] text-[#87867f]">
                      <span>0.25</span>
                      <span>2.0</span>
                    </div>
                  </div>

                  {/* 实时预览 */}
                  <div
                    className="rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] p-4"
                    style={{
                      '--chat-font-size': `${chatTypography.fontSize / 16}rem`,
                      '--chat-line-height': `${chatTypography.lineHeight}`,
                      '--chat-paragraph-spacing': `${chatTypography.paragraphSpacing}em`,
                    } as React.CSSProperties}
                  >
                    <p className="text-[10px] text-[#87867f] mb-2 uppercase tracking-widest">{t('settings.appearance.preview', '预览')}</p>
                    <p
                      className="text-[#141413] dark:text-[#e5e4df] tracking-[0.01em]"
                      style={{
                        fontSize: 'var(--chat-font-size)',
                        lineHeight: 'var(--chat-line-height)',
                        marginBottom: 'var(--chat-paragraph-spacing)',
                      }}
                    >
                      {t('settings.appearance.typographyPreview', '这是一段预览文本，展示当前排版设置的效果。AI 的回答会使用这些设置来显示。')}
                    </p>
                    <p
                      className="text-[#141413] dark:text-[#e5e4df] tracking-[0.01em]"
                      style={{
                        fontSize: 'var(--chat-font-size)',
                        lineHeight: 'var(--chat-line-height)',
                      }}
                    >
                      Cherry Agent helps you work smarter with AI-powered conversations.
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* 同步标签 */}
              <TabsContent value="sync" className="mt-0 space-y-6">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
                    {t('settings.sync.cloudSync', '云同步')}
                  </h2>
                  <p className="text-sm text-[#87867f]">
                    {t('settings.sync.cloudSyncDescription', '同步您的设置和数据到云端')}
                  </p>
                </div>
                <CloudSync />
              </TabsContent>

              {/* 数据管理标签 */}
              <TabsContent value="data" className="mt-0 space-y-6">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
                    {t('settings.data.title', '数据管理')}
                  </h2>
                  <p className="text-sm text-[#87867f]">
                    {t('settings.data.description', '导入、导出与管理本地数据')}
                  </p>
                </div>
                <DataManagement />
              </TabsContent>

              {/* 关于标签 */}
              <TabsContent value="about" className="mt-0 space-y-6">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
                    {t('settings.about.appInfo', '应用信息')}
                  </h2>
                  <p className="text-sm text-[#87867f]">
                    {t('settings.about.appInfoDescription', '查看应用版本和更新信息')}
                  </p>
                </div>

                {/* 版本信息 */}
                <div className="rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] p-6 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 shadow-sm">
                      <svg className="h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-lg font-semibold text-[#141413] dark:text-[#faf9f5]">
                        {appInfo?.name || 'Cherry Agent'}
                      </p>
                      <p className="text-sm text-[#87867f]">
                        {t('settings.about.version', '版本')} {appInfo?.version || '0.1.0'}
                      </p>
                      {appInfo?.isPackaged === false && (
                        <Badge variant="secondary" className="mt-1">
                          {t('settings.about.devMode', '开发模式')}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* 检查更新按钮 */}
                  <div className="mt-4 border-t border-[#1414130a] dark:border-[#ffffff08] pt-4">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleCheckUpdate}
                      disabled={updateStatus === 'checking'}
                    >
                      {updateStatus === 'checking' ? (
                        <>
                          <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          {t('settings.about.checking', '正在检查...')}
                        </>
                      ) : (
                        t('settings.about.checkUpdate', '检查更新')
                      )}
                    </Button>
                  </div>
                </div>

                {/* 其他链接 */}
                <div className="space-y-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm text-[#141413] dark:text-[#e5e4df] hover:bg-white dark:bg-[#3d3d3a] transition-colors"
                    onClick={() => {
                      resetOnboarding();
                      toast({
                        title: t('onboarding.resetTour', '重新引导'),
                        description: t('onboarding.resetTourDesc', '重新显示新手引导流程'),
                        variant: 'success',
                      });
                      window.location.reload();
                    }}
                  >
                    <span>{t('onboarding.resetTour', '重新引导')}</span>
                    <svg className="h-4 w-4 text-[#87867f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm text-[#141413] dark:text-[#e5e4df] hover:bg-white dark:bg-[#3d3d3a] transition-colors"
                    onClick={() => setConfigDialogKey('privacyPolicy')}
                  >
                    <span>{t('settings.about.privacyPolicy', '隐私政策')}</span>
                    <svg className="h-4 w-4 text-[#87867f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm text-[#141413] dark:text-[#e5e4df] hover:bg-white dark:bg-[#3d3d3a] transition-colors"
                    onClick={() => setConfigDialogKey('termsOfService')}
                  >
                    <span>{t('settings.about.termsOfService', '服务条款')}</span>
                    <svg className="h-4 w-4 text-[#87867f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm text-[#141413] dark:text-[#e5e4df] hover:bg-white dark:bg-[#3d3d3a] transition-colors"
                    onClick={() => setConfigDialogKey('aboutUs')}
                  >
                    <span>{t('settings.about.aboutUs', '关于我们')}</span>
                    <svg className="h-4 w-4 text-[#87867f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm text-[#141413] dark:text-[#e5e4df] hover:bg-white dark:bg-[#3d3d3a] transition-colors"
                  >
                    <span>{t('settings.about.feedback', '反馈建议')}</span>
                    <svg className="h-4 w-4 text-[#87867f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </div>

      {/* 更新对话框 */}
      <UpdateNotification
        open={showUpdateDialog}
        onClose={() => setShowUpdateDialog(false)}
        updateInfo={updateInfo}
        status={updateStatus}
        downloadProgress={downloadProgress}
        error={updateError}
        onCheckUpdate={handleCheckUpdate}
        onDownloadUpdate={handleDownloadUpdate}
        onInstallUpdate={handleInstallUpdate}
      />

      {/* 配置内容弹窗（隐私政策/服务条款） */}
      {configDialogKey && (() => {
        const configDialogData = {
          privacyPolicy: {
            title: t('settings.about.privacyPolicy', '隐私政策'),
            content: remoteConfig.privacyPolicy || t('settings.about.noContent', '暂无内容'),
          },
          termsOfService: {
            title: t('settings.about.termsOfService', '服务条款'),
            content: remoteConfig.termsOfService || t('settings.about.noContent', '暂无内容'),
          },
          aboutUs: {
            title: t('settings.about.aboutUs', '关于我们'),
            content: remoteConfig.aboutUs || t('settings.about.noContent', '暂无内容'),
          },
        }[configDialogKey];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfigDialogKey(null)}>
            <div
              className="relative mx-4 max-h-[80vh] w-full max-w-lg rounded-2xl border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#3d3d3a] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#1414130a] dark:border-[#ffffff08] px-6 py-4">
                <h3 className="text-lg font-semibold text-[#141413] dark:text-[#faf9f5]">{configDialogData.title}</h3>
                <button
                  type="button"
                  onClick={() => setConfigDialogKey(null)}
                  className="rounded-md p-1 text-[#87867f] hover:text-[#141413] dark:hover:text-[#e5e4df] transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <ScrollArea className="h-[60vh] px-6 py-4">
                <MarkdownRenderer
                  content={configDialogData.content}
                  enhancedCodeBlocks={false}
                  className="prose prose-sm dark:prose-invert max-w-none"
                />
              </ScrollArea>
            </div>
          </div>
        );
      })()}

      <LogoutConfirmDialog
        open={showLogoutConfirm}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}

export default SettingsPage;
