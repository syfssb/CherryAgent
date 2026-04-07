import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

export interface PermissionRequest {
  toolUseId: string;
  toolName: string;
  input: unknown;
}

interface PermissionDialogProps {
  request: PermissionRequest;
  onResult: (toolUseId: string, result: PermissionResult) => void;
  sessionTitle?: string;
  queueCount?: number;
  onJumpToSession?: () => void;
  provider?: "claude" | "codex";
}

/**
 * 权限确认对话框组件
 * 在 "全部确认" 或 "仅批准编辑" 模式下显示
 */
export function PermissionDialog({ request, onResult, sessionTitle, queueCount, onJumpToSession, provider = "claude" }: PermissionDialogProps) {
  const { t } = useTranslation();

  const handleAllow = useCallback(() => {
    onResult(request.toolUseId, { behavior: "allow", updatedInput: request.input as Record<string, unknown> | undefined });
  }, [request, onResult]);

  const handleDeny = useCallback(() => {
    onResult(request.toolUseId, {
      behavior: "deny",
      message: t("permission.userDenied", "用户拒绝"),
    });
  }, [request, onResult]);

  // 格式化 input 显示
  const formatInput = (input: unknown): string => {
    if (typeof input === "string") return input;
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };

  // 获取工具图标
  const getToolIcon = (toolName: string) => {
    if (toolName.includes("Bash") || toolName.includes("bash")) {
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 8l4 4-4 4M13 16h4" />
        </svg>
      );
    }
    if (toolName.includes("Write") || toolName.includes("Edit")) {
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      );
    }
    if (toolName.includes("Read") || toolName.includes("Glob") || toolName.includes("Grep")) {
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      );
    }
    // 默认工具图标
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    );
  };

  // 获取工具颜色
  const getToolColor = (toolName: string) => {
    if (toolName.includes("Bash") || toolName.includes("bash")) {
      return "text-[#D97706] bg-[#FEF3C7] border-[#D97706]/20";
    }
    if (toolName.includes("Write") || toolName.includes("Edit")) {
      return "text-[#2563EB] bg-[#DBEAFE] border-[#2563EB]/20";
    }
    return "text-[#16A34A] bg-[#DCFCE7] border-[#16A34A]/20";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl border border-ink-900/10 bg-surface shadow-elevated overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-900/10 bg-surface-secondary">
          <div className={`flex items-center justify-center h-10 w-10 rounded-xl border ${getToolColor(request.toolName)}`}>
            {getToolIcon(request.toolName)}
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-ink-800">
              {provider === "codex"
                ? t("permission.titleCodex", "策略级审批")
                : t("permission.title", "权限请求")}
            </h3>
            <p className="text-xs text-muted">
              {provider === "codex"
                ? t("permission.codexPolicyNote", "Codex 使用策略级权限审批，无法逐工具控制")
                : t("permission.toolRequest", "工具 {{tool}} 请求执行", { tool: request.toolName })}
            </p>
            {sessionTitle && (
              <p className="mt-1 text-[11px] text-ink-500">
                {t("permission.sessionSource", "来自会话：{{title}}", { title: sessionTitle })}
              </p>
            )}
          </div>
          {typeof queueCount === "number" && queueCount > 1 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-ink-900/10 px-2 py-0.5 text-[10px] font-medium text-ink-600">
              {t("permission.queueCount", "队列 {{count}}", { count: queueCount })}
            </span>
          )}
        </div>

        {/* 内容区 */}
        <div className="px-5 py-4">
          <div className="text-xs font-medium text-muted mb-2">
            {t("permission.parameters", "执行参数")}
          </div>
          <div className="rounded-xl bg-surface-secondary border border-ink-900/10 p-3 max-h-60 overflow-auto">
            <pre className="text-xs text-ink-700 whitespace-pre-wrap break-all font-mono">
              {formatInput(request.input)}
            </pre>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-ink-900/10 bg-surface-secondary">
          {onJumpToSession && (
            <button
              onClick={onJumpToSession}
              className="px-3 py-2 rounded-full border border-ink-900/10 bg-surface text-xs text-ink-700 hover:bg-surface-tertiary transition-colors"
            >
              {t("permission.jumpToSession", "前往会话")}
            </button>
          )}
          <button
            onClick={handleDeny}
            className="flex-1 px-4 py-2.5 rounded-full border border-ink-900/10 bg-surface text-sm font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
          >
            {t("permission.deny", "拒绝")}
          </button>
          <button
            onClick={handleAllow}
            className="flex-1 px-4 py-2.5 rounded-full bg-accent text-sm font-medium text-white hover:bg-accent-hover transition-colors"
          >
            {t("permission.allow", "允许")}
          </button>
        </div>
      </div>
    </div>
  );
}
