import { useCallback, useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import { useWorkspaceOptions } from "../../hooks/useWorkspaceOptions";
import { toast } from "../../hooks/use-toast";

interface InlineCwdSelectorProps {
  /** 点击"高级设置"时回调，打开 StartSessionModal */
  onAdvancedSettings?: () => void;
}

/**
 * 紧凑型工作目录选择器，显示在 PromptInput 上方（新会话场景）。
 * Dropdown 展示最近目录 + 常用目录 + 浏览。
 */
export function InlineCwdSelector({ onAdvancedSettings }: InlineCwdSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const cwd = useAppStore((s) => s.cwd);
  const setCwd = useAppStore((s) => s.setCwd);

  const {
    recentWorkspaces,
    commonDirs,
    loading,
    loadOptions,
    refreshOptions,
    selectDirectory,
    removeRecent,
  } = useWorkspaceOptions();

  // 首次打开时加载数据
  useEffect(() => {
    if (open) {
      loadOptions();
    }
  }, [open, loadOptions]);

  const displayName = (() => {
    if (!cwd) return t("workspace.selectDir", "Select directory");
    const parts = cwd.split(/[/\\]/).filter(Boolean);
    if (parts.length <= 1) return parts[0] || cwd;
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  })();

  const handleSelect = useCallback(
    async (path: string) => {
      setCwd(path);
      try {
        await window.electron.workspace.addRecent(path);
      } catch {
        // 添加到最近列表失败不阻塞
      }
      setOpen(false);
      refreshOptions();
    },
    [setCwd, refreshOptions],
  );

  const handleBrowse = useCallback(async () => {
    const selected = await selectDirectory();
    if (selected) {
      await handleSelect(selected);
    }
  }, [selectDirectory, handleSelect]);

  const handleSetDefault = useCallback(async () => {
    if (!cwd.trim()) return;
    setOpen(false);
    try {
      const result = await window.electron.workspace.setDefaultCwd(cwd);
      if (result.success) {
        toast({
          title: t("workspace.defaultSet", "Default directory set"),
          description: cwd,
        });
      } else {
        toast({
          title: t("workspace.defaultSetFailed", "Failed to set default"),
          description: result.error || "",
          variant: "error",
        });
      }
    } catch (error) {
      console.error("[InlineCwdSelector] Failed to set default cwd:", error);
    }
  }, [cwd, t, setOpen]);

  const handleRemoveRecent = useCallback(
    async (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      await removeRecent(path);
    },
    [removeRecent],
  );

  const handleOpenInFinder = useCallback(
    async (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      try {
        await window.electron.shell.showItemInFolder(path, path);
      } catch {
        // fallback: try openPath
        try {
          await window.electron.shell.openPath(path, path);
        } catch {
          // silently ignore
        }
      }
    },
    [],
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-tour="workspace-selector"
          className="flex items-center gap-1.5 rounded-lg bg-ink-900/8 px-2.5 py-1.5 text-[11px] font-medium text-ink-700 hover:bg-ink-900/12 transition-colors max-w-[200px]"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 shrink-0 text-ink-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="truncate">{displayName}</span>
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 shrink-0 text-ink-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-80 rounded-xl border border-[#1414131a] bg-surface shadow-[0_4px_6px_rgba(0,0,0,0.04),_0_12px_32px_rgba(0,0,0,0.10)] animate-in fade-in-0 zoom-in-95 origin-bottom-left"
        >
          <div className="max-h-[360px] overflow-y-auto p-2">

            {/* 最近使用 */}
            {recentWorkspaces.length > 0 && (
              <div className="mb-1">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">
                  {t("workspace.recent", "Recent")}
                </div>
                {recentWorkspaces.slice(0, 5).map((w) => (
                  <div
                    key={w.path}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(w.path)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelect(w.path);
                      }
                    }}
                    className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs transition-colors hover:bg-ink-900/5 cursor-pointer"
                    title={w.path}
                  >
                    {/* 文件夹图标 */}
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5 shrink-0 text-ink-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>

                    {/* 路径文字 */}
                    <div className="flex min-w-0 flex-1 flex-col text-left">
                      <span className="truncate text-[12px] font-medium text-ink-800">
                        {w.displayName || w.path.split(/[/\\]/).pop() || w.path}
                      </span>
                      <span className="truncate text-[10px] text-ink-400">{w.path}</span>
                    </div>

                    {/* 右侧操作区 */}
                    <div className="flex shrink-0 items-center gap-0.5">
                      {/* 在 Finder 中打开 */}
                      <button
                        type="button"
                        onClick={(e) => handleOpenInFinder(e, w.path)}
                        className="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:bg-ink-900/8 hover:text-ink-600 transition-all"
                        title={t("workspace.openInFinder", "Open in Finder")}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15,3 21,3 21,9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </button>

                      {/* 已选中 / 移除 */}
                      {w.path === cwd ? (
                        <svg
                          className="h-3.5 w-3.5 text-accent"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleRemoveRecent(e, w.path)}
                          className="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:bg-red-50 hover:text-red-500 transition-all"
                          title={t("workspace.removeRecent", "Remove")}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 分隔线 */}
            {recentWorkspaces.length > 0 && commonDirs.length > 0 && (
              <div className="my-1.5 border-t border-ink-900/8" />
            )}

            {/* 常用目录 */}
            {commonDirs.length > 0 && (
              <div className="mb-1">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">
                  {t("workspace.commonDirs", "Quick access")}
                </div>
                {commonDirs.map((dir) => (
                  <button
                    key={dir.path}
                    type="button"
                    onClick={() => handleSelect(dir.path)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs transition-colors hover:bg-ink-900/5 ${
                      dir.path === cwd
                        ? "text-accent font-medium"
                        : "text-ink-700"
                    }`}
                    title={dir.path}
                  >
                    <DirIcon type={dir.type} />
                    <span className="flex-1 truncate text-left">
                      {t(`workspace.dir.${dir.type}`, dir.name)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* 分隔线 */}
            <div className="my-1.5 border-t border-ink-900/8" />

            {/* 浏览 */}
            <button
              type="button"
              onClick={handleBrowse}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-ink-700 transition-colors hover:bg-ink-900/5"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 text-ink-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>{t("workspace.browse", "Browse...")}</span>
            </button>

            {/* 设为默认 */}
            {cwd.trim() && (
              <>
                <div className="my-1.5 border-t border-ink-900/8" />
                <button
                  type="button"
                  onClick={handleSetDefault}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-ink-500 transition-colors hover:bg-ink-900/5 hover:text-ink-700"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-ink-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17,21 17,13 7,13 7,21" />
                    <polyline points="7,3 7,8 15,8" />
                  </svg>
                  <span>{t("workspace.setAsDefault", "Set as default")}</span>
                </button>
              </>
            )}

            {/* 高级设置入口 */}
            {onAdvancedSettings && (
              <>
                <div className="my-1.5 border-t border-ink-900/8" />
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAdvancedSettings();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-ink-500 transition-colors hover:bg-ink-900/5 hover:text-ink-700"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-ink-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>{t("workspace.advancedSettings", "Advanced settings...")}</span>
                </button>
              </>
            )}
          </div>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/60 rounded-xl">
              <svg
                className="h-4 w-4 animate-spin text-ink-400"
                viewBox="0 0 24 24"
                fill="none"
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DirIcon({ type }: { type: string }) {
  switch (type) {
    case "home":
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-ink-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9,22 9,12 15,12 15,22" />
        </svg>
      );
    case "documents":
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-ink-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
        </svg>
      );
    case "desktop":
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-ink-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "temp":
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-ink-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
        </svg>
      );
    default:
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-ink-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
  }
}
