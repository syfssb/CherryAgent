import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, FileCode2, FileText, Folder, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/ui/hooks/use-toast';
import { useAppStore } from '@/ui/store/useAppStore';
import { useArtifacts } from '@/ui/hooks/useArtifacts';
import { SectionTooltip } from './SectionTooltip';
import { filterVisibleWorkingFiles } from './utils';

const PREVIEW_COUNT = 4;

// 模块级缓存：按 sessionId 保存已手动清除文件的时间戳，跨组件挂载/卸载持久化
const sessionDeletedPaths = new Map<string, Map<string, number>>();
const LS_DELETED_KEY = 'ca:deleted-paths:';

function getSessionDeletedPaths(sessionId: string): Map<string, number> {
  if (!sessionDeletedPaths.has(sessionId)) {
    try {
      const raw = localStorage.getItem(`${LS_DELETED_KEY}${sessionId}`);
      const parsed = raw ? JSON.parse(raw) as unknown : {};
      if (Array.isArray(parsed)) {
        const restoredAt = Date.now();
        sessionDeletedPaths.set(
          sessionId,
          new Map(parsed.map((path) => [String(path), restoredAt])),
        );
      } else if (parsed && typeof parsed === 'object') {
        sessionDeletedPaths.set(
          sessionId,
          new Map(
            Object.entries(parsed as Record<string, unknown>)
              .filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
          ),
        );
      } else {
        sessionDeletedPaths.set(sessionId, new Map());
      }
    } catch {
      sessionDeletedPaths.set(sessionId, new Map());
    }
  }
  return sessionDeletedPaths.get(sessionId)!;
}

function persistDeletedPaths(sessionId: string): void {
  try {
    const paths = sessionDeletedPaths.get(sessionId);
    if (paths) {
      localStorage.setItem(
        `${LS_DELETED_KEY}${sessionId}`,
        JSON.stringify(Object.fromEntries(paths))
      );
    }
  } catch {
    // ignore (quota exceeded, private mode, etc.)
  }
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

const CODE_EXTS = new Set(['py', 'sh', 'bash', 'zsh', 'fish', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'swift', 'kt', 'r', 'scala', 'lua', 'json', 'yaml', 'yml', 'toml', 'env', 'sql']);

function getWorkingFileIcon(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (CODE_EXTS.has(ext)) return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[#87867f]" />;
  return <FileText className="h-3.5 w-3.5 shrink-0 text-[#87867f]" />;
}

export function ContextSection() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [showAccessedFiles, setShowAccessedFiles] = useState(false);
  const [showAllAccessedFiles, setShowAllAccessedFiles] = useState(false);
  const [directoryMissing, setDirectoryMissing] = useState(false);
  const [isSelectingDir, setIsSelectingDir] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  // 用于触发重渲染的计数器（模块级 Map 不是响应式的，需要一个 trigger）
  const [, setDeletedRevision] = useState(0);

  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const session = useAppStore((state) => {
    const sessionId = state.activeSessionId;
    return sessionId ? state.sessions[sessionId] : null;
  });
  const cwd = session?.cwd;
  const { workingFiles: rawWorkingFiles, accessedFiles } = useArtifacts();

  // 过滤掉已手动删除的文件
  const workingFiles = activeSessionId
    ? filterVisibleWorkingFiles(rawWorkingFiles, getSessionDeletedPaths(activeSessionId))
    : rawWorkingFiles;

  useEffect(() => {
    if (!cwd) {
      setDirectoryMissing(false);
      return;
    }
    void (async () => {
      try {
        const result = await window.electron.workspace.exists(cwd);
        setDirectoryMissing(result.success && result.data?.exists === false);
      } catch {
        setDirectoryMissing(false);
      }
    })();
  }, [cwd]);

  const handleRelocate = useCallback(async () => {
    setIsSelectingDir(true);
    try {
      const newPath = await window.electron.selectDirectory();
      if (newPath && activeSessionId) {
        await window.electron.session.update(activeSessionId, { cwd: newPath });
        setDirectoryMissing(false);
      }
    } catch (err) {
      console.error('[ContextSection] Failed to relocate cwd:', err);
    } finally {
      setIsSelectingDir(false);
    }
  }, [activeSessionId]);

  const visibleWorkingFiles = useMemo(
    () => (showAllFiles ? workingFiles : workingFiles.slice(0, PREVIEW_COUNT)),
    [workingFiles, showAllFiles],
  );

  const visibleAccessedFiles = useMemo(
    () => (showAllAccessedFiles ? accessedFiles : accessedFiles.slice(0, PREVIEW_COUNT)),
    [accessedFiles, showAllAccessedFiles],
  );

  const handleClearAll = useCallback(async () => {
    if (workingFiles.length === 0 || isClearingAll) return;
    setIsClearingAll(true);
    let cleared = 0;
    const total = workingFiles.length;
    const newlyDeleted: string[] = [];
    const deletedAt = Date.now();
    for (const artifact of workingFiles) {
      try {
        const result = await window.electron.workspace.deleteFile(artifact.path);
        if (result.success) {
          cleared++;
          newlyDeleted.push(artifact.path);
        }
      } catch {
        // continue deleting remaining files
      }
    }
    if (newlyDeleted.length > 0 && activeSessionId) {
      const deleted = getSessionDeletedPaths(activeSessionId);
      newlyDeleted.forEach((path) => deleted.set(path, deletedAt));
      persistDeletedPaths(activeSessionId);
      setDeletedRevision((v) => v + 1);
    }
    setIsClearingAll(false);
    if (cleared === total) {
      toast({ title: t('workspace.clearAllSuccess', '已清除 {{count}} 个文件', { count: cleared }), variant: 'default' });
    } else if (cleared > 0) {
      toast({ title: t('workspace.clearAllPartial', '已清除 {{cleared}} / {{total}} 个文件', { cleared, total }), variant: 'default' });
    } else {
      toast({ title: t('workspace.clearAllScripts', '清除全部'), description: t('common.error', '操作失败，请重试'), variant: 'error' });
    }
  }, [activeSessionId, isClearingAll, t, workingFiles]);

  const handleOpenDirectory = async () => {
    if (!cwd) return;
    const result = await window.electron.shell.openPath(cwd);
    if (!result.success) {
      toast({
        title: t('workspace.openDirectory', '打开目录'),
        description: result.error || cwd,
        variant: 'error',
      });
    }
  };

  const handleOpenEntry = async (entryPath: string) => {
    const result = await window.electron.shell.openPath(entryPath, cwd);
    if (!result.success) {
      toast({
        title: t('workspace.openFile', '打开文件'),
        description: result.error || entryPath,
        variant: 'error',
      });
    }
  };

  if (!cwd) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 transition-colors duration-150 hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]"
      >
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[#87867f]">
          {t('workspace.workspace', '工作区')}
        </span>
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-[#b0aea5]" />
        ) : (
          <ChevronDown className="h-3 w-3 text-[#b0aea5]" />
        )}
      </button>

      {!collapsed && (
        <div className="space-y-4 px-4 pb-4">
          {/* 工作目录 */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#b0aea5]">
                {t('workspace.selectedFolders', '工作目录')}
              </p>
              <SectionTooltip text={t('workspace.tooltipCwd', 'The folder you gave Claude. It reads and saves files here, just like your desktop workspace.')} />
            </div>
            <button
              type="button"
              onClick={() => void handleOpenDirectory()}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]"
              title={cwd}
            >
              <Folder className="h-4 w-4 shrink-0 text-[#87867f]" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-[#141413] dark:text-[#faf9f5]">
                {cwd.split(/[\\/]/).pop() || cwd}
              </span>
            </button>
            {directoryMissing && (
              <div className="mt-1.5 rounded-lg border border-[#D97706]/20 bg-[#D97706]/[0.08] px-3 py-2">
                <p className="text-[11px] font-medium text-[#D97706]">
                  {t('workspace.directoryMissing', '工作目录已不存在')}
                </p>
                <button
                  type="button"
                  onClick={() => void handleRelocate()}
                  disabled={isSelectingDir}
                  className="mt-1 text-[11px] text-[#D97706]/80 underline transition-colors hover:text-[#D97706] hover:no-underline disabled:opacity-60"
                >
                  {isSelectingDir
                    ? t('common.selecting', '选择中...')
                    : t('workspace.relocate', '重新选择目录')}
                </button>
              </div>
            )}
          </div>

          {/* 文件操作（写入/编辑的文件） */}
          {workingFiles.length > 0 && (
            <div>
              {/* Section header row */}
              <div className="mb-1.5 flex items-center gap-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#b0aea5]">
                  {t('workspace.fileOperations', '文件操作')}
                </p>
                <SectionTooltip text={t('workspace.tooltipScripts', "Code and scripts Claude wrote to use as tools while working. You usually don't need to touch these after the task.")} />
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={() => void handleClearAll()}
                    disabled={isClearingAll}
                    title={t('workspace.clearAllScriptsTooltip', '删除 Claude 写入的所有脚本和代码文件')}
                    className="flex items-center gap-1 text-[10px] text-[#b0aea5] transition-colors duration-150 hover:text-[#87867f] disabled:opacity-50"
                  >
                    {isClearingAll ? (
                      <span className="italic">{t('workspace.clearingAll', '清除中...')}</span>
                    ) : (
                      <>
                        <Trash2 className="h-2.5 w-2.5" />
                        <span>{t('workspace.clearAllScripts', '清除全部')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="space-y-0.5">
                {visibleWorkingFiles.map((artifact) => (
                  <button
                    key={artifact.path}
                    type="button"
                    onClick={() => void handleOpenEntry(artifact.path)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]"
                    title={artifact.path}
                  >
                    {getWorkingFileIcon(artifact.path)}
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[#141413] dark:text-[#faf9f5]">
                      {getFileName(artifact.path)}
                    </span>
                  </button>
                ))}
              </div>
              {workingFiles.length > PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setShowAllFiles((prev) => !prev)}
                  className="mt-0.5 w-full px-2 py-1 text-left text-[11px] text-[#b0aea5] transition-colors duration-150 hover:text-[#87867f]"
                >
                  {showAllFiles
                    ? t('workspace.showLess', '收起')
                    : t('workspace.showMore', '显示更多 {{count}} 项', { count: workingFiles.length - PREVIEW_COUNT })}
                </button>
              )}
            </div>
          )}

          {/* 读取的文件（可折叠） */}
          {accessedFiles.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowAccessedFiles((prev) => !prev)}
                className="mb-1 flex w-full items-center gap-1 text-left"
              >
                {showAccessedFiles ? (
                  <ChevronDown className="h-3 w-3 text-[#b0aea5]" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-[#b0aea5]" />
                )}
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#b0aea5]">
                  {t('workspace.accessedFiles', '读取的文件')}
                </p>
                <SectionTooltip text={t('workspace.tooltipReadFiles', 'Files Claude looked at during the task. Read-only — nothing was changed.')} />
                <span className="ml-auto rounded-full bg-[#1414130d] px-1.5 py-0.5 text-[11px] text-[#b0aea5] dark:bg-[#faf9f50d]">
                  {accessedFiles.length}
                </span>
              </button>

              {showAccessedFiles && (
                <>
                  <div className="space-y-0.5">
                    {visibleAccessedFiles.map((file) => (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => void handleOpenEntry(file.path)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]"
                        title={file.path}
                      >
                        <Eye className="h-3.5 w-3.5 shrink-0 text-[#b0aea5]" />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-[#b0aea5]">
                          {getFileName(file.path)}
                        </span>
                      </button>
                    ))}
                  </div>
                  {accessedFiles.length > PREVIEW_COUNT && (
                    <button
                      type="button"
                      onClick={() => setShowAllAccessedFiles((prev) => !prev)}
                      className="mt-0.5 w-full px-2 py-1 text-left text-[11px] text-[#b0aea5] transition-colors duration-150 hover:text-[#87867f]"
                    >
                      {showAllAccessedFiles
                        ? t('workspace.showLess', '收起')
                        : t('workspace.showMore', '显示更多 {{count}} 项', { count: accessedFiles.length - PREVIEW_COUNT })}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
