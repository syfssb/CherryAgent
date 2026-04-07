import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { SearchBar } from "./search/SearchBar";
import { useTranslation } from "react-i18next";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { useAppStore } from "../store/useAppStore";
import { useSessionStore } from "../store/useSessionStore";
import { type SessionSummary, shallowEqualSessionSummaries } from "../store/session-summary";
import { TagBadges, TagSelector } from "./sessions/TagSelector";
import { TagManager } from "./sessions/TagManager";
import { type Route } from "../hooks/useRouter";
import { useAuthStore } from "../store/useAuthStore";
import { isMac } from "../utils/platform";
import { activateSelectedSession } from "../lib/session-selection";
import { groupSessionsByWorkspace } from "../lib/sidebar-workspace-groups";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Pin,
  PinOff,
  Archive,
  ArchiveX,
  Trash2,
  Layers,
  Users,
  CalendarCheck,
  Keyboard,
  SquarePen,
  LayoutGrid,
  Folder,
  FolderOpen,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/ui/lib/utils";
import { formatRelativeTime as formatRelativeTimeByLocale } from "@/ui/lib/time";
import { getLocaleFromLanguage } from "@/ui/i18n/config";

interface SidebarProps {
  connected: boolean;
  currentRoute: Route;
  onNavigate: (route: Route) => void;
  onNewSession: (cwd?: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onSelectSession?: (sessionId: string) => boolean | void;
  width?: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onShortcutsClick?: () => void;
  onCheckInClick?: () => void;
}

/**
 * 会话标题编辑组件
 */
function SessionTitleEditor({
  initialTitle,
  isGenerating,
  onSave,
  onCancel,
  placeholder,
}: {
  initialTitle: string;
  isGenerating: boolean;
  onSave: (title: string) => void;
  onCancel: () => void;
  placeholder: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (title.trim()) {
        onSave(title.trim());
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    if (title.trim() && title.trim() !== initialTitle) {
      onSave(title.trim());
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-transparent text-[12px] font-medium text-ink-800 outline-none border-b border-accent focus:border-accent-hover dark:text-ink-800"
      placeholder={placeholder}
      disabled={isGenerating}
    />
  );
}

function UnreadCompletionDot({ title }: { title: string }) {
  return (
    <span
      className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[#60A5FA] shadow-[0_0_0_2px_rgba(96,165,250,0.14)]"
      title={title}
      aria-label={title}
    />
  );
}

export function Sidebar({
  currentRoute,
  onNavigate,
  onNewSession,
  onDeleteSession,
  onSelectSession,
  width = 280,
  collapsed = false,
  onToggleCollapsed,
  onShortcutsClick,
  onCheckInClick
}: SidebarProps) {
  type ElectronWindowBridge = {
    isFullscreen: () => Promise<boolean>;
    onFullscreen: (callback: (value: boolean) => void) => () => void;
  };

  const { t, i18n } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // 只订阅 Sidebar 需要的摘要字段，避免 messages 流式更新触发重渲染
  const sessionSummariesRef = useRef<Record<string, SessionSummary>>({});
  const sessionSummaries = useAppStore((state) => {
    const result: Record<string, SessionSummary> = {};
    for (const [id, s] of Object.entries(state.sessions)) {
      result[id] = {
        id: s.id,
        title: s.title,
        status: s.status,
        cwd: s.cwd,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        isPinned: s.isPinned,
        isArchived: s.isArchived,
        tags: s.tags,
        hasUnreadCompletion: s.hasUnreadCompletion,
      };
    }
    // 手动 equality：如果摘要没变则返回旧引用，避免 React 重渲染
    if (shallowEqualSessionSummaries(sessionSummariesRef.current, result)) {
      return sessionSummariesRef.current;
    }
    sessionSummariesRef.current = result;
    return result;
  });
  const titleStates = useAppStore((state) => state.titleStates);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Session store 状态
  const selectedTagId = useSessionStore((s) => s.selectedTagId);
  const fetchTags = useSessionStore((s) => s.fetchTags);
  const togglePinned = useSessionStore((s) => s.togglePinned);
  const toggleArchived = useSessionStore((s) => s.toggleArchived);

  const [isFullscreen, setIsFullscreen] = useState(false);
  // 文件夹折叠 / 展开更多状态
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const MAX_PER_FOLDER = 10;
  // 文件夹自定义名称（概念重命名，不改文件系统）
  const [folderCustomNames, setFolderCustomNames] = useState<Record<string, string>>({});
  // 正在重命名的文件夹
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const relativeTimeLocale = useMemo(() => getLocaleFromLanguage(i18n.language), [i18n.language]);
  const formatSessionRelativeTime = useCallback(
    (timestamp?: number) => (timestamp ? formatRelativeTimeByLocale(timestamp, relativeTimeLocale) : ""),
    [relativeTimeLocale],
  );

  const toggleFolderCollapsed = useCallback((folderName: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderName)) next.delete(folderName); else next.add(folderName);
      return next;
    });
  }, []);

  const toggleFolderExpanded = useCallback((folderName: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderName)) next.delete(folderName); else next.add(folderName);
      return next;
    });
  }, []);

  const handleDeleteAllInFolder = useCallback((sessions: { id: string }[]) => {
    for (const s of sessions) onDeleteSession(s.id);
  }, [onDeleteSession]);

  const commitRename = useCallback((folderName: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) setFolderCustomNames(prev => ({ ...prev, [folderName]: trimmed }));
    setRenamingFolder(null);
  }, []);

  useEffect(() => {
    const electronWindow = (
      window as Window & { electron?: ElectronAPI & { window?: ElectronWindowBridge } }
    ).electron?.window;
    if (!electronWindow) return;
    electronWindow.isFullscreen().then((v: boolean) => setIsFullscreen(v));
    const unsubscribe = electronWindow.onFullscreen((v: boolean) => setIsFullscreen(v));
    return unsubscribe;
  }, []);

  // 标签管理弹窗
  const [showTagManager, setShowTagManager] = useState(false);
  // 搜索弹窗
  const [searchOpen, setSearchOpen] = useState(false);

  // 初始化时加载标签
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // 会话列表
  const sessionList = useMemo(() => {
    let list = Object.values(sessionSummaries);
    if (selectedTagId) {
      list = list.filter((session) =>
        session.tags?.some((tag) => tag.id === selectedTagId)
      );
    }
    list.sort((a, b) => {
      const aPinned = a.isPinned ?? false;
      const bPinned = b.isPinned ?? false;
      if (aPinned !== bPinned) return bPinned ? 1 : -1;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
    return list;
  }, [sessionSummaries, selectedTagId]);

  // 分组：置顶 / 普通（按 cwd 分组） / 已归档
  const { pinnedSessions, unpinnedSessions, archivedSessions } = useMemo(() => {
    const pinned: typeof sessionList = [];
    const unpinned: typeof sessionList = [];
    const archived: typeof sessionList = [];
    for (const session of sessionList) {
      if (session.isArchived) archived.push(session);
      else if (session.isPinned) pinned.push(session);
      else unpinned.push(session);
    }
    return { pinnedSessions: pinned, unpinnedSessions: unpinned, archivedSessions: archived };
  }, [sessionList]);

  // 按工作区路径分组，显示名仍使用最后一级目录
  const cwdGroups = useMemo(() => groupSessionsByWorkspace(unpinnedSessions), [unpinnedSessions]);

  // 处理标题保存
  const handleTitleSave = useCallback(async (sessionId: string, newTitle: string) => {
    setEditingSessionId(null);
    try {
      await window.electron.session.updateTitle(sessionId, newTitle);
    } catch (error) {
      console.error("[Sidebar] Failed to update title:", error);
    }
  }, []);

  const handleTitleCancel = useCallback(() => {
    setEditingSessionId(null);
  }, []);

  const handleRegenerateTitle = useCallback(async (sessionId: string) => {
    try {
      await window.electron.session.generateTitle(sessionId);
    } catch (error) {
      console.error("[Sidebar] Failed to regenerate title:", error);
    }
  }, []);

  const getTitleDisplay = useCallback((sessionId: string, title: string) => {
    const titleState = titleStates[sessionId];
    if (titleState?.isGenerating) {
      return (
        <span className="flex items-center gap-1">
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-muted">
            {t("sidebar.generatingTitle", "生成中...")}
          </span>
        </span>
      );
    }
    return title || t("sidebar.newSession", "新建会话");
  }, [t, titleStates]);

  const handleTogglePinned = useCallback(async (sessionId: string) => {
    await togglePinned(sessionId);
  }, [togglePinned]);

  const handleToggleArchived = useCallback(async (sessionId: string) => {
    await toggleArchived(sessionId);
  }, [toggleArchived]);

  const getSessionExtras = useCallback((sessionId: string) => {
    const session = sessionSummaries[sessionId];
    return {
      isPinned: session?.isPinned ?? false,
      isArchived: session?.isArchived ?? false,
      tags: session?.tags ?? []
    };
  }, [sessionSummaries]);

  const handleSessionSelection = useCallback((sessionId: string) => {
    activateSelectedSession(sessionId, onSelectSession, setActiveSessionId);
  }, [onSelectSession, setActiveSessionId]);

  /** 会话行右键菜单（公用） */
  const renderSessionMenu = useCallback((session: typeof sessionList[number], isPinned: boolean, isArchived: boolean) => (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="rounded-md p-1 text-ink-400 hover:bg-[#1414130a] hover:text-ink-600 dark:hover:bg-[#faf9f50a]"
          aria-label={t("sidebar.openSessionMenu", "打开会话菜单")}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[220px] rounded-xl border border-[#1414131a] bg-white p-1 shadow-lg dark:bg-[#2b2a27] dark:border-[#faf9f51a]"
          align="center"
          sideOffset={8}
        >
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#141413] dark:text-[#faf9f5] outline-none hover:bg-[#f0eee6] dark:hover:bg-[#3d3d3a]"
            onSelect={() => setEditingSessionId(session.id)}
          >
            <Pencil className="h-4 w-4 text-ink-500" />
            {t("sidebar.renameSession", "重命名")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#141413] dark:text-[#faf9f5] outline-none hover:bg-[#f0eee6] dark:hover:bg-[#3d3d3a]"
            onSelect={() => handleRegenerateTitle(session.id)}
          >
            <RefreshCw className="h-4 w-4 text-ink-500" />
            {t("sidebar.regenerateTitle", "重新生成标题")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[#1414130a] dark:bg-[#faf9f50a]" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#141413] dark:text-[#faf9f5] outline-none hover:bg-[#f0eee6] dark:hover:bg-[#3d3d3a]"
            onSelect={() => handleTogglePinned(session.id)}
          >
            {isPinned ? <PinOff className="h-4 w-4 text-ink-500" /> : <Pin className="h-4 w-4 text-ink-500" />}
            {isPinned ? t("sidebar.unpin", "取消置顶") : t("sidebar.pin", "置顶")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#141413] dark:text-[#faf9f5] outline-none hover:bg-[#f0eee6] dark:hover:bg-[#3d3d3a]"
            onSelect={() => handleToggleArchived(session.id)}
          >
            {isArchived ? <ArchiveX className="h-4 w-4 text-ink-500" /> : <Archive className="h-4 w-4 text-ink-500" />}
            {isArchived ? t("sidebar.unarchive", "取消归档") : t("sidebar.archive", "归档")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[#1414130a] dark:bg-[#faf9f50a]" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#141413] dark:text-[#faf9f5] outline-none hover:bg-[#f0eee6] dark:hover:bg-[#3d3d3a]"
            onSelect={() => onDeleteSession(session.id)}
          >
            <Trash2 className="h-4 w-4 text-error/80" />
            {t("sidebar.deleteSession", "删除此会话")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  ), [t, handleRegenerateTitle, handleTogglePinned, handleToggleArchived, onDeleteSession]);

  /** 置顶会话行 */
  const renderPinnedSession = useCallback((session: typeof sessionList[number]) => {
    const isActive = activeSessionId === session.id;
    const { tags: sessionTags } = getSessionExtras(session.id);
    const isGeneratingTitle = titleStates[session.id]?.isGenerating ?? false;
    const showUnreadCompletion = Boolean(session.hasUnreadCompletion) && !isActive;

    return (
      <div
        key={session.id}
        className={`group relative cursor-pointer px-2 transition-colors ${
          isActive ? "bg-[#1414130d] dark:bg-[#faf9f50d]" : "hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]"
        }`}
        onClick={() => handleSessionSelection(session.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSessionSelection(session.id);
          }
        }}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-full bg-[#ae5630]" />
        )}
        {session.status === "running" && !isActive && (
          <div className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-full bg-[#ae5630]/40 animate-pulse" />
        )}
        <div className="flex items-center gap-2 px-1 py-2">
          <Pin className="h-3 w-3 shrink-0 text-[#b0aea5] rotate-45" />
          <svg className={cn("shrink-0 text-[#ae5630] transition-all duration-150", session.status === "running" ? "h-3 w-3 animate-spin" : "h-3 w-0 overflow-hidden")} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[12.5px] font-medium text-[#141413] dark:text-[#faf9f5] leading-snug">
              {editingSessionId === session.id ? (
                <SessionTitleEditor
                  initialTitle={session.title}
                  isGenerating={isGeneratingTitle}
                  onSave={(title) => handleTitleSave(session.id, title)}
                  onCancel={handleTitleCancel}
                  placeholder={t("sidebar.sessionTitlePlaceholder", "输入会话标题...")}
                />
              ) : (
                getTitleDisplay(session.id, session.title)
              )}
            </span>
            {sessionTags.length > 0 && (
              <div className="mt-0.5">
                <TagBadges tags={sessionTags} />
              </div>
            )}
          </div>
          {/* 相对时间（hover 时淡出为操作按钮让位） */}
          <span className="flex shrink-0 items-center gap-1.5 group-hover:opacity-0 transition-opacity">
            {showUnreadCompletion && (
              <UnreadCompletionDot title={t("sidebar.unreadCompleted", "任务已完成，尚未查看")} />
            )}
            <span className="text-[11px] text-[#b0aea5] tabular-nums">
              {formatSessionRelativeTime(session.updatedAt)}
            </span>
          </span>
          {/* hover 操作（绝对定位覆盖时间位置） */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <TagSelector
              sessionId={session.id}
              sessionTags={sessionTags}
              compact
              triggerClassName="rounded-md p-1 text-ink-400 hover:bg-[#1414130a] hover:text-ink-600"
            />
            {renderSessionMenu(session, true, false)}
          </div>
        </div>
      </div>
    );
  }, [
    activeSessionId, editingSessionId, getSessionExtras, getTitleDisplay,
    handleTitleSave, handleTitleCancel, handleSessionSelection,
    formatSessionRelativeTime, renderSessionMenu, t, titleStates
  ]);

  /** CWD 分组会话行 */
  const renderGroupedSession = useCallback((session: typeof sessionList[number]) => {
    const isActive = activeSessionId === session.id;
    const { isPinned, isArchived, tags: sessionTags } = getSessionExtras(session.id);
    const isGeneratingTitle = titleStates[session.id]?.isGenerating ?? false;
    const showUnreadCompletion = Boolean(session.hasUnreadCompletion) && !isActive;

    return (
      <div
        key={session.id}
        className={`group relative cursor-pointer transition-colors ${
          isActive ? "bg-[#1414130d] dark:bg-[#faf9f50d]" : "hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]"
        }`}
        onClick={() => handleSessionSelection(session.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSessionSelection(session.id);
          }
        }}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-full bg-[#ae5630]" />
        )}
        {session.status === "running" && !isActive && (
          <div className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-full bg-[#ae5630]/40 animate-pulse" />
        )}
        {/* 缩进行 */}
        <div className="flex items-center gap-2 pl-6 pr-2 py-2">
          <svg className={cn("shrink-0 text-[#ae5630] transition-all duration-150", session.status === "running" ? "h-3 w-3 animate-spin" : "h-3 w-0 overflow-hidden")} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[12.5px] font-medium text-[#141413] dark:text-[#faf9f5] leading-snug">
              {editingSessionId === session.id ? (
                <SessionTitleEditor
                  initialTitle={session.title}
                  isGenerating={isGeneratingTitle}
                  onSave={(title) => handleTitleSave(session.id, title)}
                  onCancel={handleTitleCancel}
                  placeholder={t("sidebar.sessionTitlePlaceholder", "输入会话标题...")}
                />
              ) : (
                getTitleDisplay(session.id, session.title)
              )}
            </span>
            {sessionTags.length > 0 && (
              <div className="mt-0.5">
                <TagBadges tags={sessionTags} />
              </div>
            )}
          </div>
          {/* 相对时间（常显，hover 后隐藏让出操作空间） */}
          <span className="flex shrink-0 items-center gap-1.5 group-hover:opacity-0 transition-opacity">
            {showUnreadCompletion && (
              <UnreadCompletionDot title={t("sidebar.unreadCompleted", "任务已完成，尚未查看")} />
            )}
            <span className="text-[11px] text-[#b0aea5] tabular-nums">
              {formatSessionRelativeTime(session.updatedAt)}
            </span>
          </span>
          {/* hover 操作 */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <TagSelector
              sessionId={session.id}
              sessionTags={sessionTags}
              compact
              triggerClassName="rounded-md p-1 text-ink-400 hover:bg-[#1414130a] hover:text-ink-600"
            />
            {renderSessionMenu(session, isPinned, isArchived)}
          </div>
        </div>
      </div>
    );
  }, [
    activeSessionId, editingSessionId, getSessionExtras, getTitleDisplay,
    handleTitleSave, handleTitleCancel, handleSessionSelection,
    formatSessionRelativeTime, renderSessionMenu, t, titleStates
  ]);

  // ─────────────────── 折叠模式 ───────────────────
  if (collapsed) {
    return (
      <aside
        data-tour="sidebar"
        className="fixed inset-y-0 left-0 flex h-full flex-col gap-3 border-r border-[#1414130d] bg-surface-cream px-2 pb-4 pt-12 dark:bg-[#1a1918] dark:border-[#faf9f50d]"
        style={{ width }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-12"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />

        <div className="flex flex-col gap-2">
          <button
            className="flex items-center justify-center rounded-xl border border-[#1414131a] bg-surface px-2 py-2 text-ink-700 hover:bg-[#f0eee6] hover:border-[#14141333] transition-colors dark:border-[#faf9f51a] dark:hover:bg-[#3d3d3a] icon-hover-slide-right"
            onClick={onToggleCollapsed}
            aria-label={t("tooltip.expandSidebar", "展开侧边栏")}
            title={t("tooltip.expandSidebar", "展开侧边栏")}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button
            data-tour="new-task"
            className="flex items-center justify-center rounded-xl border border-[#1414131a] bg-surface px-2 py-2 text-ink-700 hover:bg-[#f0eee6] hover:border-[#14141333] transition-colors dark:border-[#faf9f51a] dark:hover:bg-[#3d3d3a] icon-hover-pop"
            onClick={() => onNewSession()}
            aria-label={t("sidebar.newTask", "新建任务")}
            title={`${t("sidebar.newTask", "新建任务")} (${isMac() ? "\u2318N" : "Ctrl+N"})`}
          >
            <SquarePen className="h-4 w-4" />
          </button>
          <button
            className={`flex items-center justify-center rounded-xl px-2 py-2 transition-colors w-full ${
              currentRoute === '/skills'
                ? 'bg-[#1414130d] text-ink-700'
                : 'border border-[#1414131a] bg-surface text-ink-700 hover:bg-[#f0eee6] hover:border-[#14141333] dark:border-[#faf9f51a] dark:hover:bg-[#3d3d3a]'
            }`}
            onClick={() => onNavigate('/skills')}
            aria-label={t("nav.skills", "技能")}
            title={t("nav.skills", "技能")}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>

        {/* 底部导航图标（折叠模式） */}
        <div className="mt-auto flex flex-col gap-1.5">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`flex items-center justify-center rounded-xl px-2 py-2 transition-colors w-full icon-hover-bounce ${
                    currentRoute === '/pricing'
                      ? 'bg-[#1414130d] text-ink-700'
                      : 'border border-[#1414131a] bg-surface text-ink-700 hover:bg-[#f0eee6] hover:border-[#14141333] dark:border-[#faf9f51a] dark:hover:bg-[#3d3d3a]'
                  }`}
                  onClick={() => onNavigate('/pricing')}
                  aria-label={t("nav.pricing", "模型价格")}
                >
                  <Layers className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {t("nav.pricing", "模型价格")}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`flex items-center justify-center rounded-xl px-2 py-2 transition-colors w-full icon-hover-pop ${
                    currentRoute === '/referral'
                      ? 'bg-[#1414130d] text-ink-700'
                      : 'border border-[#1414131a] bg-surface text-ink-700 hover:bg-[#f0eee6] hover:border-[#14141333] dark:border-[#faf9f51a] dark:hover:bg-[#3d3d3a]'
                  }`}
                  onClick={() => onNavigate('/referral')}
                  aria-label={t("nav.referral", "推荐有奖")}
                >
                  <Users className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {t("nav.referral", "推荐有奖")}
              </TooltipContent>
            </Tooltip>

            {useAuthStore.getState().isAuthenticated && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center justify-center rounded-xl border border-[#1414131a] bg-surface px-2 py-2 text-ink-700 hover:bg-[#f0eee6] hover:border-[#14141333] transition-colors dark:border-[#faf9f51a] dark:hover:bg-[#3d3d3a] w-full icon-hover-wiggle"
                    onClick={onCheckInClick}
                    aria-label={t("nav.checkin", "每日签到")}
                  >
                    <CalendarCheck className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {t("nav.checkin", "每日签到")}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="flex items-center justify-center rounded-xl border border-[#1414131a] bg-surface px-2 py-2 text-ink-700 hover:bg-[#f0eee6] hover:border-[#14141333] transition-colors dark:border-[#faf9f51a] dark:hover:bg-[#3d3d3a] w-full icon-hover-wiggle"
                  onClick={onShortcutsClick}
                  aria-label={t("sidebar.shortcuts", "快捷键")}
                >
                  <Keyboard className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {t("sidebar.shortcuts", "快捷键")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </aside>
    );
  }

  // ─────────────────── 展开模式 ───────────────────
  return (
    <aside
      data-tour="sidebar"
      className="fixed inset-y-0 left-0 flex h-full flex-col border-r border-[#1414130d] bg-surface-cream pt-12 dark:bg-[#1a1918] dark:border-[#faf9f50d]"
      style={{ width }}
    >
      {/* 拖拽区 + 折叠按钮（紧跟 traffic lights 之后） */}
      <div
        className="absolute top-0 left-0 right-0 h-12 flex items-center px-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <button
          className="rounded-lg p-1.5 text-[#87867f] hover:bg-[#1414130a] hover:text-[#141413] transition-colors dark:hover:bg-[#faf9f50a] dark:hover:text-[#faf9f5]"
          style={{ WebkitAppRegion: 'no-drag', marginLeft: isFullscreen ? '8px' : (isMac() ? '80px' : '8px') } as React.CSSProperties}
          onClick={onToggleCollapsed}
          aria-label={t("sidebar.collapseSidebar", "收起侧边栏")}
          title={t("sidebar.collapseSidebar", "收起侧边栏")}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* ── 主导航 ── */}
      <nav className="flex flex-col px-2 pb-1">
        {/* 新任务 */}
        <button
          data-tour="new-task"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-[9px] text-[13px] text-[#87867f] hover:bg-[#1414130a] hover:text-[#141413] dark:text-[#9a9893] dark:hover:bg-[#faf9f50a] dark:hover:text-[#faf9f5] transition-colors duration-150"
          onClick={() => onNewSession()}
          title={`${t("sidebar.newTask", "新建任务")} (${isMac() ? "\u2318N" : "Ctrl+N"})`}
        >
          <SquarePen className="h-4 w-4 shrink-0" />
          <span>{t("sidebar.newThread", "新任务")}</span>
        </button>
        {/* 技能 */}
        <button
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-[9px] text-[13px] transition-colors duration-150 ${
            currentRoute === '/skills'
              ? 'bg-[#1414130d] text-[#141413] dark:bg-[#faf9f50d] dark:text-[#faf9f5]'
              : 'text-[#87867f] hover:bg-[#1414130a] hover:text-[#141413] dark:text-[#9a9893] dark:hover:bg-[#faf9f50a] dark:hover:text-[#faf9f5]'
          }`}
          onClick={() => onNavigate('/skills')}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          <span>{t("nav.skills", "技能")}</span>
        </button>
      </nav>

      {/* 分隔线 */}
      <div className="mx-3 h-px bg-[#1414130d] dark:bg-[#faf9f50d]" />

      {/* ── 滚动区 ── */}
      <div className="sidebar-session-list flex flex-col overflow-y-auto flex-1 min-h-0 pb-2">

        {/* 空状态 */}
        {(!isAuthenticated || sessionList.length === 0) && (
          <div className="px-3 py-6 text-center animate-fade-in">
            <p className="text-[12px] text-ink-400">
              {selectedTagId
                ? t("sidebar.noMatchingSessions", "未找到匹配的会话")
                : t("sidebar.noSessions", "点击「新任务」开始")}
            </p>
          </div>
        )}

        {/* 置顶会话区（无 header，直接展示） */}
        {isAuthenticated && pinnedSessions.length > 0 && (
          <div className="pt-2">
            {pinnedSessions.map(renderPinnedSession)}
          </div>
        )}

        {/* 任务区 header */}
        {isAuthenticated && (unpinnedSessions.length > 0 || archivedSessions.length > 0) && (
          <>
            {pinnedSessions.length > 0 && (
              <div className="mx-3 my-2 h-px bg-[#1414130d] dark:bg-[#faf9f50d]" />
            )}
            <div className="flex items-center justify-between px-3 pt-1 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#87867f]">
                {t("sidebar.threads", "任务")}
              </span>
              <div className="flex items-center gap-0.5">
                {/* 搜索 / 筛选 */}
                <button
                  className={`rounded-md p-1 transition-colors ${
                    selectedTagId
                      ? 'text-[#ae5630] hover:bg-[#ae563010] dark:text-[#d97757]'
                      : 'text-[#b0aea5] hover:bg-[#1414130a] hover:text-[#141413] dark:hover:bg-[#faf9f50a] dark:hover:text-[#faf9f5]'
                  }`}
                  onClick={() => setSearchOpen(true)}
                  aria-label={t("sidebar.search", "搜索")}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}

        {/* CWD 分组会话列表 */}
        {isAuthenticated && cwdGroups.map((group) => {
          const groupKey = group.key;
          const groupSessions = group.sessions;
          const isCollapsed = collapsedFolders.has(groupKey);
          const isExpanded = expandedFolders.has(groupKey);
          const visibleSessions = isCollapsed
            ? []
            : isExpanded
            ? groupSessions
            : groupSessions.slice(0, MAX_PER_FOLDER);
          const hiddenCount = groupSessions.length - MAX_PER_FOLDER;
          const displayName = folderCustomNames[groupKey] || group.displayName;
          const isRenaming = renamingFolder === groupKey;
          const folderCwd = group.cwd ?? groupSessions[0]?.cwd ?? '';

          return (
            <div key={groupKey} className="group/folder">
              {/* 文件夹 header */}
              <div className="relative flex items-center gap-1 px-2 py-1 mt-1 hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]">
                {/* 左侧：chevron + 名称（点击折叠/展开） */}
                <button
                  className="flex flex-1 items-center gap-1.5 min-w-0 text-left py-0.5"
                  onClick={() => !isRenaming && toggleFolderCollapsed(groupKey)}
                >
                  {/* 默认显示文件夹图标，hover 时换为方向箭头 */}
                  <span className="relative h-4 w-4 shrink-0">
                    {/* 文件夹图标：默认可见，hover 时隐藏 */}
                    <span className="absolute inset-0 flex items-center justify-center group-hover/folder:hidden">
                      {isCollapsed
                        ? <Folder className="h-4 w-4 text-[#b0aea5]" />
                        : <FolderOpen className="h-4 w-4 text-[#b0aea5]" />
                      }
                    </span>
                    {/* 方向箭头：hover 时显示 */}
                    <span className="absolute inset-0 hidden items-center justify-center group-hover/folder:flex">
                      {isCollapsed
                        ? <ChevronRight className="h-3.5 w-3.5 text-[#87867f]" />
                        : <ChevronDown className="h-3.5 w-3.5 text-[#87867f]" />
                      }
                    </span>
                  </span>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(groupKey, renameInput);
                        if (e.key === 'Escape') setRenamingFolder(null);
                      }}
                      onBlur={() => commitRename(groupKey, renameInput)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-transparent text-[13px] font-medium text-[#87867f] outline-none border-b border-[#ae5630] min-w-0"
                    />
                  ) : (
                    <span className="truncate text-[13px] font-medium text-[#87867f]">
                      {displayName}
                    </span>
                  )}
                </button>

                {/* 右侧：hover 显示操作按钮 */}
                {!isRenaming && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/folder:opacity-100 transition-opacity shrink-0">
                    {/* ··· 菜单 */}
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          className="rounded-md p-1 text-[#b0aea5] hover:bg-[#14141314] hover:text-[#87867f] dark:hover:bg-[#faf9f514] transition-colors"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t("sidebar.moreActions", "更多操作")}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          side="right"
                          align="start"
                          sideOffset={4}
                          className="z-50 min-w-[140px] rounded-xl border border-[#1414130d] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:border-[#faf9f50d] dark:bg-[#2b2a27]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu.Item
                            className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[13px] text-[#141413] outline-none hover:bg-[#f0eee6] dark:text-[#faf9f5] dark:hover:bg-[#3d3d3a]"
                            onSelect={() => {
                              setRenameInput(displayName);
                              setRenamingFolder(groupKey);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-[#87867f]" />
                            {t("sidebar.renameWorkspace", "重命名工作区")}
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator className="my-1 h-px bg-[#1414130d] dark:bg-[#faf9f50d]" />
                          <DropdownMenu.Item
                            className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[13px] text-[#DC2626] outline-none hover:bg-[#FEE2E2] dark:text-[#f87171] dark:hover:bg-[#DC262620]"
                            onSelect={() => handleDeleteAllInFolder(groupSessions)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("sidebar.deleteAllInWorkspace", "删除所有对话")}
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>

                    {/* 在此工作区新建对话 */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="rounded-md p-1 text-[#b0aea5] hover:bg-[#14141314] hover:text-[#87867f] dark:hover:bg-[#faf9f514] transition-colors"
                          onClick={(e) => { e.stopPropagation(); onNewSession(folderCwd); }}
                          aria-label={t("sidebar.newTaskInWorkspace", "在 {{name}} 中开始新任务", { name: displayName })}
                        >
                          <SquarePen className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6} className="bg-[#0d0d0c] text-white">
                        {t("sidebar.newTaskInWorkspace", "在 {{name}} 中开始新任务", { name: displayName })}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>

              {/* 该文件夹下的会话 */}
              {visibleSessions.map(renderGroupedSession)}
              {/* 展开显示更多 */}
              {!isCollapsed && !isExpanded && hiddenCount > 0 && (
                <button
                  className="flex w-full items-center gap-1 px-6 py-1 text-[11px] text-[#b0aea5] hover:text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a] transition-colors rounded-md"
                  onClick={() => toggleFolderExpanded(groupKey)}
                >
                  <ChevronDown className="h-3 w-3 shrink-0" />
                  {t("sidebar.folderShowMore", "展开显示 {{count}} 条", { count: hiddenCount })}
                </button>
              )}
              {/* 收起多余项 */}
              {!isCollapsed && isExpanded && hiddenCount > 0 && (
                <button
                  className="flex w-full items-center gap-1 px-6 py-1 text-[11px] text-[#b0aea5] hover:text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a] transition-colors rounded-md"
                  onClick={() => toggleFolderExpanded(groupKey)}
                >
                  <ChevronUp className="h-3 w-3 shrink-0" />
                  {t("sidebar.folderShowLess", "收起")}
                </button>
              )}
            </div>
          );
        })}

        {/* 已归档区域 */}
        {isAuthenticated && archivedSessions.length > 0 && (
          <>
            <div className="mt-3 flex items-center justify-between px-3 pb-1 pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#87867f]">
                {t("sidebar.archived", "已归档")}
              </span>
              <button
                className="rounded px-1.5 py-0.5 text-[10px] font-medium normal-case text-[#87867f] hover:bg-[#1414130a]"
                onClick={() => setShowArchived((prev) => !prev)}
              >
                {showArchived ? t("common.collapse", "收起") : t("common.expand", "展开")}
              </button>
            </div>
            {showArchived && archivedSessions.map((session) => renderGroupedSession(session))}
          </>
        )}
      </div>

      {/* ── 底部胶囊导航 ── */}
      <div className="shrink-0 border-t border-[#1414130d] dark:border-[#faf9f50d] px-2 py-2">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center rounded-full bg-[#1414130a] p-[3px] dark:bg-[#faf9f50a]" data-tour="bottom-nav">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`flex items-center justify-center rounded-full p-2 transition-all duration-200 icon-hover-bounce ${
                      currentRoute === '/pricing'
                        ? 'bg-white text-[#141413] shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-[#3d3d3a] dark:text-[#faf9f5]'
                        : 'text-[#87867f] hover:text-[#141413] dark:text-[#9a9893] dark:hover:text-[#faf9f5]'
                    }`}
                    onClick={() => onNavigate('/pricing')}
                    aria-label={t("nav.pricing", "模型价格")}
                  >
                    <Layers className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("nav.pricing", "模型价格")}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`flex items-center justify-center rounded-full p-2 transition-all duration-200 icon-hover-pop ${
                      currentRoute === '/referral'
                        ? 'bg-white text-[#141413] shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-[#3d3d3a] dark:text-[#faf9f5]'
                        : 'text-[#87867f] hover:text-[#141413] dark:text-[#9a9893] dark:hover:text-[#faf9f5]'
                    }`}
                    onClick={() => onNavigate('/referral')}
                    aria-label={t("nav.referral", "推荐有奖")}
                  >
                    <Users className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("nav.referral", "推荐有奖")}</TooltipContent>
              </Tooltip>

              {useAuthStore.getState().isAuthenticated && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="flex items-center justify-center rounded-full p-2 transition-all duration-200 text-[#87867f] hover:text-[#141413] dark:text-[#9a9893] dark:hover:text-[#faf9f5] icon-hover-wiggle"
                      onClick={onCheckInClick}
                      aria-label={t("nav.checkin", "每日签到")}
                    >
                      <CalendarCheck className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t("nav.checkin", "每日签到")}</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center justify-center rounded-full p-2 transition-all duration-200 text-[#87867f] hover:text-[#141413] dark:text-[#9a9893] dark:hover:text-[#faf9f5] icon-hover-wiggle"
                    onClick={onShortcutsClick}
                    aria-label={t("sidebar.shortcuts", "快捷键")}
                  >
                    <Keyboard className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("sidebar.shortcuts", "快捷键")}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      </div>

      {/* 搜索弹窗 */}
      <SearchBar
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectSession={onSelectSession}
      />

      {/* 标签管理弹窗 */}
      <TagManager open={showTagManager} onOpenChange={setShowTagManager} />
    </aside>
  );
}
