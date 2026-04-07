import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { useIPC } from "./hooks/useIPC";
import { useMessageWindow } from "./hooks/useMessageWindow";
import { useAppStore, type PermissionRequest } from "./store/useAppStore";
import { useRouter } from "./hooks/useRouter";
import { useTheme } from "./hooks/useTheme";
import { useScrollManager } from "./hooks/useScrollManager";
import { useSessionEvents } from "./hooks/useSessionEvents";
import { resolveSupportedLanguage } from "./i18n/config";
import i18n from "./i18n/config";
import { useAppLayout } from "./hooks/useAppLayout";
import type { PermissionMode } from "./types";
import { Sidebar } from "./components/Sidebar";
import { resolveSessionSelectionAction } from "./lib/session-selection";
import { PromptInput } from "./components/PromptInput";
import { TopBar } from "./components/TopBar";
import { ChatView } from "./components/chat/ChatView";
import { GlobalDialogs } from "./components/GlobalDialogs";
import { WorkPanel } from "./components/work-panel/WorkPanel";
import { AuthGuard } from "./components/auth/AuthGuard";
const Onboarding = React.lazy(() => import("./components/Onboarding").then(m => ({ default: m.Onboarding })));
const UsagePage = React.lazy(() => import("./pages/UsagePage").then(m => ({ default: m.UsagePage })));
const PricingPage = React.lazy(() => import("./pages/PricingPage").then(m => ({ default: m.PricingPage })));
const SkillMarket = React.lazy(() => import("./pages/SkillMarket").then(m => ({ default: m.SkillMarket })));
const SettingsPage = React.lazy(() => import("./pages/Settings").then(m => ({ default: m.SettingsPage })));
const ReferralPage = React.lazy(() => import("./pages/ReferralPage").then(m => ({ default: m.ReferralPage })));
import { ToastHost } from "./components/ToastHost";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { reportError } from "./utils/error-reporter";
import { useAuthStore } from "./store/useAuthStore";
import { useSettingsStore } from "./store/useSettingsStore";
import {
  listExecutionsForSession,
  useToolExecutionStore,
  type ToolExecutionState,
} from "./hooks/useToolExecutionStore";
import { useShallow } from "zustand/react/shallow";
import { useModelStore } from './hooks/useModels';
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { CheckInModal } from "./components/CheckInModal";
import { AuthStatusIndicator } from "./components/chat/AuthStatusIndicator";
import { TooltipProvider } from "@/ui/components/ui";
import { realignChatViewportForForeground } from "./utils/chat-visibility";
import { lazy } from "react";
const StreamingTestPage = lazy(() => import("./pages/StreamingTestPage").then(m => ({ default: m.StreamingTestPage })));

function App() {
  useTheme();

  const { t } = useTranslation();
  const { currentRoute, navigate } = useRouter();
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('bypassPermissions');
  const [startSkillMode, setStartSkillMode] = useState<"manual" | "auto">("auto");
  const [startActiveSkillIds, setStartActiveSkillIds] = useState<string[]>([]);
  const [highlightSessionId, setHighlightSessionId] = useState<string | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string>("account");
  const [streamingPartial, setStreamingPartial] = useState("");
  const highlightTimerRef = useRef<number | null>(null);
  const foregroundRealignTimerRef = useRef<number | null>(null);
  // 缓存 bootstrap Promise，防止 handleNewSession 在 cwd 未就绪时再次触发完整 bootstrap
  const bootstrapCacheRef = useRef<Promise<any> | null>(null);

  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const activeSession = useAppStore((s) => {
    const id = s.activeSessionId;
    return id ? s.sessions[id] : undefined;
  });
  const showStartModal = useAppStore((s) => s.showStartModal);
  const setShowStartModal = useAppStore((s) => s.setShowStartModal);
  const showSettingsModal = useAppStore((s) => s.showSettingsModal);
  const setShowSettingsModal = useAppStore((s) => s.setShowSettingsModal);
  const globalError = useAppStore((s) => s.globalError);
  const setGlobalError = useAppStore((s) => s.setGlobalError);
  const setActivePage = useAppStore((s) => s.setActivePage);
  const historyRequested = useAppStore((s) => s.historyRequested);
  const markHistoryRequested = useAppStore((s) => s.markHistoryRequested);
  const resolvePermissionRequest = useAppStore((s) => s.resolvePermissionRequest);
  const cwd = useAppStore((s) => s.cwd);
  const setCwd = useAppStore((s) => s.setCwd);
  const pendingStart = useAppStore((s) => s.pendingStart);
  const apiConfigChecked = useAppStore((s) => s.apiConfigChecked);
  const setApiConfigChecked = useAppStore((s) => s.setApiConfigChecked);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const messages = activeSession?.messages ?? [];
  const permissionRequests = activeSession?.permissionRequests ?? [];
  const isRunning = activeSession?.status === "running";
  const isStopping = activeSession?.isStopping ?? false;
  const isRetrying = activeSession?.isRetrying ?? false;
  const retryAttempt = activeSession?.retryAttempt ?? 0;
  const waitingPhase = activeSession?.waitingPhase ?? null;
  const activeToolExecutions = useToolExecutionStore(
    useShallow((state) => {
      const result: Record<string, ToolExecutionState> = {};
      for (const exec of listExecutionsForSession(state.executions, activeSessionId)) {
        if (exec.status === "running" || exec.status === "pending") {
          result[exec.toolUseId] = exec;
        }
      }
      return result;
    })
  );

  const setSessionLoadingHistory = useAppStore((s) => s.setSessionLoadingHistory);

  // ref 用于 serverPagination 闭包中稳定引用 sendEvent（sendEvent 在 useIPC 后才可用）
  const sendEventStableRef = useRef<((event: any) => void) | null>(null);

  const serverPagination = useMemo(() => {
    if (!activeSession || !activeSessionId) return undefined;
    return {
      hasMoreServerHistory: activeSession.hasMoreServerHistory ?? false,
      oldestLoadedCreatedAt: activeSession.oldestLoadedCreatedAt,
      oldestLoadedRowid: activeSession.oldestLoadedRowid,
      isLoadingServerHistory: activeSession.isLoadingServerHistory ?? false,
      onRequestMoreHistory: (sid: string, beforeCreatedAt: number, beforeRowid: number) => {
        setSessionLoadingHistory(sid, true);
        sendEventStableRef.current?.({
          type: "session.history",
          payload: { sessionId: sid, beforeCreatedAt, beforeRowid },
        });
      },
    };
  }, [
    activeSession?.hasMoreServerHistory,
    activeSession?.oldestLoadedCreatedAt,
    activeSession?.oldestLoadedRowid,
    activeSession?.isLoadingServerHistory,
    activeSessionId,
    setSessionLoadingHistory,
  ]);

  const {
    visibleMessages,
    hasMoreHistory,
    isLoadingHistory,
    loadMoreMessages,
    resetToLatest,
    totalMessages,
  } = useMessageWindow(messages, permissionRequests, activeSessionId, serverPagination);

  const {
    layout,
    sidebarCollapsed,
    fileExplorerCollapsed,
    effectiveSidebarWidth,
    fileExplorerWidth,
    setFileExplorerCollapsed,
    toggleSidebar,
  } = useAppLayout(activeSession?.cwd, activeSessionId);

  const scrollManager = useScrollManager(
    activeSessionId,
    messages.length,
    streamingPartial,
    resetToLatest,
    hasMoreHistory,
    isLoadingHistory,
    loadMoreMessages,
    visibleMessages,
    isRunning
  );
  const chatScrollContainerRef = scrollManager.scrollContainerRef;
  const chatShouldAutoScrollRef = scrollManager.shouldAutoScrollRef;
  const handleChatScroll = scrollManager.handleScroll;

  const sessionEvents = useSessionEvents(
    scrollManager.shouldAutoScrollRef,
    scrollManager.scrollContainerRef,
    scrollManager.setHasNewMessages,
    setStreamingPartial
  );

  const { connected, sendEvent, dispatchEvent } = useIPC(sessionEvents.onEvent, sessionEvents.onBatchEvent);
  sendEventStableRef.current = sendEvent; // 每次渲染同步最新引用

  // 注册 widget 钻取交互桥接：widget 内点击 → 发送新消息到当前会话
  useEffect(() => {
    (window as any).__widgetSendMessage = (text: string) => {
      const sessionId = useAppStore.getState().activeSessionId;
      if (!sessionId || !text) return;
      sendEventStableRef.current?.({
        type: 'session.continue',
        payload: { sessionId, prompt: text },
      });
    };
    return () => { delete (window as any).__widgetSendMessage; };
  }, []);

  const sendEventWithControls = useCallback((event: any) => {
    sendEvent(event);
  }, [sendEvent]);

  const dispatchEventWithControls = useCallback(async (event: any): Promise<{ success: boolean; error?: string }> => {
    return dispatchEvent(event);
  }, [dispatchEvent]);

  // handleStartFromModal: 不通过 usePromptActions（避免订阅 prompt 导致全树重渲染）
  const handleStartFromModal = useCallback(() => {
    const cwd = useAppStore.getState().cwd;
    if (!cwd.trim()) {
      useAppStore.getState().setGlobalError(
        t("error.workingDirectoryRequired", "需要设置工作目录才能开始会话")
      );
      return;
    }
    useAppStore.getState().setPendingStart(false);
    useAppStore.getState().setPendingStartRequestId(null);
    useAppStore.getState().setPrompt("");

    setShowStartModal(false);
    navigate('/chat');
    setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>('textarea[data-prompt-input]')?.focus();
    }, 100);
  }, [setShowStartModal, navigate, t]);

  const pendingPermissionQueue = useMemo(() => {
    const items: { sessionId: string; title: string; request: PermissionRequest; provider?: "claude" | "codex" }[] = [];
    for (const session of Object.values(sessions)) {
      if (session.permissionRequests?.length) {
        for (const req of session.permissionRequests) {
          items.push({
            sessionId: session.id,
            title: session.title || t("notifications.untitledSession", "未命名会话"),
            request: req,
            provider: session.provider
          });
        }
      }
    }
    return items;
  }, [sessions, t]);

  const toolUseIdsInMessages = useMemo(() => {
    const ids = new Set<string>();
    for (const msg of messages) {
      if ((msg as any).type === "assistant" && (msg as any).message?.content) {
        for (const block of (msg as any).message.content) {
          if (block.type === "tool_use" && block.id) {
            ids.add(block.id);
          }
        }
      }
    }
    return ids;
  }, [messages]);

  const liveToolExecutions = useMemo(
    () =>
      Object.values(activeToolExecutions).filter(
        (exec) => !toolUseIdsInMessages.has(exec.toolUseId)
      ),
    [activeToolExecutions, toolUseIdsInMessages]
  );

  // 全局错误兜底：捕获 renderer 未处理的 JS 错误与 Promise rejection，上报到主进程写入 error.log
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      window.electron?.reportError?.({
        type: 'renderer_unhandled_error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        ts: Date.now(),
      });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      window.electron?.reportError?.({
        type: 'renderer_unhandled_rejection',
        reason: String(event.reason),
        stack: event.reason?.stack,
        ts: Date.now(),
      });
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []); // 只注册一次

  useEffect(() => {
    if (!apiConfigChecked) {
      if (typeof window.electron === "undefined") {
        console.warn("[App] Not running in Electron environment, skipping auth check");
        setApiConfigChecked(true);
        return;
      }

      // 使用 bootstrap 一次性获取启动数据，减少 IPC 往返；同时缓存 Promise 供后续复用
      bootstrapCacheRef.current = window.electron.app.bootstrap();
      bootstrapCacheRef.current.then(async (data: any) => {
        setApiConfigChecked(true);

        // 初始化语言：如果 localStorage 没有值或者是默认的 en，使用系统语言
        const storedLang = localStorage.getItem('i18nextLng');
        console.log('[App] Language init - stored:', storedLang, 'system:', data.systemLocale);

        if (data.systemLocale) {
          const supportedLang = resolveSupportedLanguage(data.systemLocale);
          console.log('[App] Resolved system locale to:', supportedLang);

          // 如果没有存储的语言，或者存储的是 en 但系统语言不是 en，使用系统语言
          if (!storedLang || (storedLang === 'en' && supportedLang && supportedLang !== 'en')) {
            if (supportedLang) {
              await i18n.changeLanguage(supportedLang);
              console.log('[App] Changed language to:', supportedLang);
            }
          }
        }

        if (data?.featureFlags?.desktop) {
          useSettingsStore.getState().setProviderSettings({
            enableProviderSwitch: Boolean(data.featureFlags.desktop.enableProviderSwitch),
          });
        }

        // 更新认证状态
        if (data.isAuthenticated && data.user) {
          useAuthStore.getState().setUser(data.user);

          // 如果有 accessToken，自动刷新用户信息以确保数据最新
          const authState = useAuthStore.getState();
          if (authState.accessToken && !authState.isTokenExpired()) {
            try {
              const { authApi } = await import('./lib/auth-api');
              const userInfo = await authApi.getUserInfo();
              useAuthStore.getState().setUser(userInfo);
              // 同时刷新余额
              authState.fetchBalance(true);
            } catch (error) {
              console.warn('[App] Failed to refresh user info on startup:', error);
              // 如果刷新失败，保留 bootstrap 返回的用户信息
            }
          }
        }

        // 将 sessions 注入 store（复用现有事件处理逻辑）
        if (data.sessions) {
          useAppStore.getState().handleServerEvent({
            type: "session.list",
            payload: { sessions: data.sessions },
          } as any);
        }

        // 将 balance 注入 authStore
        if (data.balance) {
          useAuthStore.getState().updateBalance({
            amount: data.balance.balance,
            currency: data.balance.currency,
            updatedAt: Date.now(),
          });
        }

        // 初始化默认工作目录（仅当尚未设定时）
        if (data.defaultCwd && !useAppStore.getState().cwd.trim()) {
          useAppStore.getState().setCwd(data.defaultCwd);
        }
      }).catch((err: any) => {
        console.error("Bootstrap failed, falling back:", err);
        setApiConfigChecked(true);
      });
    }
  }, [apiConfigChecked, setApiConfigChecked]);

  // bootstrap 已加载 sessions，但仍需在 WebSocket 连接后同步最新状态
  useEffect(() => {
    if (!connected) return;
    // 如果 bootstrap 已经加载了 sessions，跳过首次 session.list
    const state = useAppStore.getState();
    if (!state.sessionsLoaded) {
      sendEvent({ type: "session.list" });
    }
  }, [connected, sendEvent]);

  useEffect(() => {
    const scheduleForegroundRealign = () => {
      if (foregroundRealignTimerRef.current !== null) {
        window.clearTimeout(foregroundRealignTimerRef.current);
      }

      foregroundRealignTimerRef.current = window.setTimeout(() => {
        foregroundRealignTimerRef.current = null;

        requestAnimationFrame(() => {
          realignChatViewportForForeground({
            scrollContainerRef: chatScrollContainerRef,
            shouldAutoScrollRef: chatShouldAutoScrollRef,
            handleScroll: handleChatScroll,
          });
        });
      }, 120);
    };

    const handleForegroundSync = () => {
      if (!connected) return;
      sendEvent({ type: "session.list" });
      // 仅运行中或未 hydrated 的会话才补拉首页历史，避免无条件重拉
      if (activeSessionId) {
        const session = useAppStore.getState().sessions[activeSessionId];
        if (session?.status === "running" || !session?.hydrated) {
          if (!session?.hydrated) {
            useAppStore.getState().setSessionLoadingHistory(activeSessionId, true);
          }
          sendEvent({ type: "session.history", payload: { sessionId: activeSessionId } });
        }
      }
      scheduleForegroundRealign();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleForegroundSync();
      }
    };
    window.addEventListener("focus", handleForegroundSync);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleForegroundSync);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (foregroundRealignTimerRef.current !== null) {
        window.clearTimeout(foregroundRealignTimerRef.current);
      }
    };
  }, [
    activeSessionId,
    chatScrollContainerRef,
    chatShouldAutoScrollRef,
    connected,
    handleChatScroll,
    sendEvent,
  ]);

  useEffect(() => {
    if (!activeSessionId || !connected) return;
    const session = sessions[activeSessionId];
    if (session && !session.hydrated && !historyRequested.has(activeSessionId)) {
      markHistoryRequested(activeSessionId);
      // 标记 loading 状态，让骨架屏条件命中
      setSessionLoadingHistory(activeSessionId, true);
      sendEvent({ type: "session.history", payload: { sessionId: activeSessionId } });
    }
  }, [activeSessionId, connected, sessions, historyRequested, markHistoryRequested, sendEvent, setSessionLoadingHistory]);

  // Dock badge：同步未读完成数到 macOS 程序坞角标
  useEffect(() => {
    const unread = Object.values(sessions).filter((s) => s.hasUnreadCompletion).length;
    window.electron?.app?.setBadgeCount?.(unread);
  }, [sessions]);

  // 切换话题时恢复该话题使用的模型
  useEffect(() => {
    if (!activeSessionId) return;
    const session = sessions[activeSessionId];
    if (!session?.modelId) return;
    const { models, selectedModelId, selectModel } = useModelStore.getState();
    if (selectedModelId === session.modelId) return;
    const modelExists = models.some((m) => m.id === session.modelId);
    if (modelExists) {
      selectModel(session.modelId);
    }
  }, [activeSessionId, sessions]);

  const triggerHighlight = useCallback((sessionId: string) => {
    setHighlightSessionId(sessionId);
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightSessionId(null);
      highlightTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    if (!window.electron?.notifications?.onClick) return;
    const unsubscribe = window.electron.notifications.onClick((data) => {
      const sessionId = data?.sessionId;
      if (sessionId) {
        setActivePage('chat');
        useAppStore.getState().setActiveSessionId(sessionId);
        triggerHighlight(sessionId);
        setTimeout(() => {
          scrollManager.scrollToBottom();
        }, 200);
      }
    });
    return () => unsubscribe?.();
  }, [setActivePage, scrollManager.scrollToBottom, triggerHighlight, t]);

  const handleNewSession = useCallback(async (cwd?: string) => {
    // 未登录时弹出登录框
    if (!isAuthenticated) {
      sessionEvents.setShowLoginModal(true);
      return;
    }
    useAppStore.getState().setActiveSessionId(null);
    useAppStore.getState().setPrompt("");   // 清空旧草稿，避免带入新会话
    setStartSkillMode("auto");
    setStartActiveSkillIds([]);

    // 竞态防护：bootstrap 可能未完成，确保 cwd 不为空；复用缓存 Promise 避免二次完整 bootstrap
    if (cwd) {
      useAppStore.getState().setCwd(cwd);
    } else if (!useAppStore.getState().cwd.trim()) {
      try {
        const bootstrapPromise = bootstrapCacheRef.current ?? window.electron.app.bootstrap();
        const bootstrapData = await bootstrapPromise;
        if (bootstrapData?.defaultCwd) {
          useAppStore.getState().setCwd(bootstrapData.defaultCwd);
        }
      } catch {
        // bootstrap 失败不阻塞，cwd 为空时后端 runner 自有兜底
      }
    }

    // 直接进入聊天界面，不弹 modal
    navigate('/chat');
    setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>('textarea[data-prompt-input]')?.focus();
    }, 100);
  }, [isAuthenticated, sessionEvents, t, navigate]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    sendEvent({ type: "session.delete", payload: { sessionId } });
  }, [sendEvent]);

  const handlePermissionResultForSession = useCallback((sessionId: string, toolUseId: string, result: PermissionResult) => {
    sendEvent({ type: "permission.response", payload: { sessionId, toolUseId, result } });
    resolvePermissionRequest(sessionId, toolUseId);
  }, [sendEvent, resolvePermissionRequest]);

  const handleSelectSession = useCallback((sessionId: string) => {
    const action = resolveSessionSelectionAction({
      currentRoute,
      targetSessionId: sessionId,
      activeSessionId,
    });

    if (action === "noop") {
      return true;
    }

    if (action === "navigate-only") {
      navigate('/chat');
      return true;
    }

    useAppStore.getState().setActiveSessionId(sessionId);
    if (currentRoute !== '/chat') {
      navigate('/chat');
    }
    return true;
  }, [activeSessionId, currentRoute, navigate]);

  const handleSendMessage = useCallback(() => {
    scrollManager.shouldAutoScrollRef.current = true;
    scrollManager.setHasNewMessages(false);
    resetToLatest();
  }, [resetToLatest, scrollManager]);

  const handleRechargeClick = useCallback(() => {
    if (!isAuthenticated) {
      sessionEvents.setShowLoginModal(true);
    } else {
      sessionEvents.setShowRechargeModal(true);
    }
  }, [isAuthenticated, sessionEvents]);

  const handleRechargeSuccess = useCallback(() => {}, []);

  const openSettingsModal = useCallback((tab: string = "account") => {
    setSettingsInitialTab(tab);
    if (currentRoute !== '/chat') {
      navigate('/chat');
    }
    setShowSettingsModal(true);
  }, [currentRoute, navigate, setShowSettingsModal]);

  const handleUserSettingsClick = useCallback(() => {
    openSettingsModal("account");
  }, [openSettingsModal]);

  const handleUserHistoryClick = useCallback(() => {
    navigate('/usage');
  }, [navigate]);

  const handleLoginSuccess = useCallback(() => {
    sessionEvents.setShowLoginModal(false);
  }, [sessionEvents]);

  const handleLoginClick = useCallback(() => {
    sessionEvents.setShowLoginModal(true);
  }, [sessionEvents]);

  const handleCheckInClick = useCallback(() => {
    if (!isAuthenticated) {
      sessionEvents.setShowLoginModal(true);
      return;
    }
    setShowCheckInModal(true);
  }, [isAuthenticated, sessionEvents]);

  useEffect(() => {
    if (currentRoute === '/memory') {
      openSettingsModal("memory");
    }
  }, [currentRoute, openSettingsModal]);

  const sortedSessionIds = useMemo(() => {
    return Object.values(sessions)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .map((s) => s.id);
  }, [sessions]);

  const handlePrevSession = useCallback(() => {
    if (sortedSessionIds.length === 0) return;
    const currentIndex = activeSessionId
      ? sortedSessionIds.indexOf(activeSessionId)
      : -1;
    const prevIndex = currentIndex <= 0
      ? sortedSessionIds.length - 1
      : currentIndex - 1;
    handleSelectSession(sortedSessionIds[prevIndex]);
  }, [sortedSessionIds, activeSessionId, handleSelectSession]);

  const handleNextSession = useCallback(() => {
    if (sortedSessionIds.length === 0) return;
    const currentIndex = activeSessionId
      ? sortedSessionIds.indexOf(activeSessionId)
      : -1;
    const nextIndex = currentIndex >= sortedSessionIds.length - 1
      ? 0
      : currentIndex + 1;
    handleSelectSession(sortedSessionIds[nextIndex]);
  }, [sortedSessionIds, activeSessionId, handleSelectSession]);

  const handleCloseCurrentSession = useCallback(() => {
    if (!activeSessionId) return;
    handleDeleteSession(activeSessionId);
  }, [activeSessionId, handleDeleteSession]);

  const handleFocusInput = useCallback(() => {
    if (currentRoute !== '/chat') return;
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-prompt-input]'
    );
    if (textarea) {
      textarea.focus();
    }
  }, [currentRoute]);

  const handleCloseModal = useCallback(() => {
    if (showShortcutsHelp) {
      setShowShortcutsHelp(false);
      return;
    }
    if (showSettingsModal) {
      setShowSettingsModal(false);
      return;
    }
    if (showStartModal) {
      setShowStartModal(false);
      return;
    }
    if (sessionEvents.showLoginModal) {
      sessionEvents.setShowLoginModal(false);
      return;
    }
    if (sessionEvents.showRechargeModal) {
      sessionEvents.setShowRechargeModal(false);
      return;
    }
    // 无模态框打开时，若会话正在运行则停止会话
    const currentActiveSessionId = useAppStore.getState().activeSessionId;
    const currentSessions = useAppStore.getState().sessions;
    const currentSession = currentActiveSessionId ? currentSessions[currentActiveSessionId] : undefined;
    if (currentActiveSessionId && currentSession?.status === "running") {
      useAppStore.getState().setSessionStopping(currentActiveSessionId, true);
      sendEvent({ type: "session.stop", payload: { sessionId: currentActiveSessionId } });
    }
  }, [
    showShortcutsHelp,
    showSettingsModal,
    showStartModal,
    sessionEvents,
    setShowSettingsModal,
    setShowStartModal,
    sendEvent,
  ]);

  const { shortcuts } = useKeyboardShortcuts({
    onNewSession: handleNewSession,
    onFocusInput: handleFocusInput,
    onOpenSettings: () => openSettingsModal("account"),
    onPrevSession: handlePrevSession,
    onNextSession: handleNextSession,
    onCloseSession: handleCloseCurrentSession,
    onToggleFileExplorer: () => setFileExplorerCollapsed((prev) => !prev),
    onToggleSidebar: toggleSidebar,
    onCloseModal: handleCloseModal,
    onNavigateChat: () => navigate('/chat'),
    onNavigateSkills: () => navigate('/skills'),
    onNavigateMemory: () => openSettingsModal("memory"),
    onNavigateUsage: () => navigate('/usage'),
    onNavigateSettings: () => openSettingsModal("account"),
    onShowShortcutsHelp: () => setShowShortcutsHelp((prev) => !prev),
  });

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-screen bg-surface overflow-x-hidden min-w-0">
      <Sidebar
        connected={connected}
        currentRoute={currentRoute}
        onNavigate={navigate}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onSelectSession={handleSelectSession}
        width={effectiveSidebarWidth}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        onShortcutsClick={() => setShowShortcutsHelp(true)}
        onCheckInClick={handleCheckInClick}
      />

      <main
        className="flex flex-1 flex-col bg-surface-cream box-border min-w-0"
        style={{ paddingLeft: effectiveSidebarWidth }}
      >
        {(currentRoute === '/chat' || currentRoute === '/memory') && (
          <ErrorBoundary
            onError={(error) => reportError(error, 'ChatView')}
            showDetails={import.meta.env.DEV}
          >
            <div className="flex flex-1 h-full overflow-hidden min-w-0">
              <div className="flex flex-1 flex-col min-w-0">
                <TopBar
                  isAuthenticated={isAuthenticated}
                  isRunning={isRunning}
                  hasActiveSession={!!activeSessionId}
                  sessionTitle={activeSessionId ? sessions[activeSessionId]?.title : undefined}
                  hasRightPanel={!!activeSession && !fileExplorerCollapsed && !layout.autoCollapseFileExplorer}
                  onRechargeClick={handleRechargeClick}
                  onLoginClick={handleLoginClick}
                  onSettingsClick={handleUserSettingsClick}
                  onHistoryClick={handleUserHistoryClick}
                />

                <ChatView
                  activeSessionId={activeSessionId}
                  visibleMessages={visibleMessages}
                  totalMessages={totalMessages}
                  hasMoreHistory={hasMoreHistory}
                  isLoadingHistory={isLoadingHistory}
                  isRunning={isRunning}
                  isStopping={isStopping}
                  isRetrying={isRetrying}
                  retryAttempt={retryAttempt}
                  waitingPhase={waitingPhase}
                  permissionRequests={permissionRequests}
                  liveToolExecutions={liveToolExecutions}
                  partialMessage={sessionEvents.partialMessage}
                  showPartialMessage={sessionEvents.showPartialMessage}
                  highlightSessionId={highlightSessionId}
                  scrollContainerRef={scrollManager.scrollContainerRef}
                  topSentinelRef={scrollManager.topSentinelRef}
                  contentRootRef={scrollManager.contentRootRef}
                  messagesEndRef={scrollManager.messagesEndRef}
                  onScroll={scrollManager.handleScroll}
                  onNewSession={handleNewSession}
                  onPermissionResult={handlePermissionResultForSession}
                  onLoginRequired={sessionEvents.handleLoginRequired}
                  provider={activeSession?.provider}
                  isHydrating={!!activeSession?.isLoadingServerHistory && !activeSession?.hydrated}
                />

                <PromptInput
                  sendEvent={sendEventWithControls}
                  dispatchEvent={dispatchEventWithControls}
                  onSendMessage={handleSendMessage}
                  disabled={false}
                  leftInset={effectiveSidebarWidth}
                  rightInset={fileExplorerWidth}
                  onLoginClick={handleLoginClick}
                  startSkillMode={startSkillMode}
                  startPermissionMode={permissionMode}
                  startActiveSkillIds={startActiveSkillIds}
                  onAdvancedSettings={() => setShowStartModal(true)}
                />

                {scrollManager.hasNewMessages && !scrollManager.shouldAutoScroll && (
                  <button
                    onClick={scrollManager.scrollToBottom}
                    className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:bg-accent-hover hover:scale-105 animate-bounce-subtle"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                    <span>{t("chat.newMessages", "新消息")}</span>
                  </button>
                )}
              </div>

              {activeSession && (
                <WorkPanel
                  collapsed={fileExplorerCollapsed}
                  overlay={layout.autoCollapseFileExplorer}
                  onCollapsedChange={setFileExplorerCollapsed}
                  width={layout.fileExplorerWidth}
                />
              )}
            </div>
          </ErrorBoundary>
        )}

        {currentRoute === '/usage' && (
          <ErrorBoundary
            onError={(error) => reportError(error, 'UsagePage')}
            showDetails={import.meta.env.DEV}
          >
            <AuthGuard mode="optional" feature="usage-history">
              <Suspense fallback={<div className="flex-1" />}>
                <UsagePage onOpenRechargeModal={handleRechargeClick} />
              </Suspense>
            </AuthGuard>
          </ErrorBoundary>
        )}
        {currentRoute === '/pricing' && (
          <ErrorBoundary
            onError={(error) => reportError(error, 'PricingPage')}
            showDetails={import.meta.env.DEV}
          >
            <AuthGuard mode="optional" feature="pricing">
              <Suspense fallback={<div className="flex-1" />}>
                <PricingPage />
              </Suspense>
            </AuthGuard>
          </ErrorBoundary>
        )}
        {currentRoute === '/skills' && (
          <ErrorBoundary
            onError={(error) => reportError(error, 'SkillMarket')}
            showDetails={import.meta.env.DEV}
          >
            <AuthGuard mode="optional" feature="skill-market">
              <Suspense fallback={<div className="flex-1" />}>
                <SkillMarket />
              </Suspense>
            </AuthGuard>
          </ErrorBoundary>
        )}
        {currentRoute === '/settings' && (
          <ErrorBoundary
            onError={(error) => reportError(error, 'SettingsPage')}
            showDetails={import.meta.env.DEV}
          >
            <AuthGuard mode="optional" feature="settings">
              <Suspense fallback={<div className="flex-1" />}>
                <SettingsPage
                  onClose={() => navigate('/chat')}
                  onNavigateToRecharge={() => sessionEvents.setShowRechargeModal(true)}
                />
              </Suspense>
            </AuthGuard>
          </ErrorBoundary>
        )}
        {currentRoute === '/referral' && (
          <ErrorBoundary
            onError={(error) => reportError(error, 'ReferralPage')}
            showDetails={import.meta.env.DEV}
          >
            <AuthGuard mode="optional" feature="referral">
              <Suspense fallback={<div className="flex-1" />}>
                <ReferralPage />
              </Suspense>
            </AuthGuard>
          </ErrorBoundary>
        )}
        {currentRoute === '/debug' && import.meta.env.DEV && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted">加载诊断面板…</div>}>
            <StreamingTestPage />
          </Suspense>
        )}
      </main>

      <GlobalDialogs
        showStartModal={showStartModal}
        showSettingsModal={showSettingsModal}
        settingsInitialTab={settingsInitialTab}
        showLoginModal={sessionEvents.showLoginModal}
        showRechargeModal={sessionEvents.showRechargeModal}
        globalError={globalError}
        cwd={cwd}
        permissionMode={permissionMode}
        startSkillMode={startSkillMode}
        startActiveSkillIds={startActiveSkillIds}
        pendingStart={pendingStart}
        pendingPermissionQueue={pendingPermissionQueue}
        onCloseStartModal={() => setShowStartModal(false)}
        onCloseSettingsModal={() => setShowSettingsModal(false)}
        onCloseLoginModal={() => sessionEvents.setShowLoginModal(false)}
        onOpenLoginModal={() => sessionEvents.setShowLoginModal(true)}
        onCloseRechargeModal={() => sessionEvents.setShowRechargeModal(false)}
        onOpenRechargeModal={handleRechargeClick}
        onClearGlobalError={() => setGlobalError(null)}
        onCwdChange={setCwd}
        onPermissionModeChange={setPermissionMode}
        onSkillModeChange={setStartSkillMode}
        onActiveSkillIdsChange={setStartActiveSkillIds}
        onStartFromModal={handleStartFromModal}
        onLoginSuccess={handleLoginSuccess}
        onRechargeSuccess={handleRechargeSuccess}
        onPermissionResult={handlePermissionResultForSession}
      />

      <ShortcutsHelp
        open={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        shortcuts={shortcuts}
      />

      <Suspense fallback={null}>
        <Onboarding />
      </Suspense>

      <CheckInModal
        open={showCheckInModal}
        onOpenChange={setShowCheckInModal}
      />

      <AuthStatusIndicator />

      <ToastHost />
    </div>
    </TooltipProvider>
  );
}

export default App;
