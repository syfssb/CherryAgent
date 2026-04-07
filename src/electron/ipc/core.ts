import { BrowserWindow, ipcMain, shell, Notification, dialog } from "electron";
import type { ClientEvent, ServerEvent, StreamMessage, PermissionMode } from "../types.js";
import { runClaude, type RunnerHandle } from "../libs/runner.js";
import { ClaudeAgentRunner } from "../libs/agent-runner/claude-runner.js";
import { AgentRunnerFactory } from "../libs/agent-runner/factory.js";
import type { AgentProvider, AgentRunnerHandle, AgentRunnerEvent } from "../libs/agent-runner/types.js";
import {
  isCodexEnabled,
  getFeatureFlags,
  setFeatureFlag,
  resetFeatureFlags,
} from "../libs/feature-flags.js";
import { SessionStore, type Session } from "../libs/session-store.js";
import { TagsStore } from "../libs/tags-store.js";
import { generateTitle } from "../libs/title-generator.js";
import { shouldLoadSkillsPlugin } from "../libs/skill-plugin-policy.js";
import { computeRuntimeEnvPatch } from "../libs/bundled-runtime.js";
import { app } from "electron";
import { join, resolve, normalize, isAbsolute, relative, dirname, basename, extname } from "path";
import { appendLogWithRotation } from "../libs/log-utils.js";
import { readdir, rm, stat, mkdir, copyFile } from "fs/promises";
import Database from "better-sqlite3";
import {
  login,
  loginWithCode,
  logout,
  refresh,
  getAuthStatus,
  getStoredCredentials,
  isAuthenticated,
  getUserInfo,
} from "../libs/auth-service.js";
import { handleDeepLink, notifyAuthResult, type AuthCallbackData } from "../libs/auth-handler.js";
import {
  handleOAuthCallback,
  startOAuthFlow,
  cancelOAuthFlow,
  hasActiveOAuthFlow,
  createOAuthConfig,
  type OAuthFlowConfig,
  type OAuthFlowResult
} from "../libs/oauth-flow.js";
import {
  workspaceWatcher,
  checkWorkspaceExists,
  normalizeWorkspacePath,
  type WorkspaceStatus
} from "../libs/workspace-watcher.js";
import {
  recentWorkspacesStore,
  addRecentWorkspace,
  getRecentWorkspaces,
  removeRecentWorkspace,
  getCommonDirs,
  getSystemTempDir,
  resolveDefaultCwd,
  setDefaultCwdPreference,
  type RecentWorkspace
} from "../libs/recent-workspaces.js";
import { SimpleMemoryStore } from "../libs/simple-memory-store.js";
import { SkillStore, type SkillSearchOptions } from "../libs/skill-store.js";
import { CloudSyncService } from "../libs/cloud-sync.js";
import { syncManagedSkills, listPresetSkills, removeManagedSkillFile, scanUserCreatedSkills } from "../libs/skill-files.js";
import { validateSyntax, type ValidationResult } from "../libs/skill-validator.js";
import type { SkillCreateInput, SkillUpdateInput } from "../types/local-db.js";
import { runMigrations, LATEST_MIGRATION_VERSION } from "../libs/migrations/index.js";
import { getApiBaseUrl } from "../libs/runtime-config.js";
import { VersionGuard } from "@cherry-agent/core";
import { diagnosticsRegistry } from "../libs/diagnostics.js";
import type { DiagnosticSnapshot } from "../libs/diagnostics.js";
import { devLog } from "../libs/dev-logger.js";
import { mapAgentRunnerStatusToSessionStatus } from "./agent-runner-status.js";

let sessions: SessionStore;
let tagsStore: TagsStore;
let memoryStore: SimpleMemoryStore;
let skillStore: SkillStore;
let cloudSyncService: CloudSyncService;
let db: Database.Database;
// ── stream.message 微批处理 ─────────────────────────────────────────────────
// 对高频 stream.message 做微批：批窗口 25ms 或 50 条，降低主进程广播频率
// session.status / permission.request / runner.error 继续实时发送，不参与批处理
const BATCH_WINDOW_MS = 25;
const BATCH_MAX_SIZE  = 50;

type MessageBatch = {
  events: import("../types.js").ServerEvent[];
  timer: ReturnType<typeof setTimeout> | null;
};

const messageBatches = new Map<string, MessageBatch>();

function flushBatch(sessionId: string): void {
  const batch = messageBatches.get(sessionId);
  if (!batch || batch.events.length === 0) return;
  const toSend = batch.events.splice(0);
  if (batch.timer !== null) { clearTimeout(batch.timer); batch.timer = null; }
  // 整批一次性序列化为 JSON 数组，单次 IPC 发送，消除高频小包导致的主进程阻塞
  const payload = JSON.stringify(toSend);
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) { win.webContents.send("server-event", payload); }
  devLog.ipc.flush(sessionId, toSend.length);
}

function enqueueBatch(event: import("../types.js").ServerEvent): void {
  const sessionId = (event as any).payload?.sessionId as string | undefined;
  if (!sessionId) { broadcast(event); return; }
  let batch = messageBatches.get(sessionId);
  if (!batch) { batch = { events: [], timer: null }; messageBatches.set(sessionId, batch); }
  batch.events.push(event);
  if (batch.events.length >= BATCH_MAX_SIZE) { flushBatch(sessionId); return; }
  if (batch.timer === null) {
    batch.timer = setTimeout(() => { batch!.timer = null; flushBatch(sessionId); }, BATCH_WINDOW_MS);
  }
}
// ──────────────────────────────────────────────────────────────────────────────

const runnerHandles = new Map<string, RunnerHandle>();
const pendingRunnerAborts = new Set<string>(); // deferred abort for handles not yet registered
let workspaceClipboardSource: string | null = null;
const pendingCodexAutoTitle = new Map<string, { prompt: string; hasImages: boolean }>();
const FAST_TITLE_MAX_LENGTH = 48;
const DEFAULT_SESSION_TITLES = ["新对话", "New Session", "New Task", "新建会话"];

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

function isDefaultTitle(title: string): boolean {
  const normalized = normalizeTitleForCompare(title);
  if (!normalized) return true;
  return DEFAULT_SESSION_TITLES.some(
    (defaultTitle) => normalizeTitleForCompare(defaultTitle) === normalized,
  );
}

function isFastSeededTitle(title: string, prompt: string, hasImages: boolean): boolean {
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
}

async function triggerCodexAutoTitle(
  sessionId: string,
  context: { prompt: string; hasImages: boolean },
): Promise<void> {
  const session = sessions.getSession(sessionId);
  if (!session || session.provider !== "codex") return;

  const shouldGenerate =
    isDefaultTitle(session.title) ||
    isFastSeededTitle(session.title, context.prompt, context.hasImages);
  if (!shouldGenerate) return;

  emit({
    type: "session.titleUpdated",
    payload: { sessionId, title: session.title, isGenerating: true },
  });

  try {
    const history = sessions.getSessionHistory(sessionId);
    const messages = history?.messages ?? [];
    const result = await generateTitle(messages as StreamMessage[]);

    const liveSession = sessions.getSession(sessionId);
    if (!liveSession) return;

    if (!result.success) {
      emit({
        type: "session.titleUpdated",
        payload: { sessionId, title: liveSession.title, isGenerating: false },
      });
      return;
    }

    // 标题生成期间若用户手改标题，则不覆盖
    const canOverwrite =
      isDefaultTitle(liveSession.title) ||
      isFastSeededTitle(liveSession.title, context.prompt, context.hasImages);
    if (!canOverwrite) {
      emit({
        type: "session.titleUpdated",
        payload: { sessionId, title: liveSession.title, isGenerating: false },
      });
      return;
    }

    sessions.updateSession(sessionId, { title: result.title });
    emit({
      type: "session.titleUpdated",
      payload: { sessionId, title: result.title, isGenerating: false },
    });
  } catch (error) {
    console.error("[ipc-handlers] codex auto title generation failed:", error);
    const liveSession = sessions.getSession(sessionId);
    if (!liveSession) return;
    emit({
      type: "session.titleUpdated",
      payload: { sessionId, title: liveSession.title, isGenerating: false },
    });
  }
}

export function initializeSessions() {
  if (!sessions) {
    const DB_PATH = join(app.getPath("userData"), "sessions.db");
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");   // 防御杀毒软件锁 WAL/SHM 文件导致 SQLITE_BUSY

    // ========== DB 版本回滚保护 ==========
    const guard = new VersionGuard(db, {
      appMaxVersion: LATEST_MIGRATION_VERSION
    });

    // 首次升级：从 schema_migrations 同步 user_version
    guard.syncFromSchemaMigrations();

    const check = guard.check();
    console.info(
      `[version-guard] DB 版本检查: action=${check.action} dbVersion=${check.dbVersion} appMax=${check.appMaxVersion}`
    );

    if (!check.compatible) {
      if (check.action === 'incompatible-newer') {
        // DB 版本比 app 新，弹出错误对话框并退出
        dialog.showErrorBox(
          '数据库版本不兼容',
          check.message + '\n\n应用将退出。'
        );
        app.quit();
        return undefined as unknown as SessionStore;
      }
      // 其他不兼容情况，抛出错误
      throw new Error(check.message);
    }

    // 需要迁移时，先创建备份
    if (check.action === 'migrate-up') {
      try {
        const backupDir = join(dirname(DB_PATH), 'backups');
        const backupPath = guard.createBackup(backupDir);
        console.info(`[version-guard] 迁移前备份完成: ${backupPath}`);
      } catch (backupError) {
        console.error(
          '[version-guard] 备份失败，但继续迁移:',
          backupError instanceof Error ? backupError.message : String(backupError)
        );
      }
    }

    // 运行数据库迁移
    runMigrations(db);

    // 迁移后确保 user_version 同步（runMigrations 内部也会同步，这里做双重保障）
    guard.setDbVersion(LATEST_MIGRATION_VERSION);

    // 创建 CloudSyncService 实例用于同步功能
    // 传递 API URL，确保使用远程 API 而不是本地 API
    const apiBaseUrl = getApiBaseUrl();
    console.log(`[ipc-handlers] 创建 CloudSyncService，apiBaseUrl: ${apiBaseUrl}`);
    cloudSyncService = new CloudSyncService(db, apiBaseUrl);

    sessions = new SessionStore(DB_PATH, cloudSyncService);
    tagsStore = new TagsStore(sessions);
    memoryStore = new SimpleMemoryStore(db, cloudSyncService);
    skillStore = new SkillStore(db, cloudSyncService);
  }
  return sessions;
}

function broadcast(event: ServerEvent) {
  const payload = JSON.stringify(event);
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send("server-event", payload);
  }
}

function hasLiveSession(sessionId: string): boolean {
  if (!sessions) return false;
  return Boolean(sessions.getSession(sessionId));
}

function emit(event: ServerEvent) {
  // If a session was deleted, drop late events that would resurrect it in the UI.
  // (Session history lookups are DB-backed, so these late events commonly lead to "Unknown session".)
  if (
    (event.type === "session.status" ||
      event.type === "stream.message" ||
      event.type === "stream.user_prompt" ||
      event.type === "permission.request" ||
      event.type === "session.titleUpdated") &&
    !hasLiveSession(event.payload.sessionId)
  ) {
    return;
  }

  if (event.type === "session.status") {
    sessions.updateSession(event.payload.sessionId, { status: event.payload.status });
  }
  if (event.type === "stream.message") {
    const now = Date.now();
    const message = event.payload.message as any;
    if (typeof message?._createdAt !== "number") {
      message._createdAt = now;
    }
    const messageType = message?.type;
    if (messageType !== "tool_progress") {
      sessions.recordMessage(event.payload.sessionId, message as StreamMessage);
    }
  }
  if (event.type === "stream.user_prompt") {
    const timestamp =
      typeof event.payload.timestamp === "number" ? event.payload.timestamp : Date.now();
    (event.payload as any).timestamp = timestamp;
    sessions.recordMessage(event.payload.sessionId, {
      type: "user_prompt",
      prompt: event.payload.prompt,
      images: event.payload.images,
      _createdAt: timestamp,
    });
  }
  // stream.message 走微批处理，其他事件实时广播
  if (event.type === "stream.message") {
    enqueueBatch(event);
  } else {
    broadcast(event);
  }
}

/**
 * 将 AgentRunnerEvent 映射为 ServerEvent 并 emit 到 UI
 */
function handleAgentRunnerEvent(
  agentEvent: AgentRunnerEvent,
  sessionId: string,
): void {
  switch (agentEvent.type) {
    case "message": {
      const shouldTriggerAutoTitle =
        agentEvent.message.type === "text" &&
        typeof agentEvent.message.text === "string" &&
        agentEvent.message.text.trim().length > 0 &&
        pendingCodexAutoTitle.has(sessionId);
      const msg = agentEvent.message;
      const messageUuid = crypto.randomUUID();
      // 将 AgentMessage 转换为 Claude SDK 兼容的 StreamMessage 形状
      let streamMessage: StreamMessage;
      switch (msg.type) {
        case "text":
          if (!msg.text && agentEvent.usage) {
            return;
          }
          streamMessage = {
            type: "assistant",
            message: {
              role: "assistant",
              content: [{ type: "text", text: msg.text }],
            },
            parent_tool_use_id: null,
            uuid: messageUuid,
            session_id: sessionId,
          } as unknown as StreamMessage;
          break;
        case "text_delta_start":
          streamMessage = {
            type: "stream_event",
            event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
            uuid: messageUuid,
            session_id: sessionId,
          } as unknown as StreamMessage;
          break;
        case "text_delta":
          streamMessage = {
            type: "stream_event",
            event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: msg.text } },
            uuid: messageUuid,
            session_id: sessionId,
          } as unknown as StreamMessage;
          break;
        case "text_delta_stop":
          streamMessage = {
            type: "stream_event",
            event: { type: "content_block_stop", index: 0 },
            uuid: messageUuid,
            session_id: sessionId,
          } as unknown as StreamMessage;
          break;
        case "thinking":
          streamMessage = {
            type: "assistant",
            message: {
              role: "assistant",
              content: [{ type: "thinking", thinking: msg.thinking }],
            },
            parent_tool_use_id: null,
            uuid: messageUuid,
            session_id: sessionId,
          } as unknown as StreamMessage;
          break;
        case "tool_use":
          streamMessage = {
            type: "assistant",
            message: {
              role: "assistant",
              content: [{
                type: "tool_use",
                id: msg.toolUseId,
                name: msg.toolName,
                input: msg.input,
              }],
            },
            parent_tool_use_id: null,
            uuid: messageUuid,
            session_id: sessionId,
          } as unknown as StreamMessage;
          break;
        case "tool_result":
          streamMessage = {
            type: "user",
            message: {
              role: "user",
              content: [{
                type: "tool_result",
                tool_use_id: msg.toolUseId,
                content: msg.output,
                is_error: msg.isError ?? false,
              }],
            },
            parent_tool_use_id: msg.toolUseId,
            isSynthetic: true,
            uuid: messageUuid,
            session_id: sessionId,
          } as unknown as StreamMessage;
          break;
        case "system": {
          // system init → 提取 session_id
          if (msg.subtype === "init" && msg.sessionId) {
            sessions.updateSession(sessionId, {
              claudeSessionId: msg.sessionId,
              providerThreadId: msg.sessionId,
            } as any);
          }
          // system 消息也转发给 UI 以便显示状态
          streamMessage = {
            type: "system",
            subtype: msg.subtype,
            ...(msg.data != null ? { data: msg.data } : {}),
            uuid: messageUuid,
            session_id: sessionId,
          } as unknown as StreamMessage;
          break;
        }
        default:
          return;
      }

      // 附加 usage 信息
      const extendedMessage = agentEvent.usage
        ? { ...streamMessage, _usage: agentEvent.usage }
        : streamMessage;

      emit({
        type: "stream.message",
        payload: { sessionId, message: extendedMessage as StreamMessage },
      });

      if (shouldTriggerAutoTitle) {
        const context = pendingCodexAutoTitle.get(sessionId);
        if (context) {
          pendingCodexAutoTitle.delete(sessionId);
          setTimeout(() => {
            triggerCodexAutoTitle(sessionId, context).catch((err) => {
              console.error("[ipc-handlers] failed to trigger codex auto title:", err);
            });
          }, 100);
        }
      }
      break;
    }

    case "status": {
      const session = sessions.getSession(sessionId);
      if (!session) return;

      if (agentEvent.status === "idle" || agentEvent.status === "error") {
        pendingCodexAutoTitle.delete(sessionId);
        const status = mapAgentRunnerStatusToSessionStatus(agentEvent.status);
        sessions.updateSession(sessionId, { status });
        emit({
          type: "session.status",
          payload: {
            sessionId,
            status,
            title: session.title,
            cwd: session.cwd,
            modelId: session.modelId,
            ...(agentEvent.error ? { error: agentEvent.error } : {}),
          },
        });
      } else if (agentEvent.status === "compacting") {
        emit({
          type: "session.compacting",
          payload: { sessionId, isCompacting: true },
        });
      }
      break;
    }

    case "session_id": {
      sessions.updateSession(sessionId, {
        claudeSessionId: agentEvent.sessionId,
        providerThreadId: agentEvent.sessionId,
      } as any);
      break;
    }

    case "title_hint": {
      const session = sessions.getSession(sessionId);
      if (!session) return;
      sessions.updateSession(sessionId, { title: agentEvent.title });
      emit({
        type: "session.titleUpdated",
        payload: { sessionId, title: agentEvent.title },
      });
      break;
    }

    case "permission_request": {
      emit({
        type: "permission.request",
        payload: {
          sessionId,
          toolUseId: agentEvent.request.toolUseId,
          toolName: agentEvent.request.toolName,
          input: agentEvent.request.input,
        },
      });
      break;
    }
  }
}

/**
 * 获取上下文注入数据（记忆、技能、工作目录指引）
 */
function getContextInjection(session?: Session): {
  memoryContext?: string;
  skillContext?: string;
  fullSkillContext?: string;
  customSystemPrompt?: string;
  historyContext?: string;
} {
  try {
    const memoryContext = memoryStore.get().content;
    let skillContext: string | undefined;
    let fullSkillContext: string | undefined;
    const skillMode = session?.skillMode ?? "auto";
    const activeSkillIds = session?.activeSkillIds ?? [];
    if (skillMode === "manual") {
      skillContext = activeSkillIds.length > 0
        ? skillStore.getSkillContextSummary({ skillIds: activeSkillIds })
        : "";
      fullSkillContext = activeSkillIds.length > 0
        ? skillStore.getSkillContext({ skillIds: activeSkillIds })
        : "";
    } else {
      skillContext = skillStore.getSkillContextSummary();
      fullSkillContext = skillStore.getSkillContext();
    }
    const enabledCount = skillStore.getEnabledSkills().length;
    const selectedCount = activeSkillIds.length;
    console.info(
      `[skill-context] mode=${skillMode} enabled=${enabledCount} selected=${selectedCount} injected=${skillContext ? skillContext.length : 0}`
    );
    const trimmedCwd = session?.cwd?.trim();
    const cwdInstruction = trimmedCwd
      ? [
          `当前工作目录: ${trimmedCwd}`,
          "所有读写文件必须使用该目录（优先使用相对路径）。",
          "不要把最终产物写到 /tmp。"
        ].join("\n")
      : [
          "当前工作目录由应用设置。",
          "所有读写文件必须使用工作目录（优先使用相对路径）。",
          "不要把最终产物写到 /tmp。"
        ].join("\n");

    // Cherry Agent 身份说明
    const identityPrompt = [
      "# 身份说明",
      "你是 Cherry Agent，由 CherryChat 樱桃茶基于 Claude 模型研发的 AI 助手。",
      "当用户询问你是谁、你是什么模型、你属于哪个公司等相关问题时，请回答：",
      "- 名称：Cherry Agent",
      "- 开发者：CherryChat 樱桃茶",
      "- 基础模型：Claude（Anthropic）",
      "- 定位：智能 AI 助手，专注于帮助用户提升工作效率，完成任何工作"
    ].join("\n");

    // 交互规范：需要用户确认/选择时必须用 AskUserQuestion 工具
    const interactionRules = [
      "# 交互规范",
      "当你需要向用户提问、请求确认、或让用户在多个方案中选择时，必须使用 AskUserQuestion 工具，而不是在回复文本中用数字列表或文字罗列选项。",
      "AskUserQuestion 工具会在 UI 中渲染成可点击的选项卡片，用户直接点击即可回答，无需手动输入。",
      "以下情况必须用 AskUserQuestion：",
      "- 执行破坏性操作（删除、覆盖、重命名）前需要用户确认",
      "- 任务意图不明确，需要用户在多个方案中选择",
      "- 需要用户提供偏好或配置",
    ].join("\n");

    // Widget 可视化能力声明 — Anthropic 设计语言
    const widgetCapability = `<widget-capability>
You have a built-in widget rendering engine. When users ask to visualize, explain with diagrams, compare, or analyze data, you MUST output a \`show-widget\` code fence — NOT plain text, NOT a file. The widget renders directly inline in the chat.

SCOPE: ALL design rules below apply ONLY inside \`show-widget\` code fences. They do NOT apply to any other output (PPT, web pages, HTML files, documents, etc.). When creating non-widget content, use whatever styles are appropriate for that medium.

## Format
\`\`\`show-widget
{"title":"snake_case_id","widget_code":"<svg width=\\"100%\\" viewBox=\\"0 0 680 400\\">...</svg>"}
\`\`\`

## CRITICAL: Use show-widget, not Write/files
- Do NOT create .html files when the user wants inline visualization. Use show-widget instead.
- Do NOT describe diagrams in text. Draw them with show-widget.
- The show-widget code fence renders DIRECTLY in the chat message.
- If the user explicitly asks you to create a file (e.g. "write an HTML page", "create a PPT"), do create the file — do NOT use show-widget.

## You MUST use show-widget when user asks about
| User intent | Format |
|-------------|--------|
| Process / how X works | SVG flowchart |
| Structure / what is X | SVG hierarchy or layers |
| History / sequence | SVG timeline |
| Compare A vs B | SVG side-by-side |
| Data / trends | ECharts (div + CDN) |
| Calculation / formula | HTML with sliders/inputs |
| 可视化 / 图表 / 流程图 / 架构图 | SVG or ECharts |

## When NOT to use (plain text/markdown instead)
- Simple yes/no answers or short factual responses
- Lists with < 5 items
- When the user explicitly asks for text/code/files

## Widget-Only Design Language (ONLY for show-widget content)

### Colors — Warm Natural Materials
- Page bg: #faf9f5 (ivory), Text: #141413 (near-black), Muted: #87867f
- Borders: rgba(20,20,19,0.10) — transparent overlays
- Decorative palette (pick 2-3 per widget):
  Clay #d97757 | Olive #788c5d | Sky #6a9bcc | Kraft #d4a27f | Fig #c46686 | Oat #e3dacc
- Light fills: 12% alpha, e.g. rgba(217,119,87,0.12)

### NO gradients, NO glow, NO neon in widgets. Solid fills only. rx=12 corners.

### SVG nodes: fill=rgba(color,0.12), stroke=rgba(20,20,19,0.10), text 14px system-ui #141413
### ECharts (NOT Chart.js): borderColor=full hex, areaStyle gradient 25%→2%, grid rgba(0,0,0,0.04), ticks #87867f
### Always register 'anthropic' theme: echarts.registerTheme('anthropic',{color:['#d97757','#788c5d','#6a9bcc','#d4a27f','#c46686'],backgroundColor:'transparent',...})
### Use echarts.init(el,'anthropic'). Update: chart.setOption({...}). Resize: chart.resize().

## Rules
1. widget_code is raw HTML/SVG — no DOCTYPE/html/head/body
2. Transparent background — host provides bg
3. Escape JSON — widget_code is a JSON string value
4. SVG ≤ 2500 chars, HTML ≤ 3000 chars, ECharts ≤ 4000 chars
5. CDN: s4.zstatic.net, cdn.jsdelivr.net, cdnjs.cloudflare.com, unpkg.com, esm.sh
6. Script: onload="init()" + if(window.echarts)init(); fallback
7. SVG: <svg width="100%" viewBox="0 0 680 H">
8. Controls: call chart.setOption({...}) to update ECharts
9. IMPORTANT — Drill-down interaction: On 2-3 KEY nodes in every SVG diagram, add:
   onclick="window.__widgetSendMessage('详细解释[节点主题]')"
   This sends a follow-up question to the chat. The user clicks a node → AI automatically explains that topic in detail.
   Example: <rect ... onclick="window.__widgetSendMessage('详细解释DNS解析的工作原理')" style="cursor:pointer"/>
   Make the clickable nodes visually distinct: use a slightly darker fill or add a subtle border.
</widget-capability>`;

    const combinedPrompt = [identityPrompt, interactionRules, cwdInstruction, widgetCapability].join("\n\n");

    return {
      memoryContext: memoryContext || undefined,
      skillContext: skillContext || undefined,
      fullSkillContext: fullSkillContext || undefined,
      customSystemPrompt: combinedPrompt
    };
  } catch (error) {
    console.error("[ipc-handlers] Failed to get context injection:", error);
    return {};
  }
}

function inferProviderFromModelId(modelId?: string | null): AgentProvider | null {
  if (!modelId) return null;
  const model = modelId.trim().toLowerCase();
  if (!model) return null;

  if (model.includes("claude") || model.includes("anthropic")) {
    return "claude";
  }
  if (
    model.includes("codex") ||
    model.includes("gpt") ||
    model.includes("openai") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4")
  ) {
    return "codex";
  }

  return null;
}

function createPermissionHandler(session: Session) {
  return async (request: { toolUseId: string; toolName: string; input: unknown }) => {
    return await new Promise<{ behavior: "allow" | "deny"; updatedInput?: unknown; message?: string }>((resolve) => {
      session.pendingPermissions.set(request.toolUseId, {
        toolUseId: request.toolUseId,
        toolName: request.toolName,
        input: request.input,
        resolve,
      });
      emit({
        type: "permission.request",
        payload: {
          sessionId: session.id,
          toolUseId: request.toolUseId,
          toolName: request.toolName,
          input: request.input,
        },
      });
    });
  };
}

export function handleClientEvent(event: ClientEvent) {
  // Initialize sessions on first event
  const sessions = initializeSessions();

  if (event.type === "session.list") {
    emit({
      type: "session.list",
      payload: { sessions: sessions.listSessions({ includeArchived: true }) }
    });
    return;
  }

  if (event.type === "session.history") {
    const { sessionId, beforeCreatedAt, beforeRowid } = event.payload;

    const page = sessions.getSessionHistoryPage(sessionId, {
      beforeCreatedAt,
      beforeRowid,
      targetTurns: 3,
      hardMessageCap: 1000,
    });

    if (!page) {
      // Session may have been deleted (or deleted concurrently). Treat as a sync event rather than an error toast.
      emit({ type: "session.deleted", payload: { sessionId } });
      return;
    }

    // 获取会话元数据（status, modelId）
    const sessionMeta = sessions.getSession(sessionId);

    emit({
      type: "session.history",
      payload: {
        sessionId,
        status: sessionMeta?.status ?? "idle",
        messages: page.messages,
        modelId: sessionMeta?.modelId,
        mode: beforeCreatedAt ? "prepend" : "replace",
        hasMore: page.hasMore,
        oldestCreatedAt: page.oldestCursor?.createdAt,
        oldestRowid: page.oldestCursor?.rowid,
        totalMessageCount: page.totalMessageCount,
      },
    });
    return;
  }

  if (event.type === "session.start") {
    // 添加日志：记录接收到的 cwd
    console.info('[ipc] session.start received with cwd:', event.payload.cwd);

    // 读取 permissionMode，默认为 bypassPermissions
    const permissionMode = event.payload.permissionMode ?? 'bypassPermissions';
    const inferredProvider = inferProviderFromModelId(event.payload.modelId);
    const provider: AgentProvider = inferredProvider ?? event.payload.provider ?? 'claude';
    console.info('[ipc] session.start received with permissionMode:', permissionMode, 'provider:', provider);

    const session = sessions.createSession({
      cwd: event.payload.cwd,
      title: event.payload.title,
      allowedTools: event.payload.allowedTools,
      activeSkillIds: event.payload.activeSkillIds,
      skillMode: event.payload.skillMode,
      permissionMode: permissionMode,
      prompt: event.payload.prompt,
      provider,
      modelId: event.payload.modelId,
    });

    // 添加日志：记录创建后的 session.cwd
    console.info('[ipc] Created session with cwd:', session.cwd, 'provider:', provider);

    sessions.updateSession(session.id, {
      status: "running",
      lastPrompt: event.payload.prompt
    });
    emit({
      type: "session.status",
      payload: {
        sessionId: session.id,
        status: "running",
        title: session.title,
        cwd: session.cwd,
        modelId: event.payload.modelId ?? session.modelId,
        permissionMode,
        skillMode: session.skillMode,
        activeSkillIds: session.activeSkillIds,
        provider,
        metadata: event.payload.clientRequestId
          ? { clientRequestId: event.payload.clientRequestId }
          : undefined,
      }
    });

    emit({
      type: "stream.user_prompt",
      payload: { sessionId: session.id, prompt: event.payload.prompt, images: event.payload.images }
    });

    if (provider === "codex") {
      pendingCodexAutoTitle.set(session.id, {
        prompt: event.payload.prompt,
        hasImages: Array.isArray(event.payload.images) && event.payload.images.length > 0,
      });
    } else {
      pendingCodexAutoTitle.delete(session.id);
    }

    // 获取上下文注入（记忆和技能）
    const contextInjection = getContextInjection(session);

    // 根据 provider 分发到对应的 runner
    if (provider === 'claude') {
      // Claude 路径：使用现有 runClaude（零回归）
      runClaude({
        prompt: event.payload.prompt,
        images: event.payload.images,
        model: event.payload.modelId,
        session,
        resumeSessionId: session.claudeSessionId,
        onEvent: emit,
        onSessionUpdate: (updates) => {
          sessions.updateSession(session.id, updates);
        },
        isNewSession: true,
        contextInjection,
        permissionMode: permissionMode,
        thinkingEffort: event.payload.thinkingEffort
      })
        .then((handle) => {
          if (pendingRunnerAborts.has(session.id)) {
            pendingRunnerAborts.delete(session.id);
            handle.abort();
            return;
          }
          runnerHandles.set(session.id, handle);
          sessions.setAbortController(session.id, undefined);
        })
        .catch((error) => {
          sessions.updateSession(session.id, { status: "error" });
          emit({
            type: "session.status",
            payload: {
              sessionId: session.id,
              status: "error",
              title: session.title,
              cwd: session.cwd,
              modelId: session.modelId,
              error: String(error)
            }
          });
        });
    } else {
      // 非 Claude provider：feature flag 门控
      if (!isCodexEnabled()) {
        pendingCodexAutoTitle.delete(session.id);
        sessions.updateSession(session.id, { status: "error" });
        emit({
          type: "session.status",
          payload: {
            sessionId: session.id,
            status: "error",
            title: session.title,
            cwd: session.cwd,
            modelId: session.modelId,
            error: "Codex provider is not enabled. Enable it in settings.",
          },
        });
        return;
      }

      // 通过 AgentRunnerFactory 分发
      AgentRunnerFactory.create(provider)
        .then(async (runner) => {
          let pluginPaths: string[] | undefined;
          if (shouldLoadSkillsPlugin(contextInjection)) {
            const { ensureSkillsPluginManifest, getSkillsPluginRoot } = await import("../libs/skill-files.js");
            ensureSkillsPluginManifest();
            pluginPaths = [getSkillsPluginRoot()];
          }

          const handle = await runner.run(
            {
              prompt: event.payload.prompt,
              images: event.payload.images,
              model: event.payload.modelId,
              cwd: session.cwd,
              permissionMode,
              permissionHandler: createPermissionHandler(session),
              contextInjection,
              pluginPaths,
              env: { ...process.env, ...computeRuntimeEnvPatch({ PATH: process.env.PATH, NODE_PATH: process.env.NODE_PATH }) } as Record<string, string>,
              thinkingEffort: event.payload.thinkingEffort,
            },
            (agentEvent) => {
              handleAgentRunnerEvent(agentEvent, session.id);
            },
          );
          if (pendingRunnerAborts.has(session.id)) {
            pendingRunnerAborts.delete(session.id);
            handle.abort();
            return;
          }
          runnerHandles.set(session.id, handle);
        })
        .catch((error) => {
          pendingCodexAutoTitle.delete(session.id);
          sessions.updateSession(session.id, { status: "error" });
          emit({
            type: "session.status",
            payload: {
              sessionId: session.id,
              status: "error",
              title: session.title,
              cwd: session.cwd,
              modelId: session.modelId,
              error: String(error)
            }
          });
        });
    }

    return;
  }

  if (event.type === "session.continue") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) {
      emit({ type: "session.deleted", payload: { sessionId: event.payload.sessionId } });
      emit({
        type: "runner.error",
        payload: { sessionId: event.payload.sessionId, message: "Session no longer exists." }
      });
      return;
    }

    // provider 决策：模型推断优先，保证 OpenAI/Codex 模型不会误走 Claude runtime
    const inferredProvider = inferProviderFromModelId(event.payload.modelId);
    const sessionProvider = (session as any).provider as AgentProvider | undefined;
    const provider: AgentProvider =
      inferredProvider ??
      event.payload.provider ??
      sessionProvider ??
      "claude";

    // 若上次会话以 error 状态结束，强制清除过期的 session ID，
    // 避免 SDK 尝试恢复无效会话导致反复失败；ipc-handlers 后续会注入历史记录。
    if (session.status === "error") {
      sessions.updateSession(session.id, { claudeSessionId: undefined } as any);
    }

    // 仅当当前 provider 与会话 provider 一致时才复用 thread ID。
    // 旧会话 provider 为空时，仅 Claude 允许复用 claudeSessionId。
    const rawResumeId = (session as any).providerThreadId ?? session.claudeSessionId;
    const shouldReuseResumeId = sessionProvider
      ? sessionProvider === provider
      : provider === "claude";
    const resumeId = shouldReuseResumeId ? rawResumeId : undefined;

    // 如果没有 resumeId，允许继续（作为新会话），而不是直接报错阻断。
    // 这会在 SDK 会话过期或旧会话未保存 claudeSessionId 时提供优雅降级。
    if (!resumeId && shouldReuseResumeId) {
      console.warn(
        `[ipc] session.continue: no resumeId for session ${session.id}, will start fresh session.`
      );
    }

    const runtime = provider === "codex" ? "codex-sdk" : "claude-sdk";
    const providerChanged = sessionProvider ? sessionProvider !== provider : provider !== "claude";

    // provider 变化时，清理旧线程标识，避免跨 SDK 错误恢复。
    if (providerChanged) {
      console.info(
        "[ipc] session.continue provider switched:",
        sessionProvider ?? "unknown",
        "->",
        provider,
      );
      sessions.updateSession(session.id, {
        provider,
        runtime,
        providerThreadId: undefined,
        claudeSessionId: undefined,
      } as any);
    } else if (sessionProvider !== provider) {
      // 旧会话无 provider 的场景，补写 provider/runtime 便于后续稳定路由。
      sessions.updateSession(session.id, {
        provider,
        runtime,
      } as any);
    }

    if (event.payload.modelId) {
      sessions.updateSession(session.id, { modelId: event.payload.modelId } as any);
    }
    sessions.updateSession(session.id, { status: "running", lastPrompt: event.payload.prompt });
    emit({
      type: "session.status",
      payload: {
        sessionId: session.id,
        status: "running",
        title: session.title,
        cwd: session.cwd,
        modelId: event.payload.modelId ?? session.modelId,
        provider,
      }
    });

    // 如果前端带了权限模式，更新到会话中
    if (event.payload.permissionMode) {
      sessions.updateSession(session.id, { permissionMode: event.payload.permissionMode });
    }

    // 获取上下文注入（记忆和技能）- 继续会话时也注入最新的上下文
    const contextInjection = getContextInjection(session);
    const permissionMode = event.payload.permissionMode ?? session.permissionMode ?? 'bypassPermissions';

    // ── 方案 A：历史上下文恢复注入 ──────────────────────────────────────────
    // 当 resumeId 缺失时（SDK 会话过期、provider 切换、重装 App 等），
    // 从 SQLite 加载历史对话并注入，让模型看到完整上下文。
    // 注意：必须在 emit(stream.user_prompt) 之前读取历史，避免把当前这条 prompt
    // 也读进去（emit 会立即将 prompt 写入 SQLite）。
    if (!resumeId) {
      try {
        const historyText = sessions.getFormattedHistory(session.id);
        if (historyText) {
          contextInjection.historyContext = historyText;
          console.info(
            `[ipc] session.continue: no resumeId, injecting history (${historyText.length} chars) for session ${session.id}`
          );
        }
      } catch (err) {
        console.warn('[ipc] session.continue: failed to load history for injection:', err);
      }
    }
    // ── End 方案 A ──────────────────────────────────────────────────────────

    emit({
      type: "stream.user_prompt",
      payload: { sessionId: session.id, prompt: event.payload.prompt, images: event.payload.images }
    });

    if (provider === 'claude') {
      // Claude 路径：使用现有 runClaude（零回归）
      runClaude({
        prompt: event.payload.prompt,
        images: event.payload.images,
        model: event.payload.modelId,
        session,
        resumeSessionId: resumeId,
        onEvent: emit,
        onSessionUpdate: (updates) => {
          sessions.updateSession(session.id, updates);
        },
        contextInjection,
        permissionMode,
        thinkingEffort: event.payload.thinkingEffort
      })
        .then((handle) => {
          if (pendingRunnerAborts.has(session.id)) {
            pendingRunnerAborts.delete(session.id);
            handle.abort();
            return;
          }
          runnerHandles.set(session.id, handle);
        })
        .catch((error) => {
          sessions.updateSession(session.id, { status: "error" });
          emit({
            type: "session.status",
            payload: {
              sessionId: session.id,
              status: "error",
              title: session.title,
              cwd: session.cwd,
              modelId: session.modelId,
              error: String(error)
            }
          });
        });
    } else {
      // 非 Claude provider：feature flag 门控
      if (!isCodexEnabled()) {
        sessions.updateSession(session.id, { status: "error" });
        emit({
          type: "session.status",
          payload: {
            sessionId: session.id,
            status: "error",
            title: session.title,
            cwd: session.cwd,
            modelId: session.modelId,
            error: "Codex provider is not enabled. Enable it in settings.",
          },
        });
        return;
      }

      // 通过 AgentRunnerFactory 分发
      AgentRunnerFactory.create(provider)
        .then(async (runner) => {
          let pluginPaths: string[] | undefined;
          if (shouldLoadSkillsPlugin(contextInjection)) {
            const { ensureSkillsPluginManifest, getSkillsPluginRoot } = await import("../libs/skill-files.js");
            ensureSkillsPluginManifest();
            pluginPaths = [getSkillsPluginRoot()];
          }

          const handle = await runner.run(
            {
              prompt: event.payload.prompt,
              images: event.payload.images,
              model: event.payload.modelId,
              cwd: session.cwd,
              resumeSessionId: resumeId,
              permissionMode,
              permissionHandler: createPermissionHandler(session),
              contextInjection,
              pluginPaths,
              env: { ...process.env, ...computeRuntimeEnvPatch({ PATH: process.env.PATH, NODE_PATH: process.env.NODE_PATH }) } as Record<string, string>,
              thinkingEffort: event.payload.thinkingEffort,
            },
            (agentEvent) => {
              handleAgentRunnerEvent(agentEvent, session.id);
            },
          );
          if (pendingRunnerAborts.has(session.id)) {
            pendingRunnerAborts.delete(session.id);
            handle.abort();
            return;
          }
          runnerHandles.set(session.id, handle);
        })
        .catch((error) => {
          sessions.updateSession(session.id, { status: "error" });
          emit({
            type: "session.status",
            payload: {
              sessionId: session.id,
              status: "error",
              title: session.title,
              cwd: session.cwd,
              modelId: session.modelId,
              error: String(error)
            }
          });
        });
    }

    return;
  }

  if (event.type === "session.stop") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) return;

    const handle = runnerHandles.get(session.id);
    if (handle) {
      handle.abort();
      runnerHandles.delete(session.id);
    } else {
      // handle not yet registered (async .then() hasn't run): mark for deferred abort
      pendingRunnerAborts.add(session.id);
    }

    // 清理所有挂起的权限请求，以 deny 结算，避免 Promise 永久泄漏
    for (const [, pending] of session.pendingPermissions) {
      pending.resolve({ behavior: "deny", message: "Session stopped by user" });
    }
    session.pendingPermissions.clear();

    sessions.updateSession(session.id, { status: "idle" });
    pendingCodexAutoTitle.delete(session.id);
    emit({
      type: "session.status",
      payload: { sessionId: session.id, status: "idle", title: session.title, cwd: session.cwd, modelId: session.modelId }
    });
    return;
  }

  if (event.type === "session.delete") {
    const sessionId = event.payload.sessionId;
    const handle = runnerHandles.get(sessionId);
    if (handle) {
      handle.abort();
      runnerHandles.delete(sessionId);
    } else {
      pendingRunnerAborts.add(sessionId);
    }

    // 清理所有挂起的权限请求，以 deny 结算
    const sessionToDelete = sessions.getSession(sessionId);
    if (sessionToDelete) {
      for (const [, pending] of sessionToDelete.pendingPermissions) {
        pending.resolve({ behavior: "deny", message: "Session deleted" });
      }
      sessionToDelete.pendingPermissions.clear();
    }

    // Always try to delete and emit deleted event
    // Don't emit error if session doesn't exist - it may have already been deleted
    pendingCodexAutoTitle.delete(sessionId);
    flushBatch(sessionId);
    messageBatches.delete(sessionId);
    diagnosticsRegistry.remove(sessionId); // 清理诊断数据，防止内存泄漏
    sessions.deleteSession(sessionId);
    emit({
      type: "session.deleted",
      payload: { sessionId }
    });
    return;
  }

  if (event.type === "permission.response") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) return;

    const pending = session.pendingPermissions.get(event.payload.toolUseId);
    if (pending) {
      pending.resolve(event.payload.result);
    }
    return;
  }

  // 手动生成标题
  if (event.type === "session.generateTitle") {
    const sessionId = event.payload.sessionId;
    const session = sessions.getSession(sessionId);
    if (!session) return;

    // 先通知前端正在生成标题
    emit({
      type: "session.titleUpdated",
      payload: { sessionId, title: session.title, isGenerating: true }
    });

    // 获取会话历史消息
    const history = sessions.getSessionHistory(sessionId);
    const messages = history?.messages ?? [];

    // 异步生成标题
    generateTitle(messages as StreamMessage[])
      .then((result) => {
        if (result.success && hasLiveSession(sessionId)) {
          sessions.updateSession(sessionId, { title: result.title });
          emit({
            type: "session.titleUpdated",
            payload: { sessionId, title: result.title, isGenerating: false }
          });
        }
      })
      .catch((error) => {
        console.error("[ipc-handlers] Failed to generate title:", error);
        if (hasLiveSession(sessionId)) {
          emit({
            type: "session.titleUpdated",
            payload: { sessionId, title: session.title, isGenerating: false }
          });
        }
      });

    return;
  }

  // 手动更新标题
  if (event.type === "session.updateTitle") {
    const { sessionId, title } = event.payload;
    const session = sessions.getSession(sessionId);
    if (!session) return;

    // 更新标题
    sessions.updateSession(sessionId, { title });
    emit({
      type: "session.titleUpdated",
      payload: { sessionId, title, isGenerating: false }
    });

    return;
  }
}

export function cleanupAllSessions(): void {
  for (const [, handle] of runnerHandles) {
    handle.abort();
    // Windows 上 abort() 只杀父进程，孙进程（git/python/node）会残留
    // 用 taskkill /T /F 递归杀进程树
    if (process.platform === "win32" && handle.pid) {
      try {
        require("child_process").spawn("taskkill", ["/pid", String(handle.pid), "/T", "/F"], {
          stdio: "ignore", detached: true, windowsHide: true,
        }).unref();
      } catch { /* PID 已不存在，静默忽略 */ }
    }
  }
  runnerHandles.clear();
  pendingRunnerAborts.clear();
  if (sessions) {
    sessions.close();
  }
  // 清理所有待发批处理
  for (const [sid] of messageBatches) { flushBatch(sid); }
  messageBatches.clear();
}

/**
 * 注册诊断调试 IPC 处理器（开发模式 + 生产隐藏）
 * Channel: debug:getSessionDiagnostics(sessionId) -> DiagnosticSnapshot | null
 * Channel: debug:exportDiagnostics(sessionId)     -> JSON string
 */
export function registerDebugHandlers(): void {
  ipcMain.removeHandler("debug:getSessionDiagnostics");
  ipcMain.handle("debug:getSessionDiagnostics", (_event, sessionId: string): DiagnosticSnapshot | null => {
    return diagnosticsRegistry.snapshot(sessionId);
  });

  ipcMain.removeHandler("debug:exportDiagnostics");
  ipcMain.handle("debug:exportDiagnostics", (_event, sessionId: string): string => {
    const snapshot = diagnosticsRegistry.snapshot(sessionId);
    if (!snapshot) return JSON.stringify({ error: "session not found", sessionId });
    return JSON.stringify(snapshot, null, 2);
  });

  // renderer 错误上报落地：preload 的 reportError() 调用此 channel，写入 error.log
  // 带 10MB 轮转（复用 log-utils 共享模块），防止日志无限增长
  ipcMain.removeHandler("renderer-error-log");
  ipcMain.handle("renderer-error-log", (_event, entry: unknown): void => {
    const logPath = join(app.getPath("userData"), "error.log");
    const line = `[${new Date().toISOString()}] [renderer] ${JSON.stringify(entry)}\n`;
    appendLogWithRotation(logPath, line);
  });
}

export { sessions, tagsStore, memoryStore, skillStore, cloudSyncService, db, broadcast };
