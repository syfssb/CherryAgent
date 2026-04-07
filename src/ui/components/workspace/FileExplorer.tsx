import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui";
import { toast } from "../../hooks/use-toast";

interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  children?: FileNode[];
  loaded?: boolean;
  expanded?: boolean;
}

interface FileExplorerProps {
  collapsed?: boolean;
  floating?: boolean;
  width?: number;
  onCollapsedChange?: (collapsed: boolean) => void;
  onFileSelect?: (path: string) => void;
}

/**
 * 文件浏览器组件
 * 显示当前工作目录的文件树
 */
/** 系统/临时文件黑名单（精确匹配文件名） */
const SYSTEM_FILES = new Set(["Thumbs.db", "desktop.ini", ".DS_Store"]);

/** 判断文件名是否属于隐藏/临时/系统文件 */
function isHiddenFile(name: string): boolean {
  if (name.startsWith(".")) return true;
  if (name.startsWith("~$")) return true;
  if (name.startsWith("~")) return true;
  if (SYSTEM_FILES.has(name)) return true;
  return false;
}

/** 递归过滤隐藏文件 */
function filterHiddenNodes(nodes: FileNode[]): FileNode[] {
  return nodes
    .filter((node) => !isHiddenFile(node.name))
    .map((node) =>
      node.type === "directory" && node.children
        ? { ...node, children: filterHiddenNodes(node.children) }
        : node,
    );
}

export function FileExplorer({
  collapsed = false,
  floating = false,
  width = 256,
  onCollapsedChange,
  onFileSelect,
}: FileExplorerProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileNode[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const session = activeSessionId ? sessions[activeSessionId] : null;
  const cwd = session?.cwd;

  // 加载目录内容
  const loadDirectory = useCallback(async (dirPath: string): Promise<FileNode[]> => {
    try {
      const response = await window.electron.workspace.listDir(dirPath, {
        ignorePatterns: ["node_modules", ".git", ".next", "dist", "build", ".cache"],
        limit: 100,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to list directory");
      }

      return response.data.items.map((item: FileNode) => ({
        ...item,
        loaded: item.type === "file",
        expanded: false,
      }));
    } catch (err) {
      console.error("Failed to load directory:", err);
      throw err;
    }
  }, []);

  const mergeNodes = useCallback((prev: FileNode[], next: FileNode[]): FileNode[] => {
    const prevMap = new Map(prev.map((node) => [node.path, node]));
    return next.map((node) => {
      const previous = prevMap.get(node.path);
      if (!previous) {
        return node;
      }
      if (node.type === "directory") {
        return {
          ...node,
          loaded: previous.loaded ?? false,
          expanded: previous.expanded ?? false,
          children: previous.children,
        };
      }
      return {
        ...node,
        loaded: true,
        expanded: false,
      };
    });
  }, []);

  const refreshRoot = useCallback(async () => {
    if (!cwd) return;
    try {
      const items = await loadDirectory(cwd);
      setFiles((prev) => mergeNodes(prev, items));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("workspace.loadFailed", "加载文件失败"));
    }
  }, [cwd, loadDirectory, mergeNodes, t]);

  const confirmAction = useCallback((message: string): boolean => {
    return window.confirm(message);
  }, []);

  const handleCopyEntry = useCallback(async (node: FileNode) => {
    const label = node.type === "directory"
      ? t("workspace.copyFolderConfirm", "确认复制该文件夹吗？")
      : t("workspace.copyFileConfirm", "确认复制该文件吗？");
    if (!confirmAction(label)) return;

    const result = await window.electron.workspace.copyEntry(node.path);
    if (result.success) {
      toast({
        title: t("workspace.copiedToClipboard", "已复制到工作区剪贴板"),
        description: node.name,
        variant: "success",
      });
      return;
    }

    toast({
      title: t("workspace.copyFailed", "复制失败"),
      description: result.error || t("workspace.copyFailedUnknown", "无法复制该文件"),
      variant: "error",
    });
  }, [confirmAction, t]);

  const handlePasteEntry = useCallback(async (targetDirPath?: string) => {
    const targetLabel = targetDirPath
      ? t("workspace.pasteToCurrentFolderConfirm", "确认粘贴到当前文件夹吗？")
      : t("workspace.pasteToWorkspaceConfirm", "确认粘贴到工作区根目录吗？");
    if (!confirmAction(targetLabel)) return;

    const result = await window.electron.workspace.pasteEntry(targetDirPath);
    if (result.success) {
      toast({
        title: t("workspace.pasteSuccess", "粘贴成功"),
        description: result.data?.name || result.data?.relativePath || "",
        variant: "success",
      });
      await refreshRoot();
      return;
    }

    toast({
      title: t("workspace.pasteFailed", "粘贴失败"),
      description: result.error || t("workspace.pasteFailedUnknown", "无法粘贴文件"),
      variant: "error",
    });
  }, [confirmAction, refreshRoot, t]);

  const handleDeleteEntry = useCallback(async (node: FileNode) => {
    const label = node.type === "directory"
      ? t("workspace.deleteFolderConfirm", "确认删除该文件夹及其内容吗？此操作不可恢复。")
      : t("workspace.deleteFileConfirm", "确认删除该文件吗？此操作不可恢复。");
    if (!confirmAction(label)) return;

    const result = await window.electron.workspace.deleteEntry(node.path);
    if (result.success) {
      toast({
        title: t("workspace.deleteSuccess", "删除成功"),
        description: node.name,
        variant: "success",
      });
      await refreshRoot();
      return;
    }

    toast({
      title: t("workspace.deleteFailed", "删除失败"),
      description: result.error || t("workspace.deleteFailedUnknown", "无法删除该文件"),
      variant: "error",
    });
  }, [confirmAction, refreshRoot, t]);

  /** 在系统文件管理器中打开文件夹 */
  const handleOpenInSystem = useCallback(async (node: FileNode) => {
    if (node.type !== "directory") return;
    const result = await window.electron.shell.openPath(node.path);
    if (!result.success) {
      toast({
        title: t("workspace.openFolderFailed", "打开文件夹失败"),
        description: result.error || t("workspace.openFolderFailedUnknown", "无法在电脑中打开该文件夹"),
        variant: "error",
      });
    }
  }, [t]);

  /** 在 Finder/Explorer 中定位并高亮文件 */
  const handleShowInSystem = useCallback(async (node: FileNode) => {
    if (node.type !== "file") return;
    const result = await window.electron.shell.showItemInFolder(node.path, cwd ?? "");
    if (!result.success) {
      toast({
        title: t("workspace.showInSystemFailed", "定位文件失败"),
        description: result.error || t("workspace.showInSystemFailedUnknown", "无法在电脑中定位该文件"),
        variant: "error",
      });
    }
  }, [t, cwd]);

  const visibleNodes = useMemo(() => {
    // 有搜索结果时直接使用搜索结果
    if (searchResults !== null) return searchResults;
    const baseNodes = showHidden ? files : filterHiddenNodes(files);
    return baseNodes;
  }, [files, searchResults, showHidden]);

  // 去抖递归搜索
  useEffect(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    searchTimerRef.current = window.setTimeout(async () => {
      searchTimerRef.current = null;
      try {
        const response = await window.electron.workspace.searchFiles(trimmed, {
          ignorePatterns: ["node_modules", ".git", ".next", "dist", "build", ".cache"],
          limit: 50,
        });
        if (response.success && response.data) {
          const items: FileNode[] = response.data.items.map((item: FileNode) => ({
            ...item,
            loaded: item.type === "file",
            expanded: false,
          }));
          setSearchResults(showHidden ? items : items.filter((n) => !isHiddenFile(n.name)));
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [searchQuery, showHidden]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      refreshRoot();
    }, 300);
  }, [refreshRoot]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  // 加载根目录
  useEffect(() => {
    if (!cwd) {
      setFiles([]);
      setError(null);
      return;
    }

    let cancelled = false;
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const watchResult = await window.electron.workspace.watch(cwd);
        if (!watchResult.success) {
          throw new Error(watchResult.error || t("workspace.watchFailed", "无法监听工作区"));
        }
        const items = await loadDirectory(cwd);
        if (cancelled) return;
        setFiles(items);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("workspace.loadFailed", "加载文件失败"));
        setLoading(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [cwd, loadDirectory, t]);

  useEffect(() => {
    if (!cwd) return;
    const unsubscribe = window.electron.workspace.onWorkspaceEvent((event) => {
      if (!event) return;
      if (event.type === "workspace:deleted") {
        setError(t("workspace.deleted", "工作区已删除"));
        setFiles([]);
        return;
      }
      if (event.type === "workspace:exists" || event.type === "workspace:changed") {
        scheduleRefresh();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [cwd, scheduleRefresh, t]);

  /** 不可变地通过文件路径定位并更新某个节点，沿途每一层都创建新引用 */
  const updateNodeByPath = useCallback(
    (nodes: FileNode[], targetPath: string, updater: (node: FileNode) => FileNode): FileNode[] => {
      return nodes.map((n) => {
        if (n.path === targetPath) return updater(n);
        if (n.type === "directory" && n.children && targetPath.startsWith(n.path + "/")) {
          return { ...n, children: updateNodeByPath(n.children, targetPath, updater) };
        }
        return n;
      });
    },
    [],
  );

  // 展开/收起目录
  const toggleExpand = useCallback((node: FileNode) => {
    if (node.type !== "directory") return;

    if (!node.expanded && !node.loaded) {
      // 需要先加载子目录内容，加载完成后再展开
      loadDirectory(node.path).then((children) => {
        setFiles((prev) =>
          updateNodeByPath(prev, node.path, (target) => ({
            ...target,
            children,
            loaded: true,
            expanded: true,
          })),
        );
      });
    } else {
      // 已加载过，直接 toggle 展开/收起
      setFiles((prev) =>
        updateNodeByPath(prev, node.path, (target) => ({
          ...target,
          expanded: !target.expanded,
        })),
      );
    }
  }, [loadDirectory, updateNodeByPath]);

  // 处理文件点击
  const handleFileClick = useCallback((node: FileNode) => {
    if (node.type === "file" && onFileSelect) {
      onFileSelect(node.path);
    }
  }, [onFileSelect]);

  if (!cwd) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-ink-500">
        {t("workspace.selectCwd", "选择工作目录以查看文件")}
      </div>
    );
  }

  if (collapsed) {
    if (floating) {
      return null;
    }
    return (
      <button
        type="button"
        onClick={() => onCollapsedChange?.(false)}
        className="flex h-full w-10 flex-col items-center justify-center border-l border-ink-900/10 bg-surface-cream/50 text-ink-500 hover:bg-surface-cream hover:text-ink-700"
        title={t("workspace.expandFileExplorer", "展开文件浏览器")}
      >
        <FolderIcon className="h-5 w-5" />
        <span className="mt-1 text-[10px] writing-mode-vertical">
          {t("workspace.files", "文件")}
        </span>
      </button>
    );
  }

  return (
    <div
      className={
        floating
          ? "fixed right-0 top-12 bottom-0 z-40 flex flex-col border-l border-ink-900/10 bg-surface-cream shadow-xl"
          : "flex h-full flex-col border-l border-ink-900/10 bg-surface-cream"
      }
      style={{ width }}
    >
      {/* 头部 + 搜索：统一区块，底部 border 与文件树分隔 */}
      <div className="border-b border-ink-900/[0.08] bg-surface-secondary/40">
        {/* 文件夹标题行 */}
        <div className="flex items-center gap-1 px-1.5 pt-1.5 pb-1">
          <button
            type="button"
            onClick={() => onCollapsedChange?.(true)}
            className="icon-hover-slide-right shrink-0 rounded p-1 text-ink-500 hover:bg-ink-900/[0.06] hover:text-ink-700 transition-colors"
            title={t("common.collapse", "收起")}
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-amber-500/70" />
          <span
            className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink-600"
            title={cwd}
          >
            {cwd.split(/[\\/]/).filter(Boolean).pop() || cwd}
          </span>
        </div>

        {/* 搜索框：box 风格，与 Sidebar 设计语言一致 */}
        <div className="px-2 pb-2">
          <div className="group relative flex items-center">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-400/60 transition-colors duration-200 group-focus-within:text-accent/70" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("workspace.searchFilesPlaceholder", "搜索文件…")}
              className="w-full rounded-md border border-ink-400/15 bg-ink-900/[0.05] py-1.5 pl-7 pr-7 text-[11px] text-ink-700 outline-none transition-all duration-200 placeholder:text-ink-400/50 hover:bg-ink-900/[0.07] focus:border-accent/30 focus:bg-surface focus:shadow-[0_0_0_2px_rgba(217,119,87,0.08)] focus:placeholder:text-ink-400/35"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="icon-hover-wiggle absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink-400/60 transition-all duration-150 hover:text-ink-600"
                title={t("workspace.clearSearch", "清除搜索")}
              >
                <ClearIcon className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 文件树 */}
      <div className="file-explorer-scroll flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="py-4 text-center text-xs text-error">{error}</div>
        ) : files.length === 0 ? (
          <div className="py-4 text-center text-xs text-ink-500">
            {t("workspace.emptyDirectory", "目录为空")}
          </div>
        ) : searchLoading ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : visibleNodes.length === 0 && searchQuery.trim() ? (
          <div className="py-4 text-center text-xs text-ink-500">
            {t("workspace.searchNoResults", "没有匹配的文件")}
          </div>
        ) : searchResults !== null ? (
          <SearchResultList
            nodes={visibleNodes}
            searchQuery={searchQuery}
            onFileClick={handleFileClick}
            onCopyEntry={handleCopyEntry}
            onDeleteEntry={handleDeleteEntry}
            onOpenInSystem={handleOpenInSystem}
            onShowInSystem={handleShowInSystem}
          />
        ) : (
          <FileTree
            nodes={visibleNodes}
            onToggleExpand={toggleExpand}
            onFileClick={handleFileClick}
            onCopyEntry={handleCopyEntry}
            onPasteEntry={handlePasteEntry}
            onDeleteEntry={handleDeleteEntry}
            onOpenInSystem={handleOpenInSystem}
            onShowInSystem={handleShowInSystem}
            showHidden={showHidden}
          />
        )}
      </div>
    </div>
  );
}

/** 搜索结果扁平列表：显示 relativePath 方便定位 */
function SearchResultList({
  nodes,
  searchQuery,
  onFileClick,
  onCopyEntry,
  onDeleteEntry,
  onOpenInSystem,
  onShowInSystem,
}: {
  nodes: FileNode[];
  searchQuery: string;
  onFileClick: (node: FileNode) => void;
  onCopyEntry: (node: FileNode) => void;
  onDeleteEntry: (node: FileNode) => void;
  onOpenInSystem: (node: FileNode) => void;
  onShowInSystem: (node: FileNode) => void;
}) {
  const { t } = useTranslation();

  const handleCopyText = useCallback((value: string, title: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      toast({ title, description: value, variant: "success", duration: 2000 });
    }).catch(() => {
      toast({ title: t("workspace.copyFailed", "复制失败"), variant: "error", duration: 2000 });
    });
  }, [t]);

  // 高亮匹配部分
  const highlight = useCallback((text: string) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query);
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="bg-accent/20 text-accent font-medium">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    );
  }, [searchQuery]);

  // 按类型分组：目录在前，文件在后
  const sorted = useMemo(
    () => [...nodes].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.relativePath.localeCompare(b.relativePath);
    }),
    [nodes],
  );

  return (
    <ul className="space-y-0.5">
      {sorted.map((node) => {
        const isDirectory = node.type === "directory";
        return (
          <li key={node.path}>
            <div className="group flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (isDirectory) {
                    onOpenInSystem(node);
                  } else {
                    onFileClick(node);
                  }
                }}
                className="icon-hover-file-bounce flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-ink-700 hover:bg-accent/[0.08] hover:text-ink-900"
                title={node.path}
              >
                {isDirectory ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-ink-900/[0.06]">
                    <FolderIcon className="h-3.5 w-3.5 text-amber-400" />
                  </span>
                ) : (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-ink-900/[0.06]">
                    <FileIcon className="h-3.5 w-3.5" name={node.name} />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {highlight(node.relativePath)}
                </span>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="icon-hover-pop shrink-0 rounded p-1 text-ink-400 opacity-90 transition-colors hover:bg-ink-900/10 hover:text-ink-700"
                  >
                    <MoreVerticalIcon className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {isDirectory && (
                    <DropdownMenuItem className="icon-hover-bounce" onClick={(e) => { e.stopPropagation(); onOpenInSystem(node); }}>
                      <ExternalLinkIcon className="h-4 w-4" />
                      <span>{t("workspace.openInSystem", "在电脑中打开")}</span>
                    </DropdownMenuItem>
                  )}
                  {!isDirectory && (
                    <>
                      <DropdownMenuItem className="icon-hover-bounce" onClick={(e) => { e.stopPropagation(); onFileClick(node); }}>
                        <FolderOpenIcon className="h-4 w-4" />
                        <span>{t("workspace.openFile", "打开文件")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="icon-hover-pop" onClick={(e) => { e.stopPropagation(); onShowInSystem(node); }}>
                        <ExternalLinkIcon className="h-4 w-4" />
                        <span>{t("workspace.showInSystem", "在电脑中显示")}</span>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem className="icon-hover-pop" onClick={(e) => handleCopyText(node.name, t("workspace.nameCopied", "名称已复制"), e)}>
                    <CopyIcon className="h-4 w-4" />
                    <span>{t("workspace.copyName", "复制名称")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="icon-hover-pop" onClick={(e) => handleCopyText(node.path, t("workspace.pathCopied", "路径已复制"), e)}>
                    <CopyIcon className="h-4 w-4" />
                    <span>{t("workspace.copyPath", "复制文件路径")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="icon-hover-spin" onClick={(e) => { e.stopPropagation(); onCopyEntry(node); }}>
                    <ClipboardCopyIcon className="h-4 w-4" />
                    <span>{t("workspace.copyEntry", "复制")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="icon-hover-wiggle text-error focus:text-error focus:bg-error/10" onClick={(e) => { e.stopPropagation(); onDeleteEntry(node); }}>
                    <TrashIcon className="h-4 w-4" />
                    <span>{t("workspace.deleteEntry", "删除")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface FileTreeProps {
  nodes: FileNode[];
  onToggleExpand: (node: FileNode) => void;
  onFileClick: (node: FileNode) => void;
  onCopyEntry: (node: FileNode) => void;
  onPasteEntry: (targetDirPath?: string) => void;
  onDeleteEntry: (node: FileNode) => void;
  onOpenInSystem: (node: FileNode) => void;
  onShowInSystem: (node: FileNode) => void;
  showHidden?: boolean;
  depth?: number;
}

function FileTree({
  nodes,
  onToggleExpand,
  onFileClick,
  onCopyEntry,
  onPasteEntry,
  onDeleteEntry,
  onOpenInSystem,
  onShowInSystem,
  showHidden = false,
  depth = 0,
}: FileTreeProps) {
  const { t } = useTranslation();

  // 排序：目录在前，文件在后，同类型按名称排序
  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  }), [nodes]);

  const handleCopyText = useCallback((value: string, title: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      toast({
        title,
        description: value,
        variant: "success",
        duration: 2000,
      });
    }).catch((err) => {
      console.error("Failed to copy path:", err);
      toast({
        title: t("workspace.copyFailed", "复制失败"),
        variant: "error",
        duration: 2000,
      });
    });
  }, [t]);

  return (
    <ul className="space-y-0.5">
      {sortedNodes.map((node) => {
        const isDirectory = node.type === "directory";

        return (
          <li key={node.path}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="group flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isDirectory) {
                        onToggleExpand(node);
                      } else {
                        onFileClick(node);
                      }
                    }}
                    className="icon-hover-file-bounce flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs text-ink-700 hover:bg-accent/[0.08] hover:text-ink-900"
                    style={{ paddingLeft: `${depth * 14 + 6}px` }}
                    title={node.name}
                  >
                    {isDirectory ? (
                      <>
                        <ChevronIcon
                          className={`h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform duration-150 ${
                            node.expanded ? "rotate-90" : ""
                          }`}
                        />
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-ink-900/[0.06]">
                          <FolderIcon className="h-3.5 w-3.5 text-amber-400" />
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-ink-900/[0.06]">
                          <FileIcon className="h-3.5 w-3.5" name={node.name} />
                        </span>
                      </>
                    )}
                    <span className={`min-w-0 flex-1 truncate ${isDirectory ? "font-medium" : "font-normal"}`}>{node.name}</span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="icon-hover-pop shrink-0 rounded-md p-1 text-ink-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-ink-900/10 hover:text-ink-700"
                        title={
                          isDirectory
                            ? t("workspace.folderActions", "文件夹操作")
                            : t("workspace.fileActions", "文件操作")
                        }
                      >
                        <MoreVerticalIcon className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {isDirectory && (
                        <DropdownMenuItem
                          className="icon-hover-bounce"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenInSystem(node);
                          }}
                        >
                          <ExternalLinkIcon className="h-4 w-4" />
                          <span>{t("workspace.openInSystem", "在电脑中打开")}</span>
                        </DropdownMenuItem>
                      )}
                      {!isDirectory && (
                        <>
                          <DropdownMenuItem
                            className="icon-hover-bounce"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFileClick(node);
                            }}
                          >
                            <FolderOpenIcon className="h-4 w-4" />
                            <span>{t("workspace.openFile", "打开文件")}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="icon-hover-pop"
                            onClick={(e) => {
                              e.stopPropagation();
                              onShowInSystem(node);
                            }}
                          >
                            <ExternalLinkIcon className="h-4 w-4" />
                            <span>{t("workspace.showInSystem", "在电脑中显示")}</span>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem
                        className="icon-hover-pop"
                        onClick={(e) => handleCopyText(node.name, t("workspace.nameCopied", "名称已复制"), e)}
                      >
                        <CopyIcon className="h-4 w-4" />
                        <span>{t("workspace.copyName", "复制名称")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="icon-hover-pop"
                        onClick={(e) => handleCopyText(node.path, t("workspace.pathCopied", "路径已复制"), e)}
                      >
                        <CopyIcon className="h-4 w-4" />
                        <span>
                          {isDirectory
                            ? t("workspace.copyFolderPath", "复制文件夹路径")
                            : t("workspace.copyPath", "复制文件路径")}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="icon-hover-spin"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopyEntry(node);
                        }}
                      >
                        <ClipboardCopyIcon className="h-4 w-4" />
                        <span>{t("workspace.copyEntry", "复制")}</span>
                      </DropdownMenuItem>
                      {isDirectory && (
                        <DropdownMenuItem
                          className="icon-hover-bounce"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPasteEntry(node.path);
                          }}
                        >
                          <PasteIcon className="h-4 w-4" />
                          <span>{t("workspace.pasteHere", "粘贴到此处")}</span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="icon-hover-wiggle text-error focus:text-error focus:bg-error/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEntry(node);
                        }}
                      >
                        <TrashIcon className="h-4 w-4" />
                        <span>{t("workspace.deleteEntry", "删除")}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </ContextMenuTrigger>

              {/* 右键菜单，内容与三点菜单一致 */}
              <ContextMenuContent className="w-48">
                {isDirectory && (
                  <ContextMenuItem
                    className="icon-hover-bounce"
                    onClick={() => onOpenInSystem(node)}
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                    <span>{t("workspace.openInSystem", "在电脑中打开")}</span>
                  </ContextMenuItem>
                )}
                {!isDirectory && (
                  <>
                    <ContextMenuItem
                      className="icon-hover-bounce"
                      onClick={() => onFileClick(node)}
                    >
                      <FolderOpenIcon className="h-4 w-4" />
                      <span>{t("workspace.openFile", "打开文件")}</span>
                    </ContextMenuItem>
                    <ContextMenuItem
                      className="icon-hover-pop"
                      onClick={() => onShowInSystem(node)}
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                      <span>{t("workspace.showInSystem", "在电脑中显示")}</span>
                    </ContextMenuItem>
                  </>
                )}
                <ContextMenuItem
                  className="icon-hover-pop"
                  onClick={() => handleCopyText(node.name, t("workspace.nameCopied", "名称已复制"))}
                >
                  <CopyIcon className="h-4 w-4" />
                  <span>{t("workspace.copyName", "复制名称")}</span>
                </ContextMenuItem>
                <ContextMenuItem
                  className="icon-hover-pop"
                  onClick={() => handleCopyText(node.path, t("workspace.pathCopied", "路径已复制"))}
                >
                  <CopyIcon className="h-4 w-4" />
                  <span>
                    {isDirectory
                      ? t("workspace.copyFolderPath", "复制文件夹路径")
                      : t("workspace.copyPath", "复制文件路径")}
                  </span>
                </ContextMenuItem>
                <ContextMenuItem
                  className="icon-hover-spin"
                  onClick={() => onCopyEntry(node)}
                >
                  <ClipboardCopyIcon className="h-4 w-4" />
                  <span>{t("workspace.copyEntry", "复制")}</span>
                </ContextMenuItem>
                {isDirectory && (
                  <ContextMenuItem
                    className="icon-hover-bounce"
                    onClick={() => onPasteEntry(node.path)}
                  >
                    <PasteIcon className="h-4 w-4" />
                    <span>{t("workspace.pasteHere", "粘贴到此处")}</span>
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="icon-hover-wiggle text-error focus:text-error focus:bg-error/10"
                  onClick={() => onDeleteEntry(node)}
                >
                  <TrashIcon className="h-4 w-4" />
                  <span>{t("workspace.deleteEntry", "删除")}</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>

            {isDirectory && node.expanded && node.children && (
              <div className="relative">
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-900/10"
                  style={{ left: `${depth * 14 + 13}px` }}
                />
                <FileTree
                  nodes={showHidden ? node.children : filterHiddenNodes(node.children)}
                  onToggleExpand={onToggleExpand}
                  onFileClick={onFileClick}
                  onCopyEntry={onCopyEntry}
                  onPasteEntry={onPasteEntry}
                  onDeleteEntry={onDeleteEntry}
                  onOpenInSystem={onOpenInSystem}
                  onShowInSystem={onShowInSystem}
                  showHidden={showHidden}
                  depth={depth + 1}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Icons
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" opacity="0.85" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function FileIcon({ className, name }: { className?: string; name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";

  const codeExts = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java", "kt", "swift", "php", "rb", "c", "cc", "cpp", "h", "hpp", "sql", "sh", "bash", "zsh"]);
  const webExts = new Set(["html", "css", "scss", "less", "vue", "svelte"]);
  const docExts = new Set(["md", "txt", "rtf", "doc", "docx"]);
  const sheetExts = new Set(["csv", "tsv", "xls", "xlsx", "numbers"]);
  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "heic"]);
  const videoExts = new Set(["mp4", "mov", "avi", "mkv", "webm", "m4v"]);
  const audioExts = new Set(["mp3", "wav", "aac", "flac", "ogg", "m4a"]);
  const archiveExts = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "xz", "bz2"]);

  // Per-extension精细颜色（GitHub Linguist 标准）
  const EXT_COLOR_MAP: Record<string, string> = {
    // TypeScript
    ts: "text-blue-400", tsx: "text-blue-400",
    // JavaScript
    js: "text-yellow-400", jsx: "text-yellow-400", mjs: "text-yellow-400", cjs: "text-yellow-400",
    // Python
    py: "text-emerald-400",
    // Rust
    rs: "text-orange-500",
    // Go
    go: "text-cyan-400",
    // Java / Kotlin / Swift
    java: "text-red-400", kt: "text-violet-500", swift: "text-orange-400",
    // Systems C/C++
    c: "text-blue-500", cc: "text-blue-500", cpp: "text-blue-500", h: "text-blue-300", hpp: "text-blue-300",
    // PHP / Ruby
    php: "text-indigo-400", rb: "text-red-400",
    // Shell
    sh: "text-green-400", bash: "text-green-400", zsh: "text-green-400",
    // SQL
    sql: "text-sky-400",
    // Web
    html: "text-orange-400", css: "text-pink-400", scss: "text-pink-400", less: "text-indigo-400",
    vue: "text-emerald-500", svelte: "text-orange-500",
    // Docs
    md: "text-blue-300", txt: "text-ink-400", doc: "text-blue-400", docx: "text-blue-400",
    // Data / Config
    json: "text-amber-400", yaml: "text-amber-400", yml: "text-amber-400",
    toml: "text-slate-400", env: "text-slate-400", ini: "text-slate-400", conf: "text-slate-400",
    // Spreadsheets
    xls: "text-green-500", xlsx: "text-green-500", csv: "text-green-400", tsv: "text-green-400",
    // Images
    svg: "text-violet-400", png: "text-violet-400", jpg: "text-violet-400", jpeg: "text-violet-400",
    gif: "text-violet-400", webp: "text-violet-400", ico: "text-violet-300",
    // PDF
    pdf: "text-red-500",
  };

  let colorClass = EXT_COLOR_MAP[ext] ?? "text-ink-400";
  let variant:
    | "code"
    | "web"
    | "doc"
    | "sheet"
    | "image"
    | "video"
    | "audio"
    | "archive"
    | "config"
    | "pdf"
    | "json"
    | "default" = "default";

  if (codeExts.has(ext)) {
    variant = "code";
  } else if (webExts.has(ext)) {
    variant = "web";
  } else if (docExts.has(ext)) {
    if (!EXT_COLOR_MAP[ext]) colorClass = "text-ink-500";
    variant = "doc";
  } else if (sheetExts.has(ext)) {
    variant = "sheet";
  } else if (imageExts.has(ext)) {
    if (!EXT_COLOR_MAP[ext]) colorClass = "text-fuchsia-500";
    variant = "image";
  } else if (videoExts.has(ext)) {
    if (!EXT_COLOR_MAP[ext]) colorClass = "text-red-500";
    variant = "video";
  } else if (audioExts.has(ext)) {
    if (!EXT_COLOR_MAP[ext]) colorClass = "text-violet-500";
    variant = "audio";
  } else if (archiveExts.has(ext)) {
    if (!EXT_COLOR_MAP[ext]) colorClass = "text-amber-600";
    variant = "archive";
  } else if (ext === "pdf") {
    variant = "pdf";
  } else if (ext === "json" || ext === "yaml" || ext === "yml") {
    variant = "json";
  } else if (ext === "env" || ext === "ini" || ext === "toml" || ext === "conf") {
    variant = "config";
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} ${colorClass}`}
    >
      {/* 圆角文件轮廓，折角更自然 */}
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M13 2v7h7" strokeWidth="1.75" />

      {variant === "code" && (
        <>
          <polyline points="9 11 7 13 9 15" />
          <polyline points="15 11 17 13 15 15" />
          <line x1="12.5" y1="10.5" x2="11.5" y2="15.5" />
        </>
      )}
      {variant === "web" && (
        <>
          <circle cx="12" cy="13.5" r="3.5" />
          <line x1="8.5" y1="13.5" x2="15.5" y2="13.5" />
          <line x1="12" y1="10" x2="12" y2="17" />
        </>
      )}
      {variant === "doc" && (
        <>
          <line x1="8" y1="11.5" x2="16" y2="11.5" />
          <line x1="8" y1="14" x2="16" y2="14" />
          <line x1="8" y1="16.5" x2="13" y2="16.5" />
        </>
      )}
      {variant === "sheet" && (
        <>
          <rect x="8" y="10.5" width="8" height="7" rx="1" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="11" y1="10.5" x2="11" y2="17.5" />
          <line x1="13.5" y1="10.5" x2="13.5" y2="17.5" />
        </>
      )}
      {variant === "image" && (
        <>
          <rect x="8" y="10.5" width="8" height="7" rx="1" />
          <circle cx="10.5" cy="12.5" r="0.8" />
          <polyline points="8.5 16.5 11 14 12.3 15.2 14.7 12.8 15.5 13.6" />
        </>
      )}
      {variant === "video" && (
        <>
          <rect x="8" y="10.5" width="8" height="7" rx="1" />
          <polygon points="11 12 14.5 14 11 16 11 12" fill="currentColor" stroke="none" />
        </>
      )}
      {variant === "audio" && (
        <>
          <path d="M10 16v-3.8l5-1.2v3.6" />
          <circle cx="10" cy="16.8" r="1.2" />
          <circle cx="15" cy="15.8" r="1.2" />
        </>
      )}
      {variant === "archive" && (
        <>
          <rect x="8" y="10.5" width="8" height="7" rx="1" />
          <line x1="12" y1="10.5" x2="12" y2="17.5" />
          <line x1="8" y1="13.5" x2="16" y2="13.5" />
        </>
      )}
      {variant === "pdf" && (
        <>
          <line x1="8" y1="12" x2="14" y2="12" />
          <line x1="8" y1="14.5" x2="13" y2="14.5" />
          <line x1="8" y1="17" x2="12" y2="17" />
        </>
      )}
      {variant === "json" && (
        <>
          <path d="M10 11c-.8 0-1.5.6-1.5 1.4v.2c0 .8-.7 1.4-1.5 1.4" />
          <path d="M14 11c.8 0 1.5.6 1.5 1.4v.2c0 .8.7 1.4 1.5 1.4" />
          <path d="M10 16c-.8 0-1.5-.6-1.5-1.4v-.2c0-.8-.7-1.4-1.5-1.4" />
          <path d="M14 16c.8 0 1.5-.6 1.5-1.4v-.2c0-.8.7-1.4 1.5-1.4" />
        </>
      )}
      {variant === "config" && (
        <>
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="15" x2="16" y2="15" />
          <circle cx="10.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="13.5" cy="15" r="0.9" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-ink-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function MoreVerticalIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

function FolderOpenIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <path d="M2 13h20" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ClipboardCopyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" />
      <rect x="13" y="11" width="8" height="8" rx="1.5" />
      <path d="M16 14h2v2" />
      <path d="M18 14l-3 3" />
    </svg>
  );
}

function PasteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M19 6h-2.5" />
      <path d="M7.5 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.5" />
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M12 11v6" />
      <path d="M9.5 14.5L12 17l2.5-2.5" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9l1-12" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function ClearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}


function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default FileExplorer;
