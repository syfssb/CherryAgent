import { query, type SDKMessage, type PermissionResult, type SDKResultMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent, MessageUsageInfo, ExtendedStreamMessage, StreamMessage, ImageContent, PermissionMode } from "../types.js";
import type { Session } from "./session-store.js";
import { generateTitle } from "./title-generator.js";
import { readdir, stat } from "fs/promises";
import { join, normalize, sep } from "path";
import os from "os";

import { getCurrentApiConfig, buildEnvForConfig, getClaudeCodePath } from "./claude-settings.js";
import { getSkillsPluginRoot, ensureSkillsPluginManifest } from "./skill-files.js";
import { getEnhancedEnv } from "./util.js";
import { getProxyErrorMessage } from "./proxy-adapter.js";
import { proxyRequest } from "./proxy-client.js";
import { getDefaultCwdSync } from "./recent-workspaces.js";
import { shouldCollectAutoTitleMessage } from "./title-generation-policy.js";
import { resolveEffectiveCwd } from "./cwd-resolver.js";
import { createClaudeProcessSpawner } from "./claude-process-spawner.js";
import { getRemoteModelConfig } from "./remote-config.js";
import { shouldLoadSkillsPlugin } from "./skill-plugin-policy.js";
import { app } from "electron";
import { diagnosticsRegistry, DiagnosticEventKind } from "./diagnostics.js";
import { buildFatalRunnerErrorPayload, isBalanceRunnerError, isFatalRunnerStderr, isLoginRequiredRunnerError, type FatalRunnerErrorType } from "./runner-errors.js";
import { validateToolInput } from "./tool-validator.js";
import { devLog, IS_DEV_MODE } from "./dev-logger.js";

// ─── Bash 文件追踪（PostToolUse mtime diff）───────────────────────────────────

const BASH_NOISY_SEGMENTS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit',
  'dist', 'build', '__pycache__', '.venv', 'venv', '.tox',
]);

/**
 * 返回 dir 下 mtime > sinceMs 的所有文件（最多 4 层深）。
 * 用于 PostToolUse hook 捕捉 Bash 工具间接创建的文件。
 */
async function findFilesCreatedAfter(dir: string, sinceMs: number, maxDepth = 4): Promise<string[]> {
  const results: string[] = [];
  async function scan(current: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import('fs').Dirent[];
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (BASH_NOISY_SEGMENTS.has(entry.name)) continue;
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath, depth + 1);
      } else if (entry.isFile()) {
        try {
          const st = await stat(fullPath);
          if (st.mtimeMs > sinceMs) results.push(fullPath);
        } catch { /* skip */ }
      }
    }
  }
  try { await scan(dir, 0); } catch { /* ignore */ }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────

// 缓存 ensureSkillsPluginManifest 调用，同一会话期间 5 分钟内不重复检查
let lastManifestCheck = 0;
const MANIFEST_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

function ensureSkillsPluginManifestCached(): void {
  const now = Date.now();
  if (now - lastManifestCheck < MANIFEST_CHECK_INTERVAL) return;
  lastManifestCheck = now;
  ensureSkillsPluginManifest();
}

/**
 * 上下文注入选项
 */
export type ContextInjection = {
  /** 记忆上下文 */
  memoryContext?: string;
  /** 技能上下文 */
  skillContext?: string;
  /** 自定义系统提示 */
  customSystemPrompt?: string;
  /**
   * 历史对话文本（当 SDK 会话 ID 失效时从 SQLite 重建）。
   * 已格式化为 [User]/[Assistant] 对话，仅作参考上下文。
   */
  historyContext?: string;
};


export type RunnerOptions = {
  prompt: string;
  /** 图片内容列表 */
  images?: ImageContent[];
  /** 用户选择的模型 ID */
  model?: string;
  session: Session;
  resumeSessionId?: string;
  onEvent: (event: ServerEvent) => void;
  onSessionUpdate?: (updates: Partial<Session>) => void;
  /** 是否是新会话（用于自动生成标题） */
  isNewSession?: boolean;
  /** 上下文注入选项 */
  contextInjection?: ContextInjection;
  /** 权限模式 */
  permissionMode?: PermissionMode;
  /** 思考强度 */
  thinkingEffort?: "off" | "low" | "medium" | "high";
};

export type RunnerHandle = {
  abort: () => void;
  pid?: number;  // 子进程 PID，用于 Windows 进程树清理
};

/**
 * 获取默认工作目录（同步，三级回退与 resolveDefaultCwd 一致）
 * 回退链：用户偏好 → 最近使用 → ~/CherryAgent → home → process.cwd()
 */
function getDefaultCwd(): string {
  try {
    if (app.isReady()) {
      return getDefaultCwdSync();
    }
  } catch (e) {
    console.warn('[runner] Failed to get default cwd:', e);
  }
  return process.cwd();
}

/**
 * Rewrite /tmp paths to cwd-relative or cwd-absolute paths.
 * For Bash commands, we prefer cwd-relative paths (./) to avoid space-escaping issues.
 */
const TOOL_PATH_KEY_PATTERN = /path|file|dir|directory|cwd|output|destination|target|out/i;

function rewriteTmpPathToCwd(value: string, cwd: string): string {
  if (!cwd) return value;
  const normalizedCwd = cwd.replace(/[\\/]+$/, "");
  if (!normalizedCwd) return value;

  // 层1：动态检测当前系统实际临时目录（跨平台，含 Windows %TEMP%、Linux /tmp 等）
  const sysTmp = normalize(os.tmpdir());
  const sysTmpWithSep = sysTmp.endsWith(sep) ? sysTmp : sysTmp + sep;
  if (value === sysTmp) return normalizedCwd;
  if (value.startsWith(sysTmpWithSep)) {
    return `${normalizedCwd}/${value.slice(sysTmpWithSep.length)}`;
  }

  // 层2：macOS /private/tmp（os.tmpdir() 在 macOS 返回 /var/folders/... 符号链接，
  //       Claude CLI 可能直接写入真实路径 /private/tmp，保留兜底）
  if (value.startsWith("/private/tmp/")) {
    return `${normalizedCwd}/${value.slice("/private/tmp/".length)}`;
  }
  if (value === "/private/tmp") {
    return normalizedCwd;
  }

  // 层3：Linux/旧 macOS /tmp
  if (value.startsWith("/tmp/")) {
    return `${normalizedCwd}/${value.slice("/tmp/".length)}`;
  }
  if (value === "/tmp") {
    return normalizedCwd;
  }

  return value;
}

function rewriteTmpPathsInBashCommand(command: string): string {
  let updated = command;
  updated = updated.replace(/\/private\/tmp\//g, "./");
  updated = updated.replace(/\/tmp\//g, "./");
  updated = updated.replace(/(^|[\s"'=:(])\/private\/tmp(?=($|[\s"'`;:&)]))/g, "$1.");
  updated = updated.replace(/(^|[\s"'=:(])\/tmp(?=($|[\s"'`;:&)]))/g, "$1.");
  return updated;
}

function rewriteTmpPathsInInput(value: unknown, cwd: string, keyHint?: string): unknown {
  if (typeof value === "string") {
    if (keyHint && TOOL_PATH_KEY_PATTERN.test(keyHint)) {
      return rewriteTmpPathToCwd(value, cwd);
    }
    return value;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const updated = rewriteTmpPathsInInput(item, cwd);
      if (updated !== item) changed = true;
      return updated;
    });
    return changed ? next : value;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      const updated = rewriteTmpPathsInInput(val, cwd, key);
      if (updated !== val) changed = true;
      next[key] = updated;
    }
    return changed ? next : value;
  }
  return value;
}

/** 将相对路径解析为绝对路径（基于 cwd），仅处理字符串值 */
function resolveRelativePath(value: string, cwd: string): string {
  if (!value || !cwd) return value;
  // 已是绝对路径，直接返回
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return value;
  // 跳过特殊前缀
  if (value.startsWith('~') || value.startsWith('$')) return value;
  return join(cwd, value);
}

function normalizeToolInput(toolName: string, input: Record<string, unknown>, cwd: string): Record<string, unknown> {
  if (!cwd) return input;
  if (!input || typeof input !== "object") {
    return input as Record<string, unknown>;
  }
  if (toolName === "Bash") {
    const record = input as Record<string, unknown>;
    const command = record.command;
    if (typeof command === "string") {
      const updatedCommand = rewriteTmpPathsInBashCommand(command);
      if (updatedCommand !== command) {
        return { ...record, command: updatedCommand };
      }
    }
    return input;
  }
  // 文件操作工具：将 file_path 相对路径解析为绝对路径
  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit' || toolName === 'Glob' || toolName === 'Grep') {
    const record = input as Record<string, unknown>;
    const filePathKey = 'file_path';
    const pathKey = 'path';
    let changed = false;
    const updated: Record<string, unknown> = { ...record };
    if (typeof record[filePathKey] === 'string') {
      const resolved = resolveRelativePath(record[filePathKey] as string, cwd);
      if (resolved !== record[filePathKey]) { updated[filePathKey] = resolved; changed = true; }
    }
    if (typeof record[pathKey] === 'string') {
      const resolved = resolveRelativePath(record[pathKey] as string, cwd);
      if (resolved !== record[pathKey]) { updated[pathKey] = resolved; changed = true; }
    }
    if (changed) return updated;
  }
  // NotebookEdit: resolve notebook_path
  if (toolName === 'NotebookEdit') {
    const record = input as Record<string, unknown>;
    if (typeof record.notebook_path === 'string') {
      const resolved = resolveRelativePath(record.notebook_path, cwd);
      if (resolved !== record.notebook_path) {
        return { ...record, notebook_path: resolved };
      }
    }
    return input;
  }
  const rewritten = rewriteTmpPathsInInput(input, cwd);
  if (rewritten && typeof rewritten === "object" && !Array.isArray(rewritten)) {
    return rewritten as Record<string, unknown>;
  }
  return input;
}

/**
 * 从 SDK result 消息中提取使用量信息
 * 代理模式下调用后台 API 获取真实积分，直连模式用本地计算
 */
async function extractUsageFromResult(message: SDKResultMessage, model: string, isProxy: boolean): Promise<MessageUsageInfo | null> {
  const usage = message.usage;
  const totalCost = message.total_cost_usd;
  const durationMs = message.duration_ms;

  if (!usage) {
    return null;
  }

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens = (usage as any).cache_read_input_tokens ?? 0;
  const cacheWriteTokens = (usage as any).cache_creation_input_tokens ?? 0;

  let cost = totalCost ?? 0;
  let inputCost = 0;
  let outputCost = 0;

  if (isProxy) {
    // 代理模式：调后台 API 获取真实积分
    try {
      const result = await proxyRequest<{ totalCredits: number; inputCredits: number; outputCredits: number }>(
        `/usage/calculate?model=${encodeURIComponent(model)}&input=${inputTokens}&output=${outputTokens}&cacheRead=${cacheReadTokens}&cacheWrite=${cacheWriteTokens}`,
        { method: 'GET' }
      );
      // 积分转换为 USD 格式（前端 formatUsdToCredits 会再转回积分）
      // 1 积分 = 0.1 RMB, 1 USD ≈ 7.2 RMB → 1 USD = 72 积分 → credits / 72 = USD
      const totalCredits = result.totalCredits;
      cost = totalCredits / 72;
      inputCost = result.inputCredits / 72;
      outputCost = result.outputCredits / 72;
    } catch (err) {
      console.warn('[runner] Failed to fetch credits from API, falling back to local calculation:', err);
      // 回退到本地计算
      const pricing = getModelPricing(model);
      inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
      outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
      cost = inputCost + outputCost;
    }
  } else if (totalCost) {
    cost = totalCost;
    const pricing = getModelPricing(model);
    const inputRatio = pricing.inputPerMillion / (pricing.inputPerMillion + pricing.outputPerMillion);
    inputCost = cost * inputRatio;
    outputCost = cost - inputCost;
  } else {
    const pricing = getModelPricing(model);
    inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
    outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
    cost = inputCost + outputCost;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cost,
    costBreakdown: {
      inputCost,
      outputCost,
    },
    latencyMs: durationMs ?? 0,
    model,
    provider: 'anthropic',
  };
}

/**
 * 获取模型定价配置
 */
function getModelPricing(model: string): { inputPerMillion: number; outputPerMillion: number } {
  // Claude 模型定价 (Anthropic 官方价格)
  const PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
    // Claude 3.5 Sonnet
    'claude-3-5-sonnet-20241022': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    'claude-sonnet-4-20250514': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    // Claude 3.5 Haiku
    'claude-3-5-haiku-20241022': { inputPerMillion: 0.80, outputPerMillion: 4.0 },
    // Claude 3 Opus
    'claude-3-opus-20240229': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
    // Claude Opus 4
    'claude-opus-4-20250514': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
    // Claude 3 Haiku (Legacy)
    'claude-3-haiku-20240307': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
    // Claude 3 Sonnet (Legacy)
    'claude-3-sonnet-20240229': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  };

  // 尝试精确匹配
  if (PRICING[model]) {
    return PRICING[model];
  }

  // 模糊匹配
  const normalizedModel = model.toLowerCase();

  if (normalizedModel.includes('opus')) {
    if (normalizedModel.includes('4')) {
      return { inputPerMillion: 15.0, outputPerMillion: 75.0 };
    }
    return { inputPerMillion: 15.0, outputPerMillion: 75.0 };
  }

  if (normalizedModel.includes('sonnet')) {
    if (normalizedModel.includes('3.5') || normalizedModel.includes('3-5')) {
      return { inputPerMillion: 3.0, outputPerMillion: 15.0 };
    }
    if (normalizedModel.includes('4')) {
      return { inputPerMillion: 3.0, outputPerMillion: 15.0 };
    }
    return { inputPerMillion: 3.0, outputPerMillion: 15.0 };
  }

  if (normalizedModel.includes('haiku')) {
    if (normalizedModel.includes('3.5') || normalizedModel.includes('3-5')) {
      return { inputPerMillion: 0.80, outputPerMillion: 4.0 };
    }
    return { inputPerMillion: 0.25, outputPerMillion: 1.25 };
  }

  // 默认使用 Sonnet 定价
  console.warn(`[runner] Unknown model "${model}", using default pricing (Sonnet)`);
  return { inputPerMillion: 3.0, outputPerMillion: 15.0 };
}

/**
 * 构建增强的提示词，注入记忆和技能上下文
 */
function buildEnhancedPrompt(prompt: string, contextInjection?: ContextInjection): string {
  if (!contextInjection) {
    return prompt;
  }

  const parts: string[] = [];

  // 注入记忆上下文
  if (contextInjection.memoryContext && contextInjection.memoryContext.trim()) {
    parts.push("<user-memory>");
    parts.push(contextInjection.memoryContext.trim());
    parts.push("</user-memory>");
  }

  // 注入技能摘要（仅名称+描述，全文通过 Skill tool 按需加载）
  if (contextInjection.skillContext && contextInjection.skillContext.trim()) {
    parts.push("<skill-context>");
    parts.push("The following skills are available in this session. When a task matches a skill's purpose, you MUST invoke it using the Skill tool (e.g., Skill(\"skill-name\")) to load its full instructions before proceeding. Do NOT attempt to apply a skill based solely on this summary — always load the complete skill content first.\n");
    parts.push(contextInjection.skillContext);
    parts.push("</skill-context>");
  }

  // 注入历史对话（SDK 会话失效时的上下文恢复）
  if (contextInjection.historyContext && contextInjection.historyContext.trim()) {
    parts.push("<conversation-history>");
    parts.push("以下是本会话的历史对话记录，仅供参考上下文，请勿重复复述。当前用户问题在下方分隔线之后。");
    parts.push(contextInjection.historyContext.trim());
    parts.push("</conversation-history>");
  }

  // 注入自定义系统提示
  if (contextInjection.customSystemPrompt && contextInjection.customSystemPrompt.trim()) {
    parts.push("<custom-instructions>");
    parts.push(contextInjection.customSystemPrompt);
    parts.push("</custom-instructions>");
  }

  // 如果有任何上下文注入，添加分隔符和说明
  if (parts.length > 0) {
    return `${parts.join("\n\n")}\n\n---\n\n${prompt}`;
  }

  return prompt;
}

export async function runClaude(options: RunnerOptions): Promise<RunnerHandle> {
  const { prompt, images, model, session, resumeSessionId, onEvent, onSessionUpdate, isNewSession = false, contextInjection, permissionMode = 'bypassPermissions', thinkingEffort = 'medium' } = options;
  const abortController = new AbortController();

  // ── 诊断系统：初始化本会话的诊断实例 ───────────────────────────────────────
  const diag = diagnosticsRegistry.getOrCreate(session.id);
  diag.record(DiagnosticEventKind.spawn, { sessionId: session.id, model: model ?? 'unknown' });
  // ───────────────────────────────────────────────────────────────────────────

  let earlyExitTriggered = false;
  let currentModel = process.env.VITE_DEFAULT_MODEL || process.env.ANTHROPIC_MODEL || 'unknown'; // 默认模型
  let hasReceivedFirstResponse = false;
  let collectedMessages: StreamMessage[] = [];

  // 构建增强的提示词
  const enhancedPrompt = buildEnhancedPrompt(prompt, contextInjection);

  // 检查是否有图片
  const hasImages = images && images.length > 0;

  /**
   * 构建包含图片的用户消息
   * 当有图片时，使用 SDKUserMessage 格式而非纯字符串
   */
  function buildUserMessageWithImages(): SDKUserMessage {
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } }
    > = [];

    // 添加图片
    if (images && images.length > 0) {
      for (const img of images) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: img.data,
          },
        });
      }
    }

    // 添加文本
    content.push({
      type: "text",
      text: enhancedPrompt,
    });

    return {
      type: "user",
      message: {
        role: "user",
        content,
      },
      parent_tool_use_id: null,
      session_id: session.claudeSessionId || session.id,
    };
  }

  /**
   * 创建用户消息的异步迭代器
   */
  async function* userMessageStream(): AsyncIterable<SDKUserMessage> {
    yield buildUserMessageWithImages();
  }

  const FAST_TITLE_MAX_LENGTH = 48;

  function normalizeTitleForCompare(value: string): string {
    return value.replace(/\s+/g, " ").trim().toLowerCase();
  }

  function buildFastPromptTitle(value: string): string {
    const lines = value
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (lines.length === 0) return "";
    const firstLine = lines[0];
    if (firstLine.length <= FAST_TITLE_MAX_LENGTH) return firstLine;
    return `${firstLine.slice(0, FAST_TITLE_MAX_LENGTH).trim()}...`;
  }

  // 用于标题生成的默认标题检测
  const isDefaultTitle = (title: string) => {
    const normalizedTitle = normalizeTitleForCompare(title);
    if (!normalizedTitle) return true;
    const defaultTitles = ["新对话", "New Session", "New Task", "新建会话"];
    return defaultTitles.some((t) => normalizeTitleForCompare(t) === normalizedTitle);
  };

  // 前端会先把用户首句作为“快速标题”用于秒开体验。
  // 这类标题也应允许被异步 AI 总结覆盖。
  const isFastSeededTitle = (title: string) => {
    const normalizedTitle = normalizeTitleForCompare(title);
    if (!normalizedTitle) return false;

    const candidates = new Set<string>();
    const seededByPrompt = buildFastPromptTitle(prompt);
    if (seededByPrompt) candidates.add(seededByPrompt);

    if (hasImages) {
      candidates.add("图片分析");
      candidates.add("Image Analysis");
    }

    for (const candidate of candidates) {
      if (normalizeTitleForCompare(candidate) === normalizedTitle) {
        return true;
      }
    }
    return false;
  };

  // 触发自动标题生成
  const triggerAutoTitleGeneration = async () => {
    // 仅新会话触发，避免继续对话时意外覆盖用户手改标题
    if (!isNewSession) {
      return;
    }

    // 标题是默认占位符或快速首句标题时，才执行异步总结
    if (!isDefaultTitle(session.title) && !isFastSeededTitle(session.title)) {
      return;
    }

    // OpenAI/Codex 模型不走这个标题生成链路，避免跨模型额外请求
    const normalizedModel = (model || "").trim().toLowerCase();
    if (normalizedModel && !normalizedModel.includes("claude") && !normalizedModel.includes("anthropic")) {
      return;
    }

    // 添加用户 prompt 到消息列表
    collectedMessages.unshift({ type: "user_prompt", prompt });

    // 通知前端正在生成标题
    onEvent({
      type: "session.titleUpdated",
      payload: { sessionId: session.id, title: session.title, isGenerating: true }
    });

    try {
      const result = await generateTitle(collectedMessages);
      if (result.success) {
        onSessionUpdate?.({ title: result.title });
        onEvent({
          type: "session.titleUpdated",
          payload: { sessionId: session.id, title: result.title, isGenerating: false }
        });
      } else {
        onEvent({
          type: "session.titleUpdated",
          payload: { sessionId: session.id, title: session.title, isGenerating: false }
        });
      }
    } catch (error) {
      console.error("[runner] Failed to auto-generate title:", error);
      onEvent({
        type: "session.titleUpdated",
        payload: { sessionId: session.id, title: session.title, isGenerating: false }
      });
    }
  };

  const sendMessage = (message: SDKMessage, usageInfo?: MessageUsageInfo) => {
    // ── dev logging ────────────────────────────────────────────────────────────
    if (message.type === 'assistant') {
      const blocks: unknown[] = (message as any).message?.content ?? [];
      for (const block of blocks) {
        if ((block as any)?.type === 'tool_use') {
          devLog.runner.tool((block as any).name, (block as any).input);
        } else if ((block as any)?.type === 'thinking') {
          devLog.runner.thinking((block as any).thinking ?? '');
        }
      }
    } else if (message.type === 'result') {
      const usage = (message as any).usage;
      devLog.runner.result(
        (message as any).subtype ?? 'unknown',
        usage ? { input: usage.input_tokens, output: usage.output_tokens, cache_read: usage.cache_read_input_tokens } : undefined
      );
    }
    // ──────────────────────────────────────────────────────────────────────────
    // 如果有使用量信息，附加到消息上
    const extendedMessage: ExtendedStreamMessage = usageInfo
      ? { ...message, _usage: usageInfo }
      : message;

    onEvent({
      type: "stream.message",
      payload: { sessionId: session.id, message: extendedMessage as SDKMessage }
    });
  };

  const sendPermissionRequest = (toolUseId: string, toolName: string, input: unknown) => {
    onEvent({
      type: "permission.request",
      payload: { sessionId: session.id, toolUseId, toolName, input }
    });
  };

  // 子进程 PID 追踪：用于 Windows 进程树清理（taskkill /T /F）
  let lastChildPid: number | undefined;

  // Start the query in the background
  (async () => {
    // ── 等待反馈：渐进式静默提示 + stderr 真重试检测 ──────────────────────
    // 两层机制：
    // 第一层：静默超时 → 渐进式等待文案（不叫"重试"，因为可能只是模型在思考）
    // 第二层：stderr 检测到 429/529/overloaded → 真正的重试状态
    const SILENCE_PHASE_THRESHOLDS = [
      { ms: 10_000, phase: 'thinking' as const },  // 10s+: "模型正在深度思考"
      { ms: 30_000, phase: 'long' as const },       // 30s+: "响应时间较长"
      { ms: 60_000, phase: 'timeout' as const },    // 60s+: "等待时间过长"
    ];
    let silenceStartTime = 0; // 静默计时起点（Date.now()）
    let currentWaitingPhase: 'thinking' | 'long' | 'timeout' | null = null;
    let isApiRetrying = false; // 仅 stderr 检测到真正重试时为 true
    let retryAttemptCount = 0; // 0 = 未在重试；>0 = 当前重试次数
    let hasFatalAuthError = false;
    // Tracks the type of fatal error detected mid-stream, so the AbortError catch
    // block can emit a proper session.status event instead of silently returning.
    let fatalErrorType: FatalRunnerErrorType | null = null;
    let fatalErrorMessage: string | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    /** 发送真正的 API 重试状态（stderr 检测到 429/529 等） */
    const emitRetryStatus = () => {
      isApiRetrying = true;
      retryAttemptCount += 1;
      devLog.runner.retry(retryAttemptCount);
      onEvent({
        type: "session.status",
        payload: {
          sessionId: session.id,
          status: "running",
          metadata: { isRetrying: true, waitingPhase: null }
        }
      });
    };

    /** 发送渐进式等待阶段状态 */
    const emitWaitingPhase = (phase: 'thinking' | 'long' | 'timeout') => {
      if (currentWaitingPhase === phase) return; // 避免重复发送同阶段
      currentWaitingPhase = phase;
      onEvent({
        type: "session.status",
        payload: {
          sessionId: session.id,
          status: "running",
          metadata: { isRetrying: false, waitingPhase: phase }
        }
      });
    };

    /** 清除所有等待/重试状态 */
    const clearRetryStatus = () => {
      if (!isApiRetrying && !currentWaitingPhase) return;
      isApiRetrying = false;
      currentWaitingPhase = null;
      retryAttemptCount = 0;
      onEvent({
        type: "session.status",
        payload: {
          sessionId: session.id,
          status: "running",
          metadata: { isRetrying: false, waitingPhase: null }
        }
      });
    };

    const clearSilenceTimer = () => {
      if (silenceTimer !== null) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    };

    const scheduleSilenceTimer = () => {
      clearSilenceTimer();
      // 如果处于真正的 API 重试状态，不启动渐进式等待计时器
      if (isApiRetrying) return;
      if (silenceStartTime === 0) silenceStartTime = Date.now();

      // 计算下一个阶段的触发时间
      const elapsed = Date.now() - silenceStartTime;
      const nextThreshold = SILENCE_PHASE_THRESHOLDS.find(t => t.ms > elapsed);
      console.log('[runner:silence] schedule: elapsed=', elapsed, 'nextPhase=', nextThreshold?.phase, 'delay=', nextThreshold ? nextThreshold.ms - elapsed : 'none');

      if (nextThreshold) {
        const delay = nextThreshold.ms - elapsed;
        silenceTimer = setTimeout(() => {
          silenceTimer = null;
          console.log('[runner:silence] FIRED phase=', nextThreshold.phase);
          emitWaitingPhase(nextThreshold.phase);
          // 继续调度下一阶段
          scheduleSilenceTimer();
        }, delay);
      } else {
        // 已到最后阶段（timeout），不再调度
      }
    };
    // ─────────────────────────────────────────────────────────────────────────

    // ── Stall Detector（卡死检测，15s 无消息且无挂起权限） ──────────────────
    const STALL_TIMEOUT_MS = 15_000;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let stallActive = false;

    const clearStallTimer = () => {
      if (stallTimer !== null) { clearTimeout(stallTimer); stallTimer = null; }
    };

    const scheduleStallTimer = () => {
      clearStallTimer();
      stallTimer = setTimeout(() => {
        stallTimer = null;
        // 有挂起权限时不触发 stall（等待用户响应是正常状态）
        if (session.pendingPermissions.size > 0) {
          scheduleStallTimer(); // 权限等待期间持续检查
          return;
        }
        if (!stallActive) {
          stallActive = true;
          diag.stallDetected = true;
          diag.stallReason = `会话运行中超过 ${STALL_TIMEOUT_MS / 1000}s 无 SDK 消息`;
          diag.record(DiagnosticEventKind.stall_detected, { timeoutMs: STALL_TIMEOUT_MS });
          console.warn(`[runner] Stall detected for session ${session.id}: no SDK message for ${STALL_TIMEOUT_MS / 1000}s`);
        }
        scheduleStallTimer(); // 持续检测
      }, STALL_TIMEOUT_MS);
    };

    const resetStallDetector = () => {
      if (stallActive) {
        stallActive = false;
        diag.stallDetected = false;
        diag.stallReason = undefined;
        diag.record(DiagnosticEventKind.stall_recovered, {});
      }
      scheduleStallTimer();
    };
    // ────────────────────────────────────────────────────────────────────────

    // bashStartTimes 声明在 try 外部，确保异常路径也能清理
    const bashStartTimes = new Map<string, number>();
    // 全工具计时：tool_use_id → { name, startMs }（仅 dev 模式填充）
    const allToolTimes = new Map<string, { name: string; startMs: number }>();
    try {
      // 获取当前配置 (异步,支持代理模式)
      const config = await getCurrentApiConfig(model);

      if (!config) {
        const errorMessage = "未登录或未配置 API。请先登录以使用云端服务,或配置本地 API Key。";
        console.error("[runner]", errorMessage);
        onEvent({
          type: "session.status",
          payload: {
            sessionId: session.id,
            status: "error",
            title: session.title,
            cwd: session.cwd,
            modelId: session.modelId ?? model,
            error: errorMessage,
            metadata: {
              needsAuth: true,
              errorType: "UnauthenticatedError"
            }
          }
        });
        return;
      }

      // 记录并锁定用户选定的模型（防止 SDK init 消息覆盖）
      const lockedModel = config.model || currentModel;
      currentModel = lockedModel;

      // 检查是否是代理模式
      const isProxyMode = 'isProxy' in config && config.isProxy;
      if (isProxyMode) {
        console.info("[runner] Using proxy mode with cloud service");
      } else {
        console.info("[runner] Using direct mode with local API key");
      }

      // 使用 Anthropic SDK — 并行构建环境变量 + 按需准备 skills plugin
      const shouldAttachSkillsPlugin = shouldLoadSkillsPlugin(contextInjection);
      const skillsPluginPath = shouldAttachSkillsPlugin
        ? (ensureSkillsPluginManifestCached(), getSkillsPluginRoot())
        : undefined;
      const env = await buildEnvForConfig(config);
      const mergedEnv = await getEnhancedEnv(config, env);

      // 记录使用的工作目录（修复安装版潜在的 ENOTDIR：session.cwd 可能不是目录）
      const fallbackCwd = getDefaultCwd();
      const cwdResolution = await resolveEffectiveCwd({
        sessionCwd: session.cwd,
        fallbackCwd,
      });
      const effectiveCwd = cwdResolution.cwd;
      if (cwdResolution.source !== "session") {
        console.warn(
          "[runner] session.cwd invalid, fallback applied:",
          JSON.stringify({
            sessionCwd: session.cwd ?? null,
            fallbackCwd,
            resolvedCwd: effectiveCwd,
            source: cwdResolution.source,
            reason: cwdResolution.reason,
          }),
        );
        onSessionUpdate?.({ cwd: effectiveCwd });
      }
      console.info('[runner] Using cwd:', effectiveCwd, '(session.cwd:', session.cwd, ', fallback:', fallbackCwd, ', source:', cwdResolution.source, ')');

      // 根据是否有图片选择不同的 prompt 格式
      // 有图片时使用 AsyncIterable<SDKUserMessage>，否则使用字符串
      const promptInput = hasImages ? userMessageStream() : enhancedPrompt;
      if (hasImages) {
        console.info('[runner] Sending message with', images!.length, 'image(s)');
      }

      // 定义文件操作相关的工具
      const FILE_OPERATION_TOOLS = new Set([
        'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'mcp__filesystem__read_file', 'mcp__filesystem__read_text_file',
        'mcp__filesystem__read_media_file', 'mcp__filesystem__read_multiple_files',
        'mcp__filesystem__write_file', 'mcp__filesystem__edit_file',
        'mcp__filesystem__create_directory', 'mcp__filesystem__list_directory',
        'mcp__filesystem__list_directory_with_sizes', 'mcp__filesystem__directory_tree',
        'mcp__filesystem__move_file', 'mcp__filesystem__search_files',
        'mcp__filesystem__get_file_info'
      ]);

      // 计算 SDK 权限模式配置
      const sdkPermissionMode = permissionMode === 'bypassPermissions' ? 'bypassPermissions' : 'default';
      const allowDangerouslySkip = permissionMode === 'bypassPermissions';

      console.info('[runner] Using permissionMode:', permissionMode, ', SDK permissionMode:', sdkPermissionMode);
      if (skillsPluginPath) {
        console.info('[runner] Loading skills from plugin directory:', skillsPluginPath);
      } else {
        console.info('[runner] Skills plugin disabled for current session');
      }

      // 根据 thinkingEffort 映射 maxThinkingTokens
      const thinkingTokensMap: Record<string, number> = {
        off: 0,
        low: 2000,
        medium: 10000,
        high: 32000,
      };
      const rawThinkingTokens = thinkingTokensMap[thinkingEffort] ?? 10000;
      // claude-haiku-4-5-20251001 起，Haiku 系列已支持 extended thinking
      // 仅保留 thinkingEffort='off' 时的禁用逻辑（已由 thinkingTokensMap 处理 off→0）
      const maxThinkingTokens = rawThinkingTokens;

      // 从后台读取辅助模型配置（60s 缓存，不阻塞启动）
      const remoteConfig = await getRemoteModelConfig();

      // 创建自定义进程启动器，绕过 SDK patch 的 fork 逻辑
      // 直接用 spawn + ELECTRON_RUN_AS_NODE 替代 fork + ipc
      const claudeSpawner = createClaudeProcessSpawner({
        smallFastModelId: remoteConfig.smallFastModelId,
        onPidAvailable: (pid: number) => { lastChildPid = pid; },
        onStderr: (data: string) => {
          diag.appendStderr(data);
          console.error('[runner:stderr]', data.slice(0, 500));
          const isRetrySignal = /retry|overloaded|rate[\s_-]?limit|429|529|502|503|service[\s_]?unavailable|api[\s_]?error/i.test(data);
          if (isRetrySignal) {
            emitRetryStatus();
            // 真正重试时停止渐进式计时器，让重试状态保持
            clearSilenceTimer();
          }
          // 不可恢复的致命错误（上下文溢出、模型下线等）→ 立即中止，避免无限重试
          const isFatalError = isFatalRunnerStderr(data);
          if (isFatalError && !abortController.signal.aborted) {
            console.warn('[runner] Fatal API error detected in stderr, aborting query:', data.slice(0, 200));
            clearSilenceTimer();
            fatalErrorType = 'fatal_api_error';
            fatalErrorMessage = data;
            abortController.abort();
          }
        },
        onEarlyExit: (code, signal, stderrSnippet) => {
          diag.record(DiagnosticEventKind.early_exit, { code, signal: signal ?? null, stderrSnippet });
          // 用户主动中止时（AbortController.abort()）子进程也会以非零退出，
          // 不应误报为"被杀毒软件阻断"，直接忽略即可
          if (abortController.signal.aborted) {
            clearSilenceTimer();
            return;
          }
          if (earlyExitTriggered) return;

          // 子进程在 5s 内以错误退出 → Windows 上通常是被杀毒软件阻断或 bash 缺失
          // 停止静默计时器并直接抛出可读错误，让会话以 error 状态结束
          earlyExitTriggered = true;
          clearSilenceTimer();
          clearStallTimer();

          // 对话历史已过期（Claude 后端找不到 session ID）：
          // 自动清除 claudeSessionId，下次发消息将开启新对话
          const isConversationNotFound = /no conversation found|conversation.*not found/i.test(stderrSnippet);
          if (isConversationNotFound) {
            console.error('[runner] Conversation not found, resetting session. stderr:', stderrSnippet);
            onSessionUpdate?.({ claudeSessionId: undefined } as any);
            const msg = '对话历史已过期，已自动重置。请重新发送消息，将以新对话继续。';
            onEvent({
              type: "session.status",
              payload: {
                sessionId: session.id,
                status: "error",
                title: session.title,
                modelId: session.modelId ?? model,
                error: msg,
              }
            });
            return;
          }

          let hint = '进程异常退出，请重启应用后重试。';
          if (process.platform === 'win32') {
            const isBashError = /bash.*not found|sh.*not found|ENOENT.*bash|please install Git/i.test(stderrSnippet);
            hint = isBashError
              ? '未检测到 Git for Windows（bash）。\n请安装 Git for Windows 后重试：https://git-scm.com/download/win'
              : '可能被安全软件（Windows Defender / 360 / 火绒）阻断。请将本应用加入白名单后重试。';
          }
          console.error(`[runner] Early exit (code=${code}, signal=${signal}). ${hint} stderr:`, stderrSnippet);
          onEvent({
            type: "session.status",
            payload: {
              sessionId: session.id,
              status: "error",
              title: session.title,
              modelId: session.modelId ?? model,
              error: hint,
            }
          });
        },
      });

      const q = query({
        prompt: promptInput,
        options: {
          model: config.model,
          maxThinkingTokens,
          maxTurns: 100,
          cwd: effectiveCwd,
          resume: resumeSessionId,
          abortController,
          env: mergedEnv,
          pathToClaudeCodeExecutable: getClaudeCodePath(),
          spawnClaudeCodeProcess: claudeSpawner,
          ...(skillsPluginPath ? { plugins: [{ type: "local" as const, path: skillsPluginPath }] } : {}),
          permissionMode: sdkPermissionMode,
          includePartialMessages: true,
          allowDangerouslySkipPermissions: allowDangerouslySkip,
          canUseTool: async (toolName, input, { signal }) => {
            try {
            // ── 契约校验（先于路径规范化）──────────────────────────────────
            const validationErr = validateToolInput(toolName, input);
            if (validationErr) {
              diag.record(DiagnosticEventKind.tool_validation_reject, {
                toolName, errorCode: validationErr.code, field: validationErr.field
              });
              return { behavior: "deny" as const, message: `[契约校验失败] ${validationErr.message}` };
            }
            diag.record(DiagnosticEventKind.tool_validation_ok, { toolName });
            // ────────────────────────────────────────────────────────────────
            const normalizedInput = normalizeToolInput(toolName, input, effectiveCwd);
            if (normalizedInput !== input) {
              console.info(`[runner] Rewrote tool input paths for ${toolName} to use cwd`);
            }

            // 检测 max_tokens 截断导致的空输入。
            // 当 Anthropic API 在流式传输 tool input JSON 时触达 max_tokens 限制，
            // input_json_delta 组装会产生不完整的 JSON（如 {}），缺失必要字段。
            // 此时 SDK 会抛出 InputValidationError，模型随后无限重试同样内容。
            // 在这里提前拒绝并给出明确反馈，引导模型将内容拆分成更小的片段。
            if (toolName === 'Bash') {
              const ni = normalizedInput as Record<string, unknown>;
              if (!ni.command || typeof ni.command !== 'string' || !ni.command.trim()) {
                console.warn(`[runner] Bash tool input truncated (missing command) — input: ${JSON.stringify(ni)}`);
                return {
                  behavior: "deny" as const,
                  message: "Bash tool input is incomplete: command is missing or empty. This usually happens when the response hits the token limit mid-stream. Please retry with a shorter command.",
                };
              }
              // 上限校验：timeout 不得超过 600000ms（SDK 硬上限）
              if (typeof ni.timeout === 'number' && ni.timeout > 600_000) {
                console.warn(`[runner] Bash timeout ${ni.timeout}ms exceeds 600000ms limit, capping`);
                (normalizedInput as Record<string, unknown>).timeout = 600_000;
              }
            }
            if (toolName === 'Read') {
              const ni = normalizedInput as Record<string, unknown>;
              if (!ni.file_path || typeof ni.file_path !== 'string' || !ni.file_path.trim()) {
                console.warn(`[runner] Read tool input truncated (missing file_path) — input: ${JSON.stringify(ni)}`);
                return {
                  behavior: "deny" as const,
                  message: "Read tool input is incomplete: file_path is missing or empty. This usually happens when the response hits the token limit mid-stream.",
                };
              }
            }
            if (toolName === 'Write') {
              const ni = normalizedInput as Record<string, unknown>;
              if (!ni.file_path || ni.content === undefined || ni.content === null || typeof ni.content !== 'string') {
                console.warn(`[runner] Write tool input truncated (missing file_path/content) — input: ${JSON.stringify(ni)}`);
                return {
                  behavior: "deny" as const,
                  message: "Write tool input is incomplete: file_path or content is missing. This usually happens when the response hits the token limit mid-stream. Please split the content into smaller chunks and retry each piece separately.",
                };
              }
            }
            if (toolName === 'Glob') {
              const ni = normalizedInput as Record<string, unknown>;
              if (!ni.pattern || typeof ni.pattern !== 'string' || !ni.pattern.trim()) {
                console.warn(`[runner] Glob tool input truncated (missing pattern) — input: ${JSON.stringify(ni)}`);
                return {
                  behavior: "deny" as const,
                  message: "Glob tool input is incomplete: pattern is missing or empty. This usually happens when the response hits the token limit mid-stream.",
                };
              }
            }
            if (toolName === 'Grep') {
              const ni = normalizedInput as Record<string, unknown>;
              if (!ni.pattern || typeof ni.pattern !== 'string' || !ni.pattern.trim()) {
                console.warn(`[runner] Grep tool input truncated (missing pattern) — input: ${JSON.stringify(ni)}`);
                return {
                  behavior: "deny" as const,
                  message: "Grep tool input is incomplete: pattern is missing or empty. This usually happens when the response hits the token limit mid-stream.",
                };
              }
            }
            if (toolName === 'Edit') {
              const ni = normalizedInput as Record<string, unknown>;
              if (!ni.file_path || ni.old_string === undefined || ni.new_string === undefined) {
                console.warn(`[runner] Edit tool input truncated (missing required fields) — input: ${JSON.stringify(ni)}`);
                return {
                  behavior: "deny" as const,
                  message: "Edit tool input is incomplete: file_path, old_string, or new_string is missing. This usually happens when the response hits the token limit mid-stream. Please retry with smaller content.",
                };
              }
              // 幂等保护：old_string 与 new_string 完全相同时拒绝（无意义编辑，可触发死循环）
              if (typeof ni.old_string === 'string' && ni.old_string === ni.new_string) {
                console.warn(`[runner] Edit tool: old_string === new_string, denying no-op edit`);
                return {
                  behavior: "deny" as const,
                  message: "Edit tool: old_string and new_string are identical — this would be a no-op. Make sure you are actually changing the content.",
                };
              }
            }
            if (toolName === 'NotebookEdit') {
              const ni = normalizedInput as Record<string, unknown>;
              if (!ni.notebook_path || ni.new_source === undefined) {
                console.warn(`[runner] NotebookEdit tool input truncated (missing notebook_path/new_source) — input: ${JSON.stringify(ni)}`);
                return {
                  behavior: "deny" as const,
                  message: "NotebookEdit tool input is incomplete: notebook_path or new_source is missing. This usually happens when the response hits the token limit mid-stream.",
                };
              }
            }

            // AskUserQuestion 总是需要用户确认
            if (toolName === "AskUserQuestion") {
              // 输入完整性校验（max_tokens 截断检测）
              const ni = normalizedInput as Record<string, unknown>;
              if (!ni.questions || !Array.isArray(ni.questions) || ni.questions.length === 0) {
                console.warn(`[runner] AskUserQuestion input truncated (missing questions) — input: ${JSON.stringify(ni)}`);
                return {
                  behavior: "deny" as const,
                  message: "AskUserQuestion input is incomplete: questions array is missing or empty. This usually happens when the response hits the token limit mid-stream.",
                };
              }
              // 问题数量上限（SDK 限制 4 个问题）
              if (ni.questions.length > 4) {
                console.warn(`[runner] AskUserQuestion has ${ni.questions.length} questions (max 4) — denying`);
                return {
                  behavior: "deny" as const,
                  message: `AskUserQuestion validation failed: ${ni.questions.length} questions provided, but the maximum allowed is 4. Please split into multiple calls.`,
                };
              }
              if (Array.isArray(ni.questions)) {
                for (const q of ni.questions as Record<string, unknown>[]) {
                  if (Array.isArray(q.options) && q.options.length > 4) {
                    console.warn(`[runner] AskUserQuestion has ${q.options.length} options (max 4) — denying`);
                    return {
                      behavior: "deny" as const,
                      message: `AskUserQuestion validation failed: a question has ${q.options.length} options, but the maximum allowed is 4. Please reduce to 4 options or fewer per question, or split into multiple questions.`,
                    };
                  }
                  // 每道题至少 2 个选项
                  if (Array.isArray(q.options) && q.options.length < 2) {
                    console.warn(`[runner] AskUserQuestion has ${q.options.length} option(s) (min 2) — denying`);
                    return {
                      behavior: "deny" as const,
                      message: `AskUserQuestion validation failed: a question has only ${q.options.length} option(s), but the minimum is 2. Please add more options.`,
                    };
                  }
                }
              }

              const toolUseId = crypto.randomUUID();

              // Send permission request to frontend
              sendPermissionRequest(toolUseId, toolName, normalizedInput);
              diag.record(DiagnosticEventKind.permission_request, { toolUseId, toolName });
              diag.pendingPermissions.add(toolUseId);

              // Create a promise that will be resolved when user responds
              return new Promise<PermissionResult>((resolve) => {
                // 5 分钟无响应自动 deny（防止前端崩溃后会话永久卡死）
                const permTimeout = setTimeout(() => {
                  if (session.pendingPermissions.delete(toolUseId)) {
                    console.warn(`[runner] Permission request ${toolUseId} timed out after 5 minutes`);
                    resolve({ behavior: "deny", message: "Permission request timed out after 5 minutes. Session will continue." });
                  }
                }, 5 * 60 * 1000);

                session.pendingPermissions.set(toolUseId, {
                  toolUseId,
                  toolName,
                  input: normalizedInput,
                  resolve: (result) => {
                    clearTimeout(permTimeout);
                    session.pendingPermissions.delete(toolUseId);
                    diag.pendingPermissions.delete(toolUseId);
                    diag.record(DiagnosticEventKind.permission_resolve, { toolUseId, behavior: (result as any).behavior });
                    resolve(result as PermissionResult);
                  }
                });

                // Handle abort
                signal.addEventListener("abort", () => {
                  clearTimeout(permTimeout);
                  session.pendingPermissions.delete(toolUseId);
                  diag.pendingPermissions.delete(toolUseId);
                  resolve({ behavior: "deny", message: "Session aborted" });
                }, { once: true });
              });
            }

            // 根据 permissionMode 处理权限
            switch (permissionMode) {
              case 'bypassPermissions':
                // 自动批准所有工具
                return { behavior: "allow", updatedInput: normalizedInput };

              case 'acceptEdits':
                // 只自动批准文件操作相关的工具
                if (FILE_OPERATION_TOOLS.has(toolName)) {
                  return { behavior: "allow", updatedInput: normalizedInput };
                }
                // 其他工具需要用户确认
                {
                  const toolUseId = crypto.randomUUID();
                  sendPermissionRequest(toolUseId, toolName, normalizedInput);
                  diag.record(DiagnosticEventKind.permission_request, { toolUseId, toolName });
                  diag.pendingPermissions.add(toolUseId);

                  return new Promise<PermissionResult>((resolve) => {
                    const permTimeout = setTimeout(() => {
                      if (session.pendingPermissions.delete(toolUseId)) {
                        console.warn(`[runner] Permission request ${toolUseId} timed out after 5 minutes`);
                        resolve({ behavior: "deny", message: "Permission request timed out after 5 minutes. Session will continue." });
                      }
                    }, 5 * 60 * 1000);

                    session.pendingPermissions.set(toolUseId, {
                      toolUseId,
                      toolName,
                      input: normalizedInput,
                      resolve: (result) => {
                        clearTimeout(permTimeout);
                        session.pendingPermissions.delete(toolUseId);
                        diag.pendingPermissions.delete(toolUseId);
                        diag.record(DiagnosticEventKind.permission_resolve, { toolUseId, behavior: (result as any).behavior });
                        resolve(result as PermissionResult);
                      }
                    });

                    signal.addEventListener("abort", () => {
                      clearTimeout(permTimeout);
                      session.pendingPermissions.delete(toolUseId);
                      diag.pendingPermissions.delete(toolUseId);
                      resolve({ behavior: "deny", message: "Session aborted" });
                    }, { once: true });
                  });
                }

              case 'default':
              default:
                // 所有工具都需要用户确认
                {
                  const toolUseId = crypto.randomUUID();
                  sendPermissionRequest(toolUseId, toolName, normalizedInput);
                  diag.record(DiagnosticEventKind.permission_request, { toolUseId, toolName });
                  diag.pendingPermissions.add(toolUseId);

                  return new Promise<PermissionResult>((resolve) => {
                    const permTimeout = setTimeout(() => {
                      if (session.pendingPermissions.delete(toolUseId)) {
                        console.warn(`[runner] Permission request ${toolUseId} timed out after 5 minutes`);
                        resolve({ behavior: "deny", message: "Permission request timed out after 5 minutes. Session will continue." });
                      }
                    }, 5 * 60 * 1000);

                    session.pendingPermissions.set(toolUseId, {
                      toolUseId,
                      toolName,
                      input: normalizedInput,
                      resolve: (result) => {
                        clearTimeout(permTimeout);
                        session.pendingPermissions.delete(toolUseId);
                        diag.pendingPermissions.delete(toolUseId);
                        diag.record(DiagnosticEventKind.permission_resolve, { toolUseId, behavior: (result as any).behavior });
                        resolve(result as PermissionResult);
                      }
                    });

                    signal.addEventListener("abort", () => {
                      clearTimeout(permTimeout);
                      session.pendingPermissions.delete(toolUseId);
                      diag.pendingPermissions.delete(toolUseId);
                      resolve({ behavior: "deny", message: "Session aborted" });
                    }, { once: true });
                  });
                }
            }
            } catch (err) {
              console.error(`[runner] canUseTool threw unexpectedly for ${toolName}:`, err);
              return {
                behavior: "deny" as const,
                message: `Tool validation error for ${toolName}: ${err instanceof Error ? err.message : String(err)}`,
              };
            }
          },
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [async (input: any) => {
                  bashStartTimes.set(input.tool_use_id as string, Date.now());
                  return {};
                }]
              },
              // ── dev: 记录所有工具的开始时间（matcher 省略 = 匹配全部） ──────
              ...( IS_DEV_MODE ? [{
                hooks: [async (input: any) => {
                  const id   = (input.tool_use_id ?? '') as string;
                  const name = (input.tool_name   ?? 'unknown') as string;
                  allToolTimes.set(id, { name, startMs: Date.now() });
                  return {};
                }]
              }] : []),
              // ─────────────────────────────────────────────────────────────
            ],
            PostToolUse: [
              {
                matcher: 'Bash',
                hooks: [async (input: any) => {
                  const startMs = bashStartTimes.get(input.tool_use_id as string) ?? Date.now();
                  bashStartTimes.delete(input.tool_use_id as string);
                  const cwd = ((input.tool_input as any)?.cwd as string | undefined) ?? effectiveCwd;
                  if (!cwd) return {};
                  const newFiles = await findFilesCreatedAfter(cwd, startMs);
                  if (newFiles.length > 0) {
                    sendMessage({
                      type: 'system',
                      subtype: 'files_persisted',
                      files: newFiles,
                    } as unknown as SDKMessage);
                  }
                  return {};
                }]
              },
              // ── dev: 记录所有工具的耗时和结果预览 ──────────────────────────
              ...( IS_DEV_MODE ? [{
                hooks: [async (input: any) => {
                  const id    = (input.tool_use_id ?? '') as string;
                  const entry = allToolTimes.get(id);
                  if (!entry) return {};
                  allToolTimes.delete(id);
                  const durationMs = Date.now() - entry.startMs;
                  // tool_response 是 PostToolUseHookInput 的正确字段
                  const raw     = (input as any).tool_response;
                  const preview = raw == null ? undefined
                    : typeof raw === 'string' ? raw
                    : JSON.stringify(raw);
                  devLog.runner.toolEnd(entry.name, durationMs, preview);
                  return {};
                }]
              }] : []),
              // ─────────────────────────────────────────────────────────────
            ],
            // ── dev: 工具执行失败钩子 ───────────────────────────────────────
            ...( IS_DEV_MODE ? {
              PostToolUseFailure: [{
                hooks: [async (input: any) => {
                  devLog.runner.toolFail(
                    (input.tool_name ?? 'unknown') as string,
                    (input.error ?? input.message) as string,
                  );
                  return {};
                }]
              }]
            } : {}),
            // ─────────────────────────────────────────────────────────────
          },
        }
      });

      let finalStatusFromResult: "completed" | "error" | null = null;

      // 启动首次静默计时器：SDK 开始处理请求，等待第一个消息
      devLog.runner.query(session.id, prompt.slice(0, 80));
      scheduleSilenceTimer();
      // 启动 stall 检测器（独立于 retry 计时器）
      scheduleStallTimer();

      // Capture session_id from init message
      for await (const message of q) {
        // 更新诊断：消息计数 + 重置 stall 检测器
        diag.metrics.messageCount++;
        resetStallDetector();

        // 判断是否为实质性内容输出（assistant text，非 thinking）
        // thinking 阶段 SDK 持续发送消息但用户看不到文本输出，不应 reset 等待计时器
        const isSubstantiveOutput = (() => {
          if (message.type === "assistant") {
            const contents = (message as any).message?.content;
            if (Array.isArray(contents)) {
              return contents.some((b: any) => b?.type === 'text' && typeof b.text === 'string' && b.text.length > 0);
            }
          }
          // tool_use / result 也算实质性输出
          if (message.type === "result") return true;
          return false;
        })();

        if (isSubstantiveOutput) {
          // 有实质性输出：重置静默计时器，清除等待/重试状态
          clearSilenceTimer();
          silenceStartTime = 0;
          if (isApiRetrying || currentWaitingPhase) clearRetryStatus();
          scheduleSilenceTimer();
        }
        // 非实质性消息（system.init, thinking delta 等）不 reset timer

        // Extract session_id and model from system init message
        if (message.type === "system" && "subtype" in message && message.subtype === "init") {
          const sdkSessionId = (message as any).session_id;
          const initModel    = (message as any).model as string | undefined;
          devLog.runner.init(sdkSessionId ?? session.id, initModel ?? lockedModel);
          if (sdkSessionId) {
            session.claudeSessionId = sdkSessionId;
            onSessionUpdate?.({ claudeSessionId: sdkSessionId });
          }
          // 从 init 消息中检测模型漂移
          if (initModel) {
            // Strip optional date suffix (e.g., -20251101) before comparing
            const normalizeModelId = (m: string) => m.replace(/-\d{8}$/, '');
            if (normalizeModelId(initModel) !== normalizeModelId(lockedModel)) {
              console.warn('[runner] Model drift detected: SDK init.model=', initModel, ', user-selected=', lockedModel, '. Keeping user-selected model for billing.');
              onEvent({
                type: "session.status",
                payload: {
                  sessionId: session.id,
                  status: "running",
                  metadata: { modelDrift: true, requestedModel: lockedModel, actualModel: initModel }
                }
              });
            }
          }
        }

        // Handle compacting status updates
        if (message.type === "system" && "subtype" in message && message.subtype === "status") {
          const statusValue = (message as any).status;
          if (statusValue === "compacting") {
            onEvent({
              type: "session.compacting",
              payload: { sessionId: session.id, isCompacting: true }
            });
          } else if (statusValue === null || statusValue === undefined) {
            onEvent({
              type: "session.compacting",
              payload: { sessionId: session.id, isCompacting: false }
            });
          }
        }

        // Handle compact boundary message
        if (message.type === "system" && "subtype" in message && message.subtype === "compact_boundary") {
          const metadata = (message as any).compact_metadata ?? (message as any).compactMetadata;
          const trigger = metadata?.trigger ?? "auto";
          const preTokens = metadata?.pre_tokens ?? metadata?.preTokens ?? 0;
          devLog.runner.compact(trigger, preTokens);
          onEvent({
            type: "session.compact",
            payload: { sessionId: session.id, trigger, preTokens }
          });
        }

        // 收集消息用于标题生成（只收集前几条真正有标题价值的消息）
        const shouldCollectForAutoTitle = shouldCollectAutoTitleMessage(message as SDKMessage);
        if (collectedMessages.length < 10 && shouldCollectForAutoTitle) {
          collectedMessages.push(message as StreamMessage);
        }

        // 仅在收到真正的助手内容或成功结果后才触发自动标题生成
        if (!hasReceivedFirstResponse && shouldCollectForAutoTitle) {
          hasReceivedFirstResponse = true;
          // 异步触发标题生成，不阻塞主流程
          setTimeout(() => {
            triggerAutoTitleGeneration().catch((err) => {
              console.error("[runner] Auto title generation error:", err);
            });
          }, 100);
        }

        // 检测 assistant 消息中的认证错误 / 积分不足错误
        if (message.type === "assistant" && (message as any).error) {
          const msgError = (message as any).error as string;
          if (msgError === 'authentication_failed' || isLoginRequiredRunnerError(msgError)) {
            hasFatalAuthError = true;
            fatalErrorType = 'login_required';
            console.warn('[runner] Authentication error in assistant message:', msgError);
          }
        }

        // 检测 assistant 消息 content 中的积分不足文本 → 立刻 abort，停止重试
        if (message.type === "assistant") {
          const contents = (message as any).message?.content;
          if (Array.isArray(contents)) {
            const hasBalance = contents.some(
              (b: any) => b?.type === 'text' && typeof b.text === 'string' && isBalanceRunnerError(b.text)
            );
            if (hasBalance) {
              console.warn('[runner] Balance insufficient detected in assistant message, aborting query.');
              clearSilenceTimer();
              fatalErrorType = 'insufficient_balance';
              abortController.abort();
            }
          }
        }

        // Check for result to extract usage.
        // 状态变更延后到流结束后统一发送，避免“通知已完成”早于最后一段内容渲染。
        if (message.type === "result") {
          // pause_turn: server-side tool loop hit its iteration limit; session is paused, not truly done.
          // We can't seamlessly resume in the current UI, so treat as idle to avoid misleading "completed".
          const stopReason = (message as any).stop_reason as string | undefined;
          if (stopReason === "pause_turn") {
            // pause_turn means the server-side tool sampling loop hit its iteration limit.
            // The session is paused, not truly finished. Leave finalStatusFromResult as null
            // so it defaults to "completed" downstream — the warning in logs signals the real state.
            console.warn('[runner] stop_reason=pause_turn: server sampling loop paused mid-session. User may need to send a follow-up to continue.');
          } else {
            // is_error 为 false 时（如 error_max_turns），AI 已成功输出，视为正常完成
            finalStatusFromResult = (message.subtype === "success" || message.is_error === false) ? "completed" : "error";
          }

          // 检测 result 消息中的认证/积分错误
          if (message.is_error) {
            const errors = (message as any).errors as string[] ?? [];
            if (errors.some((e: string) => isLoginRequiredRunnerError(e))) {
              hasFatalAuthError = true;
              fatalErrorType = 'login_required';
              console.warn('[runner] Authentication error in result errors:', errors);
            }
            if (errors.some((e: string) => isBalanceRunnerError(e))) {
              console.warn('[runner] Balance insufficient detected in result errors, aborting query.');
              clearSilenceTimer();
              fatalErrorType = 'insufficient_balance';
              abortController.abort();
            }
          }

          // 提取使用量信息并附加到 result 消息
          const usageInfo = await extractUsageFromResult(message as SDKResultMessage, currentModel, isProxyMode);
          sendMessage(message, usageInfo || undefined);
        } else {
          // Send message to frontend (without usage info for non-result messages)
          sendMessage(message);
        }
      }

      // Query completed normally
      clearSilenceTimer();
      clearStallTimer();
      if (session.status === "running" && !earlyExitTriggered) {
        // 若收到认证错误但未收到 result 消息，强制设为 error
        if (hasFatalAuthError && !finalStatusFromResult) {
          finalStatusFromResult = "error";
        }

        const finalStatus = finalStatusFromResult ?? "completed";
        onEvent({
          type: "session.status",
          payload: {
            sessionId: session.id,
            status: finalStatus,
            title: session.title,
            modelId: session.modelId ?? model,
            // Use machine-readable error codes so frontend can classify without text matching.
            ...(hasFatalAuthError ? {
              error: 'AUTH_1001',
              metadata: { needsAuth: true, errorType: 'UnauthenticatedError' as const }
            } : {})
          }
        });

      }
    } catch (error) {
      clearSilenceTimer();
      clearStallTimer();
      bashStartTimes.clear();
      allToolTimes.clear();
      if ((error as Error).name === "AbortError") {
        // If this was a self-triggered abort (e.g., balance/auth error detected mid-stream),
        // emit a proper error status so the session doesn't stay stuck in "running" state.
        if (fatalErrorType && session.status === "running" && !earlyExitTriggered) {
          onEvent({
            type: "session.status",
            payload: {
              sessionId: session.id,
              status: "error",
              title: session.title,
              modelId: session.modelId ?? model,
              ...buildFatalRunnerErrorPayload(fatalErrorType, fatalErrorMessage ?? undefined),
            }
          });
        }
        // User-initiated abort or already handled — no error status needed
        return;
      }
      if (earlyExitTriggered) {
        console.warn("[runner] Query rejected after early exit was already handled:", error);
        return;
      }

      // 处理代理服务的特殊错误
      let errorMessage = String(error);
      let shouldRefreshAuth = false;

      if (error instanceof Error) {
        // 使用代理适配器获取友好的错误消息
        errorMessage = getProxyErrorMessage(error);

        // 检查是否需要重新登录
        if (error.name === 'UnauthenticatedError') {
          shouldRefreshAuth = true;
        }
      }

      console.error("[runner] Query failed:", error);

      // 清除过期的 session ID，避免下次重试时用无效 ID 恢复
      // ipc-handlers 检测到无 resumeId 时会自动注入历史记录、以新会话继续
      onSessionUpdate?.({ claudeSessionId: undefined } as any);

      onEvent({
        type: "session.status",
        payload: {
          sessionId: session.id,
          status: "error",
          title: session.title,
          modelId: session.modelId ?? model,
          error: errorMessage,
          // 传递额外的元数据,供前端处理
          metadata: {
            needsAuth: shouldRefreshAuth,
            errorType: error instanceof Error ? error.name : 'unknown'
          }
        }
      });
    }
  })();

  return {
    abort: () => abortController.abort(),
    get pid() { return lastChildPid; },
  };
}
