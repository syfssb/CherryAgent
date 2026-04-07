import { useCallback, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  useWorkspaceOptions,
  type RecentWorkspace,
  type CommonDir,
} from "../../hooks/useWorkspaceOptions";

export type { RecentWorkspace, CommonDir };

interface WorkspaceSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

export function WorkspaceSelector({
  value,
  onChange,
  disabled = false,
  error
}: WorkspaceSelectorProps) {
  const { t } = useTranslation();
  const [isValidating, setIsValidating] = useState(false);
  const [pathExists, setPathExists] = useState<boolean | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const {
    recentWorkspaces,
    commonDirs,
    loadOptions,
    selectDirectory,
    removeRecent,
  } = useWorkspaceOptions();

  // 加载最近工作目录和常用目录
  useEffect(() => {
    loadOptions({ force: true });
  }, [loadOptions]);

  // 验证路径是否存在
  useEffect(() => {
    if (!value.trim()) {
      setPathExists(null);
      return;
    }

    const validatePath = async () => {
      setIsValidating(true);
      try {
        const result = await window.electron.workspace.exists(value);
        if (result.success && result.data) {
          setPathExists(result.data.exists);
        } else {
          setPathExists(false);
        }
      } catch {
        setPathExists(false);
      }
      setIsValidating(false);
    };

    const timer = setTimeout(validatePath, 300);
    return () => clearTimeout(timer);
  }, [value]);

  // 选择目录
  const handleSelectDirectory = async () => {
    const result = await selectDirectory();
    if (result) {
      onChange(result);
    }
  };

  // 拖放处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // 对于目录拖放，file.path 包含完整路径
      if ((file as any).path) {
        onChange((file as any).path);
      }
    }
  }, [disabled, onChange]);

  // 移除最近使用记录
  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await removeRecent(path);
  };

  // 获取图标类型
  const getDirIcon = (type: string) => {
    switch (type) {
      case "home":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9,22 9,12 15,12 15,22" />
          </svg>
        );
      case "documents":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10,9 9,9 8,9" />
          </svg>
        );
      case "desktop":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        );
      case "temp":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        );
    }
  };

  return (
    <div className="grid gap-3">
      {/* 输入框和选择按钮 */}
      <div
        ref={dropRef}
        className={`relative rounded-xl border-2 border-dashed transition-colors ${
          isDragOver
            ? "border-accent bg-accent/5"
            : error
              ? "border-error/50"
              : "border-ink-900/10"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex gap-2 p-2">
          <div className="relative flex-1">
            <input
              className={`w-full rounded-lg border bg-surface-secondary px-4 py-2.5 pr-10 text-sm text-ink-800 placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-1 transition-colors ${
                error
                  ? "border-error/50 focus:border-error focus-visible:ring-error/20"
                  : pathExists === false
                    ? "border-warning/50 focus:border-warning focus-visible:ring-warning/20"
                    : "border-ink-900/10 focus:border-accent focus-visible:ring-accent/20"
              }`}
              placeholder={t("workspace.dragPlaceholder", "拖拽文件夹到这里或输入路径...")}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
            />
            {/* 状态指示器 */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isValidating ? (
                <svg className="h-4 w-4 animate-spin text-muted" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : pathExists === true ? (
                <svg className="h-4 w-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : pathExists === false ? (
                <svg className="h-4 w-4 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSelectDirectory}
            disabled={disabled}
            className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-surface-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("session.browse", "浏览")}
          </button>
        </div>
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-accent/10 pointer-events-none">
            <div className="flex items-center gap-2 text-sm font-medium text-accent">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17,8 12,3 7,8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>{t("workspace.dropHere", "拖拽文件夹到此")}</span>
            </div>
          </div>
        )}
      </div>

      {/* 错误信息 */}
      {error && (
        <p className="text-xs text-error">{error}</p>
      )}

      {/* 路径不存在警告 */}
      {!error && pathExists === false && value.trim() && (
        <p className="text-xs text-warning">
          {t("error.directoryNotFound", "目录不存在")}
        </p>
      )}

      {/* 常用目录快捷按钮 */}
      <div className="flex flex-wrap gap-2">
        {commonDirs.map((dir) => (
          <button
            key={dir.type}
            type="button"
            onClick={() => onChange(dir.path)}
            disabled={disabled}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
              value === dir.path
                ? "border-accent/60 bg-accent/10 text-ink-800"
                : "border-ink-900/10 bg-surface-secondary text-muted hover:border-ink-900/20 hover:bg-surface-tertiary hover:text-ink-700"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={dir.path}
          >
            {getDirIcon(dir.type)}
            <span>{dir.name}</span>
          </button>
        ))}
      </div>

      {/* 最近使用的目录 */}
      {recentWorkspaces.length > 0 && (
        <div className="grid gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-light">
            {t("workspace.recentWorkspaces", "最近使用的目录")}
          </div>
          <div className="grid gap-1.5 max-h-32 overflow-y-auto">
            {recentWorkspaces.map((workspace) => (
              <div
                key={workspace.path}
                className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors cursor-pointer ${
                  value === workspace.path
                    ? "border-accent/60 bg-accent/5"
                    : "border-ink-900/10 bg-surface-secondary hover:border-ink-900/20 hover:bg-surface-tertiary"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                onClick={() => !disabled && onChange(workspace.path)}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-ink-800 truncate">
                    {workspace.displayName || workspace.path.split(/[/\\]/).pop()}
                  </div>
                  <div className="text-[10px] text-muted truncate">{workspace.path}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleRemoveRecent(e, workspace.path)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-ink-900/10 transition-all"
                  title={t("workspace.removeFromRecent", "从最近使用中移除")}
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkspaceSelector;
