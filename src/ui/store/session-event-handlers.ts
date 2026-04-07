import type { ImageContent, ServerEvent, StreamMessage, UserPromptMessage } from "../types";
import type { AppState, SessionView, HookLogEntry, SystemObservableEvent } from "./types";
import { useToolExecutionStore } from "../hooks/useToolExecutionStore";
import { useThinkingStore } from "../hooks/useThinkingStore";
import { useAuthStore } from "./useAuthStore";
import { useAuthStatusStore } from "../hooks/useAuthStatusStore";
import { getGlobalChatErrorMessage, isBalanceErrorText, isLoginRequiredErrorText, normalizeChatErrorText, LOGIN_REQUIRED_MESSAGE } from "../lib/chat-error";

// 记录 stream_event 中 content_block 的索引到 tool_use_id 的映射（按 sessionId 维度）
export const streamToolIndexMap = new Map<string, Map<number, string>>();

// ─── Tool input delta 缓冲区 ──────────────────────────────────────────────────
// 每个 toolUseId 对应一条待 flush 的记录：累积的 partial_json 字符串 + 定时器 ID
interface PendingDelta {
  json: string;
  timerId: ReturnType<typeof setTimeout>;
}
const pendingInputDeltas = new Map<string, PendingDelta>();

/** 立即将 toolUseId 的累积 delta flush 到 Zustand store */
function flushInputDelta(toolUseId: string): void {
  const pending = pendingInputDeltas.get(toolUseId);
  if (!pending) return;

  clearTimeout(pending.timerId);
  pendingInputDeltas.delete(toolUseId);

  const toolStore = useToolExecutionStore.getState();
  const existing = toolStore.getExecution(toolUseId);
  const nextJson = `${existing?.inputJson ?? ''}${pending.json}`;
  let nextInput = existing?.input;
  try {
    const parsed = JSON.parse(nextJson);
    if (parsed && typeof parsed === 'object') {
      nextInput = parsed as Record<string, unknown>;
    }
  } catch {
    // JSON 可能是未完成的片段，忽略解析错误
  }
  toolStore.updateExecution(toolUseId, { inputJson: nextJson, input: nextInput });
}

/**
 * 将 partial_json 片段写入缓冲区，满足以下任一条件时 flush：
 *   1. 缓冲累积超过 100 字符（立即 flush，不等计时器）
 *   2. 50ms 内无新 delta 到达（防抖触发）
 */
function bufferInputDelta(toolUseId: string, partialJson: string): void {
  const existing = pendingInputDeltas.get(toolUseId);
  const accum = (existing?.json ?? '') + partialJson;

  if (existing) {
    clearTimeout(existing.timerId);
  }

  if (accum.length >= 100) {
    // 超阈值立即 flush：先写入最新累积值再 flush
    pendingInputDeltas.set(toolUseId, {
      json: accum,
      timerId: 0 as unknown as ReturnType<typeof setTimeout>,
    });
    flushInputDelta(toolUseId);
    return;
  }

  // 否则 50ms 防抖
  const timerId = setTimeout(() => flushInputDelta(toolUseId), 50);
  pendingInputDeltas.set(toolUseId, { json: accum, timerId });
}

/** 工具完成时清理该工具的 pending delta（避免后续残留 flush） */
function clearPendingDelta(toolUseId: string): void {
  const pending = pendingInputDeltas.get(toolUseId);
  if (pending) {
    clearTimeout(pending.timerId);
    pendingInputDeltas.delete(toolUseId);
  }
}

// ─── Messages 批量追加缓冲区 ──────────────────────────────────────────────────
// 每个 sessionId 对应一批待 flush 的消息 + 定时器 ID
interface PendingMessages {
  messages: import('../types').StreamMessage[];
  timerId: ReturnType<typeof setTimeout>;
  // flush 回调：由调用方在创建批次时绑定（持有当前 set 引用）
  flush: () => void;
}
const pendingMessageBatches = new Map<string, PendingMessages>();

/**
 * 将消息写入批次缓冲，满足以下任一条件时 flush：
 *   1. 批次累积超过 10 条（立即 flush）
 *   2. 30ms 内无新消息到达（防抖触发）
 *
 * flush 时一次性执行 appendMessageDedupByUuid，减少 Zustand 写次数。
 */
function bufferMessage(
  sessionId: string,
  message: import('../types').StreamMessage,
  set: StoreSet
): void {
  const existing = pendingMessageBatches.get(sessionId);
  if (existing) {
    clearTimeout(existing.timerId);
    existing.messages.push(message);
  } else {
    pendingMessageBatches.set(sessionId, {
      messages: [message],
      timerId: 0 as unknown as ReturnType<typeof setTimeout>,
      flush: () => {},
    });
  }

  const batch = pendingMessageBatches.get(sessionId)!;

  /** 执行批量 flush：将积累的消息一次性写入 Zustand */
  const doFlush = () => {
    const pending = pendingMessageBatches.get(sessionId);
    if (!pending || pending.messages.length === 0) return;
    const batchToFlush = [...pending.messages];
    pendingMessageBatches.delete(sessionId);
    set((s) => {
      const sess = s.sessions[sessionId] ?? createSession(sessionId);
      // 批量 deduplicate + 追加，避免每条消息单独展开整个数组
      const nextMessages = batchToFlush.reduce(
        (acc, msg) => appendMessageDedupByUuid(acc, msg),
        sess.messages
      );
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: { ...sess, messages: nextMessages },
        },
      };
    });
  };

  // 绑定最新 flush 函数（供外部 clearPendingMessages 调用，虽当前实现中不使用）
  batch.flush = doFlush;

  if (batch.messages.length >= 10) {
    // 超阈值立即 flush，不等计时器
    doFlush();
    return;
  }

  // 30ms 防抖：重置定时器
  batch.timerId = setTimeout(doFlush, 30);
}

/** 会话删除/结束时 flush 并清理该会话的 pending 消息批次
 *  注意：必须先 flush 再 delete，防止 result/error 消息被静默丢弃 */
function clearPendingMessages(sessionId: string): void {
  const pending = pendingMessageBatches.get(sessionId);
  if (pending) {
    clearTimeout(pending.timerId);
    // 先 flush 剩余消息（包括 result/error），再删除，避免消息丢失
    pending.flush();
    pendingMessageBatches.delete(sessionId);
  }
}

const INSUFFICIENT_BALANCE_GLOBAL_ERROR = "积分不足，请充值后继续使用";

function isUserPromptMessage(message: unknown): boolean {
  return (message as any)?.type === "user_prompt";
}

function getMessageUuid(message: StreamMessage): string | null {
  const uuid = (message as any)?.uuid;
  if (typeof uuid !== "string" || uuid.trim() === "") {
    return null;
  }
  return uuid;
}

function getUserPromptDedupKey(message: StreamMessage): string | null {
  const raw = message as Partial<UserPromptMessage> & { type?: string };
  if (raw.type !== "user_prompt") {
    return null;
  }

  const createdAt = raw._createdAt;
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return `created:${createdAt}`;
  }

  const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
  const imagesKey = Array.isArray(raw.images)
    ? raw.images
        .map((image: ImageContent) => `${image.mediaType}:${image.data.length}:${image.data.slice(0, 16)}`)
        .join("|")
    : "";

  // 兼容历史数据缺少 _createdAt 的场景，退化为内容签名去重。
  return `legacy:${prompt}:${imagesKey}`;
}

function getAssistantMessageSignature(message: StreamMessage): string | null {
  const msgAny = message as any;
  if (msgAny?.type !== "assistant" || !Array.isArray(msgAny?.message?.content)) {
    return null;
  }

  const normalizedContent = msgAny.message.content.map((block: any) => {
    if (!block || typeof block !== "object") return block;
    switch (block.type) {
      case "text":
        return { type: "text", text: String(block.text ?? "") };
      case "tool_use":
        return {
          type: "tool_use",
          id: String(block.id ?? ""),
          name: String(block.name ?? ""),
          input: block.input ?? null,
        };
      case "thinking":
        return { type: "thinking", thinking: String(block.thinking ?? "") };
      default:
        return block;
    }
  });

  return JSON.stringify(normalizedContent);
}

function isDuplicateAssistantInCurrentTurn(
  existingMessages: StreamMessage[],
  message: StreamMessage,
): boolean {
  const targetSignature = getAssistantMessageSignature(message);
  if (!targetSignature) return false;

  for (let i = existingMessages.length - 1; i >= 0; i -= 1) {
    const candidate = existingMessages[i];
    if (isUserPromptMessage(candidate)) {
      break;
    }
    const candidateSignature = getAssistantMessageSignature(candidate);
    if (candidateSignature && candidateSignature === targetSignature) {
      return true;
    }
  }
  return false;
}

export function isDuplicateMessageByUuid(
  existingMessages: StreamMessage[],
  message: StreamMessage
): boolean {
  const uuid = getMessageUuid(message);
  if (!uuid) return false;
  return existingMessages.some((item) => getMessageUuid(item) === uuid);
}

export function appendMessageDedupByUuid(
  existingMessages: StreamMessage[],
  message: StreamMessage
): StreamMessage[] {
  // UUID 精确重复：直接丢弃
  if (isDuplicateMessageByUuid(existingMessages, message)) {
    return existingMessages;
  }

  // 助手消息签名重复：用新消息替换旧消息（保留最新完整版本）
  // 场景：AI 对同一文件执行多次写入、或历史重放带来的同签名消息
  const targetSignature = getAssistantMessageSignature(message);
  if (targetSignature) {
    for (let i = existingMessages.length - 1; i >= 0; i -= 1) {
      const candidate = existingMessages[i];
      if (isUserPromptMessage(candidate)) break;
      const candidateSignature = getAssistantMessageSignature(candidate);
      if (candidateSignature && candidateSignature === targetSignature) {
        // 替换旧消息而非丢弃，确保最新版本始终存在
        const updated = [...existingMessages];
        updated[i] = message;
        return updated;
      }
    }
  }

  return [...existingMessages, message];
}

export function dedupMessagesByUuid(
  existingMessages: StreamMessage[],
  incomingMessages: StreamMessage[]
): StreamMessage[] {
  if (incomingMessages.length === 0) {
    return incomingMessages;
  }
  // Build a Set of existing UUIDs for O(1) lookup instead of O(n) per message
  const existingUuids = new Set<string>();
  for (const msg of existingMessages) {
    const uuid = getMessageUuid(msg);
    if (uuid) existingUuids.add(uuid);
  }
  const deduped: StreamMessage[] = [];
  let currentMessages = existingMessages;
  for (const incoming of incomingMessages) {
    const uuid = getMessageUuid(incoming);
    // Fast UUID dedup check via Set
    if (uuid && existingUuids.has(uuid)) {
      continue;
    }
    // 签名重复：与 appendMessageDedupByUuid 保持一致，用后来者替换已有消息
    const targetSignature = getAssistantMessageSignature(incoming);
    if (targetSignature) {
      let replaced = false;
      for (let i = currentMessages.length - 1; i >= 0; i -= 1) {
        const candidate = currentMessages[i];
        if (isUserPromptMessage(candidate)) break;
        if (getAssistantMessageSignature(candidate) === targetSignature) {
          const dedupedIdx = deduped.indexOf(candidate);
          if (dedupedIdx >= 0) {
            // 候选消息在 deduped 里：原地替换
            deduped[dedupedIdx] = incoming;
            currentMessages = [
              ...currentMessages.slice(0, i),
              incoming,
              ...currentMessages.slice(i + 1),
            ];
          } else {
            // 候选消息在 existingMessages 里（未进入 deduped）：
            // 将新消息加入 deduped，后续 appendMessageDedupByUuid reduce 步骤会负责替换 existing.messages
            deduped.push(incoming);
            currentMessages = [...currentMessages, incoming];
          }
          replaced = true;
          break;
        }
      }
      if (replaced) {
        if (uuid) existingUuids.add(uuid);
        continue;
      }
    }
    deduped.push(incoming);
    currentMessages = [...currentMessages, incoming];
    if (uuid) existingUuids.add(uuid);
  }
  return deduped;
}

function isProcessExitError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("process exited with code") ||
    normalized.includes("claude code process exited with code")
  );
}

function normalizeAssistantMessage(message: StreamMessage): {
  normalizedMessage: StreamMessage;
  globalError: string | null;
} {
  const asAny = message as any;
  if (asAny.type !== "assistant" || !Array.isArray(asAny.message?.content)) {
    return { normalizedMessage: message, globalError: null };
  }

  let hasChanged = false;
  let globalError: string | null = null;
  let hasNonGlobalText = false;

  const nextContent = asAny.message.content.map((block: any) => {
    if (block?.type !== "text" || typeof block.text !== "string") {
      return block;
    }

    const normalized = normalizeChatErrorText(block.text);
    const nextGlobalError = getGlobalChatErrorMessage(block.text);
    if (normalized.text !== block.text) {
      hasChanged = true;
    }
    if (nextGlobalError) {
      globalError ??= nextGlobalError;
    } else if (normalized.text.trim()) {
      hasNonGlobalText = true;
    }

    return normalized.text === block.text
      ? block
      : { ...block, text: normalized.text };
  });

  const finalGlobalError = hasNonGlobalText ? null : globalError;

  if (!hasChanged) {
    return { normalizedMessage: message, globalError: finalGlobalError };
  }

  return {
    normalizedMessage: {
      ...asAny,
      message: {
        ...asAny.message,
        content: nextContent,
      },
    },
    globalError: finalGlobalError,
  };
}

function ensureMessageTimestamp(message: StreamMessage, fallbackTimestamp: number): StreamMessage {
  const raw = message as any;
  if (typeof raw?._createdAt === "number") {
    return message;
  }
  return {
    ...raw,
    _createdAt: fallbackTimestamp,
  } as StreamMessage;
}

export function createSession(id: string): SessionView {
  return {
    id,
    title: "",
    status: "idle",
    isStopping: false,
    isCompacting: false,
    messages: [],
    permissionRequests: [],
    hydrated: false,
    permissionMode: "bypassPermissions",
    hookLogs: [],
    observableEvents: [],
    hasUnreadCompletion: false,
  };
}

type StoreGet = () => AppState;
type StoreSet = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)
) => void;

export function handleSessionList(
  event: Extract<ServerEvent, { type: "session.list" }>,
  state: AppState,
  get: StoreGet,
  set: StoreSet
): void {
  const nextSessions: Record<string, SessionView> = {};
  for (const session of event.payload.sessions) {
    const existing = state.sessions[session.id] ?? createSession(session.id);
    const sessionData = session as any;
    nextSessions[session.id] = {
      ...existing,
      status: session.status,
      isStopping: session.status === "running" ? (existing.isStopping ?? false) : false,
      title: session.title,
      cwd: session.cwd,
      provider: session.provider ?? existing.provider,
      modelId: (sessionData as any).modelId ?? existing.modelId,
      activeSkillIds: sessionData.activeSkillIds ?? existing.activeSkillIds,
      skillMode: sessionData.skillMode ?? existing.skillMode,
      permissionMode: sessionData.permissionMode ?? existing.permissionMode,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      isCompacting: existing.isCompacting ?? false,
      lastCompact: existing.lastCompact,
      isPinned: sessionData.isPinned ?? false,
      isArchived: sessionData.isArchived ?? false,
      tags: sessionData.tags ?? [],
      hasUnreadCompletion: existing.hasUnreadCompletion ?? false,
      autoCleanScripts: sessionData.autoCleanScripts ?? false
    };
  }

  set({ sessions: nextSessions, sessionsLoaded: true });

  for (const sessionId of Object.keys(state.sessions)) {
    if (!(sessionId in nextSessions)) {
      useToolExecutionStore.getState().clearSessionExecutions(sessionId);
    }
  }

  const hasSessions = event.payload.sessions.length > 0;

  if (!hasSessions) {
    get().setActiveSessionId(null);
  }

  if (
    !state.activeSessionId &&
    event.payload.sessions.length > 0 &&
    !state.showStartModal &&
    !state.pendingStart &&
    !state.sessionsLoaded
  ) {
    const sorted = [...event.payload.sessions].sort((a, b) => {
      const aTime = a.updatedAt ?? a.createdAt ?? 0;
      const bTime = b.updatedAt ?? b.createdAt ?? 0;
      return aTime - bTime;
    });
    const latestSession = sorted[sorted.length - 1];
    if (latestSession) {
      get().setActiveSessionId(latestSession.id);
    }
  } else if (state.activeSessionId) {
    const stillExists = event.payload.sessions.some(
      (session) => session.id === state.activeSessionId
    );
    if (!stillExists) {
      get().setActiveSessionId(null);
    }
  }
}

export function handleSessionHistory(
  event: Extract<ServerEvent, { type: "session.history" }>,
  _state: AppState,
  set: StoreSet
): void {
  const { sessionId, messages, status } = event.payload;
  const modelId = (event.payload as any).modelId as string | undefined;

  // 分页模式与游标字段（默认 replace 保持向后兼容）
  const mode = event.payload.mode ?? "replace";
  const hasMore = event.payload.hasMore ?? false;
  const oldestCreatedAt = event.payload.oldestCreatedAt;
  const oldestRowid = event.payload.oldestRowid;
  const totalMessageCount = event.payload.totalMessageCount;

  const normalizedMessages = dedupMessagesByUuid(
    [],
    messages.map((message) => normalizeAssistantMessage(message).normalizedMessage)
  );

  // Reconstruct observableEvents from persisted messages
  const reconstructedEvents: SystemObservableEvent[] = [];
  for (const msg of normalizedMessages) {
    const msgAny = msg as any;
    if (msgAny.type === 'system') {
      if (msgAny.subtype === 'files_persisted') {
        reconstructedEvents.push({
          kind: 'files_persisted',
          files: Array.isArray(msgAny.files) ? msgAny.files : [],
          timestamp: typeof msgAny.timestamp === 'number' ? msgAny.timestamp : Date.now(),
        });
      } else if (msgAny.subtype === 'task_notification' && msgAny.message) {
        reconstructedEvents.push({
          kind: 'task_notification',
          message: String(msgAny.message),
          sessionId: typeof msgAny.session_id === 'string' ? msgAny.session_id : undefined,
          timestamp: typeof msgAny.timestamp === 'number' ? msgAny.timestamp : Date.now(),
        });
      }
    } else if (msgAny.type === 'tool_use_summary') {
      reconstructedEvents.push({
        kind: 'tool_use_summary',
        toolName: msgAny.tool_name ?? 'unknown',
        toolUseId: msgAny.tool_use_id ?? '',
        summary: msgAny.summary ?? '',
        timestamp: typeof msgAny.timestamp === 'number' ? msgAny.timestamp : Date.now(),
      });
    }
  }

  set((s) => {
    const existing = s.sessions[sessionId] ?? createSession(sessionId);

    let finalMessages: StreamMessage[];
    let finalObservableEvents: SystemObservableEvent[];

    if (mode === "prepend") {
      // ── prepend 模式：上滑加载更早消息，拼接到已有消息前面 ──
      const existingUuids = new Set(
        existing.messages.map(m => getMessageUuid(m)).filter((id): id is string => id !== null)
      );
      const existingUserPromptKeys = new Set(
        existing.messages.map(m => getUserPromptDedupKey(m)).filter((k): k is string => k !== null)
      );
      const uniqueOlder = normalizedMessages.filter(m => {
        const uuid = getMessageUuid(m);
        if (uuid !== null) return !existingUuids.has(uuid);
        const upKey = getUserPromptDedupKey(m);
        if (upKey !== null) return !existingUserPromptKeys.has(upKey);
        return true; // 无 UUID 也无 user_prompt key 的消息保留
      });
      finalMessages = [...uniqueOlder, ...existing.messages];

      // prepend 模式：新重建的事件放在已有事件前面
      const prevEvents = existing.observableEvents ?? [];
      finalObservableEvents = [...reconstructedEvents, ...prevEvents];
    } else {
      // ── replace 模式（首页加载）：保持原有完整逻辑 ──
      const isRunning = existing.status === 'running';

      // 运行中的会话：DB 快照（分页首页）可能落后于内存中的流式消息
      // 策略：以 DB 快照为基础，追加仅比 DB 最新消息更晚的内存消息
      // 注意：existing.messages 可能包含之前 prepend 的旧历史，必须用时间过滤而非全量去重
      // 空闲会话：DB 是权威来源，直接替换
      finalMessages = isRunning
        ? (() => {
            // DB 分页最新消息的时间戳，作为流式消息的时间下界
            const dbNewestCreatedAt = normalizedMessages.length > 0
              ? Math.max(...normalizedMessages.map(m => (m as any)._createdAt ?? 0))
              : 0;
            const dbUuids = new Set(
              normalizedMessages.map(m => getMessageUuid(m)).filter((id): id is string => id !== null)
            );
            const dbUserPromptKeys = new Set(
              normalizedMessages
                .map(m => getUserPromptDedupKey(m))
                .filter((key): key is string => key !== null)
            );
            // 只保留时间上不早于 DB 最新消息、且不在 DB 中的内存消息（真正的流式新增）
            const newStreamingMessages = existing.messages.filter(m => {
              const msgCreatedAt = (m as any)._createdAt ?? 0;
              if (msgCreatedAt < dbNewestCreatedAt) return false; // 排除 prepend 的旧历史
              const uuid = getMessageUuid(m);
              if (uuid !== null) return !dbUuids.has(uuid);
              const userPromptKey = getUserPromptDedupKey(m);
              if (userPromptKey !== null) {
                return !dbUserPromptKeys.has(userPromptKey);
              }
              return false;
            });
            return newStreamingMessages.length > 0
              ? [...normalizedMessages, ...newStreamingMessages]
              : normalizedMessages;
          })()
        : normalizedMessages;

      // 运行中保留已重建的 observableEvents（避免丢失进行中的事件流）
      finalObservableEvents =
        isRunning && existing.observableEvents && existing.observableEvents.length > 0
          ? existing.observableEvents
          : reconstructedEvents;
    }

    if (s.activeSessionId === sessionId) {
      useToolExecutionStore.getState().hydrateFromMessages(finalMessages, sessionId, {
        preserveRunningState: status === "running",
      });
    }

    return {
      sessions: {
        ...s.sessions,
        [sessionId]: {
          ...existing,
          status,
          messages: finalMessages,
          observableEvents: finalObservableEvents,
          hydrated: true,
          isLoadingServerHistory: false,
          hasMoreServerHistory: hasMore,
          oldestLoadedCreatedAt: oldestCreatedAt ?? existing.oldestLoadedCreatedAt,
          oldestLoadedRowid: oldestRowid ?? existing.oldestLoadedRowid,
          totalMessageCount: totalMessageCount ?? existing.totalMessageCount,
          modelId: modelId ?? existing.modelId
        }
      }
    };
  });
}

export function handleSessionStatus(
  event: Extract<ServerEvent, { type: "session.status" }>,
  state: AppState,
  get: StoreGet,
  set: StoreSet
): void {
  const { sessionId, status, title, cwd, modelId, error, permissionMode, skillMode, activeSkillIds, provider } = event.payload as any;
  const metadata = (event.payload as any).metadata;
  const isRetrying = status === "running" && metadata?.isRetrying === true;
  const retryAttempt = isRetrying ? (metadata.retryAttempt ?? 1) : undefined;
  const waitingPhase = status === "running" ? (metadata?.waitingPhase ?? null) : null;
  const wasRunning = (state.sessions[sessionId] ?? createSession(sessionId)).status === "running";
  const shouldMarkUnreadCompletion =
    status === "completed" &&
    wasRunning &&
    state.activeSessionId !== sessionId;
  set((s) => {
    const existing = s.sessions[sessionId] ?? createSession(sessionId);
    return {
      sessions: {
        ...s.sessions,
        [sessionId]: {
          ...existing,
          status,
          isStopping: status === "running" ? (existing.isStopping ?? false) : false,
          title: title ?? existing.title,
          cwd: cwd ?? existing.cwd,
          modelId: modelId ?? existing.modelId,
          provider: provider ?? existing.provider,
          permissionMode: permissionMode ?? existing.permissionMode,
          skillMode: skillMode ?? existing.skillMode,
          activeSkillIds: activeSkillIds ?? existing.activeSkillIds,
          isCompacting: status === "running" ? existing.isCompacting : false,
          isRetrying,
          retryAttempt,
          waitingPhase,
          hasUnreadCompletion:
            s.activeSessionId === sessionId
              ? false
              : shouldMarkUnreadCompletion
                ? true
                : existing.hasUnreadCompletion ?? false,
          updatedAt: Date.now()
        }
      }
    };
  });

  if (error) {
    const errorText = String(error);
    const normalized = String(error).toLowerCase();
    const isAbort =
      normalized.includes("aborted by user") ||
      normalized.includes("process aborted") ||
      normalized.includes("request aborted") ||
      normalized.includes("session aborted") ||
      String(error).includes("请求被取消");
    if (!isAbort && !isProcessExitError(errorText)) {
      const errorType = metadata?.errorType as string | undefined;
      const isInsufficientBalance =
        errorType === "InsufficientBalanceError" ||
        isBalanceErrorText(errorText);
      const isLoginRequired =
        errorType === "UnauthenticatedError" ||
        metadata?.needsAuth === true ||
        isLoginRequiredErrorText(errorText);
      if (isInsufficientBalance) {
        set({ globalError: INSUFFICIENT_BALANCE_GLOBAL_ERROR });
      } else if (isLoginRequired) {
        // Use the canonical login message from chat-error constants
        set({ globalError: LOGIN_REQUIRED_MESSAGE });
      } else {
        set({ globalError: normalizeChatErrorText(errorText).text });
      }
    }
  }

  if (status !== "running") {
    streamToolIndexMap.delete(sessionId);
    useThinkingStore.getState().clearSession(sessionId);
    const finalStatus = status === "completed" ? "success" : "error";
    useToolExecutionStore.getState().finalizeSessionExecutions(sessionId, finalStatus);
    // 会话结束时 flush 所有 pending 消息和 delta，确保最终状态完整写入
    clearPendingMessages(sessionId);

    // 会话结束时（完成或出错）刷新余额和期卡数据，确保退款后余额显示正确
    if (status === "completed" || status === "error") {
      useAuthStore.getState().fetchBalance().catch(() => {});
      // 同时刷新期卡数据，更新每日额度剩余
      import("./useBillingStore").then((m) => {
        m.useBillingStore.getState().fetchPeriodCards().catch(() => {});
      });
    }
  }

  const matchesPendingStart =
    state.pendingStart &&
    (
      !state.pendingStartRequestId ||
      metadata?.clientRequestId === state.pendingStartRequestId
    );

  if (matchesPendingStart && status === "running") {
    get().setActiveSessionId(sessionId);
    set({ pendingStart: false, pendingStartRequestId: null, showStartModal: false });
  } else if (matchesPendingStart && status === "error") {
    set({ pendingStart: false, pendingStartRequestId: null });
  }
}

export function handleSessionCompacting(
  event: Extract<ServerEvent, { type: "session.compacting" }>,
  set: StoreSet
): void {
  const { sessionId, isCompacting } = event.payload;
  set((state) => {
    const existing = state.sessions[sessionId] ?? createSession(sessionId);
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...existing,
          isCompacting,
          updatedAt: Date.now()
        }
      }
    };
  });
}

export function handleSessionCompact(
  event: Extract<ServerEvent, { type: "session.compact" }>,
  set: StoreSet
): void {
  const { sessionId, trigger, preTokens } = event.payload;
  set((state) => {
    const existing = state.sessions[sessionId] ?? createSession(sessionId);
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...existing,
          lastCompact: {
            trigger,
            preTokens,
            at: Date.now()
          },
          updatedAt: Date.now()
        }
      }
    };
  });
}

export function handleSessionDeleted(
  event: Extract<ServerEvent, { type: "session.deleted" }>,
  get: StoreGet,
  set: StoreSet
): void {
  const { sessionId } = event.payload;
  const state = get();

  streamToolIndexMap.delete(sessionId);
  // 会话删除时清理 pending 消息批次，避免定时器回调写入已删除的会话
  clearPendingMessages(sessionId);
  useToolExecutionStore.getState().clearSessionExecutions(sessionId);

  const nextSessions = { ...state.sessions };
  delete nextSessions[sessionId];

  const nextHistoryRequested = new Set(state.historyRequested);
  nextHistoryRequested.delete(sessionId);

  set({
    sessions: nextSessions,
    historyRequested: nextHistoryRequested,
  });

  if (state.activeSessionId === sessionId) {
    const remaining = Object.values(nextSessions).sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    );
    get().setActiveSessionId(remaining[0]?.id ?? null);
  }
}

export function handleStreamMessage(
  event: Extract<ServerEvent, { type: "stream.message" }>,
  state: AppState,
  set: StoreSet
): void {
  const { sessionId, message } = event.payload;
  const messageWithTimestamp = ensureMessageTimestamp(message, Date.now());
  const { normalizedMessage, globalError } = normalizeAssistantMessage(messageWithTimestamp);

  if (globalError) {
    set({
      globalError: globalError === LOGIN_REQUIRED_MESSAGE
        ? LOGIN_REQUIRED_MESSAGE
        : INSUFFICIENT_BALANCE_GLOBAL_ERROR,
    });
  }

  // 处理 tool_progress（实时耗时，不进入消息列表）
  if ((normalizedMessage as any).type === 'tool_progress') {
    const progress = normalizedMessage as any;
    const toolStore = useToolExecutionStore.getState();
    const existing = toolStore.getExecution(progress.tool_use_id);
    if (existing?.status === 'success' || existing?.status === 'error') {
      return;
    }
    const elapsedSeconds = typeof progress.elapsed_time_seconds === 'number'
      ? progress.elapsed_time_seconds
      : undefined;
    const status = existing?.status && ['success', 'error'].includes(existing.status)
      ? existing.status
      : 'running';
    const startTime = existing?.startTime ?? (elapsedSeconds !== undefined
      ? Date.now() - Math.round(elapsedSeconds * 1000)
      : undefined);

    toolStore.updateExecution(progress.tool_use_id, {
      toolUseId: progress.tool_use_id,
      sessionId,
      toolName: progress.tool_name ?? existing?.toolName ?? 'Tool',
      status,
      elapsedSeconds,
      startTime,
    });
    return;
  }

  // 处理 auth_status（认证状态消息，不进入消息列表）
  if ((normalizedMessage as any).type === 'auth_status') {
    const authStatus = normalizedMessage as any;
    const authStatusStore = useAuthStatusStore.getState();
    authStatusStore.updateStatus({
      isAuthenticating: authStatus.isAuthenticating ?? false,
      output: Array.isArray(authStatus.output) ? authStatus.output : [],
      error: authStatus.error,
    });
    return;
  }

  const existingSession = state.sessions[sessionId] ?? createSession(sessionId);
  // UUID 精确重复：完全跳过（包括工具执行处理）
  if (isDuplicateMessageByUuid(existingSession.messages, normalizedMessage)) {
    return;
  }
  // 签名重复：仍需处理工具执行状态（processAssistantToolUse），
  // 消息存储由 appendMessageDedupByUuid 的替换逻辑处理

  // 处理 system 子类型消息（可观测层：hook、task_notification、files_persisted）
  if ((normalizedMessage as any).type === 'system') {
    const systemMsg = normalizedMessage as any;
    const observableEvent = processSystemMessage(systemMsg);
    if (observableEvent) {
      set((s) => {
        const existing = s.sessions[sessionId] ?? createSession(sessionId);
        const prevEvents = existing.observableEvents ?? [];
        const prevHookLogs = existing.hookLogs ?? [];

        // 如果是 hook 事件，同时更新 hookLogs
        const nextHookLogs = observableEvent.kind === 'hook'
          ? updateHookLogs(prevHookLogs, observableEvent.entry)
          : prevHookLogs;

        return {
          sessions: {
            ...s.sessions,
            [sessionId]: {
              ...existing,
              hookLogs: nextHookLogs,
              observableEvents: [...prevEvents, observableEvent],
              messages: appendMessageDedupByUuid(existing.messages, normalizedMessage)
            }
          }
        };
      });
      return;
    }
    // 未识别的 system 子类型，仍然存入消息列表
    set((s) => {
      const existing = s.sessions[sessionId] ?? createSession(sessionId);
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: { ...existing, messages: appendMessageDedupByUuid(existing.messages, normalizedMessage) }
        }
      };
    });
    return;
  }

  // 处理 tool_use_summary（工具使用摘要，可观测层）
  if ((normalizedMessage as any).type === 'tool_use_summary') {
    const summary = normalizedMessage as any;
    const observableEvent: SystemObservableEvent = {
      kind: 'tool_use_summary',
      toolName: summary.tool_name ?? 'unknown',
      toolUseId: summary.tool_use_id ?? '',
      summary: summary.summary ?? '',
      timestamp: Date.now()
    };
    set((s) => {
      const existing = s.sessions[sessionId] ?? createSession(sessionId);
      const prevEvents = existing.observableEvents ?? [];
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...existing,
            observableEvents: [...prevEvents, observableEvent],
            messages: appendMessageDedupByUuid(existing.messages, normalizedMessage)
          }
        }
      };
    });
    return;
  }

  // 处理 stream_event（用于实时工具调用可视化）
  if ((normalizedMessage as any).type === 'stream_event') {
    processStreamEvent(sessionId, normalizedMessage);
    // stream_event 每字符一条，使用批量缓冲减少 Zustand 写次数（30ms 防抖，超 10 条立即 flush）
    bufferMessage(sessionId, normalizedMessage, set);
    return;
  }

  // 处理 assistant 消息中的工具调用
  processAssistantToolUse(sessionId, normalizedMessage);

  // 处理 user 消息中的工具结果
  processUserToolResult(sessionId, normalizedMessage);

  // 普通消息保持同步写入，避免单事件路径出现“消息尚未入列”的竞态。
  set((s) => {
    const existing = s.sessions[sessionId] ?? createSession(sessionId);
    return {
      sessions: {
        ...s.sessions,
        [sessionId]: {
          ...existing,
          messages: appendMessageDedupByUuid(existing.messages, normalizedMessage),
        },
      },
    };
  });
}

function processStreamEvent(sessionId: string, message: StreamMessage): void {
  const streamEvent = (message as any).event;
  const toolStore = useToolExecutionStore.getState();
  const thinkingStore = useThinkingStore.getState();

  // thinking block 开始
  if (streamEvent?.type === 'content_block_start' && streamEvent.content_block?.type === 'thinking') {
    const index = typeof streamEvent.index === 'number' ? streamEvent.index : 0;
    thinkingStore.startBlock(sessionId, index);
  }

  // thinking 增量文本
  if (streamEvent?.type === 'content_block_delta' && streamEvent.delta?.type === 'thinking_delta') {
    const index = typeof streamEvent.index === 'number' ? streamEvent.index : 0;
    thinkingStore.appendDelta(sessionId, index, streamEvent.delta.thinking ?? '');
  }

  // signature 增量
  if (streamEvent?.type === 'content_block_delta' && streamEvent.delta?.type === 'signature_delta') {
    const index = typeof streamEvent.index === 'number' ? streamEvent.index : 0;
    thinkingStore.setSignature(sessionId, index, streamEvent.delta.signature ?? '');
  }

  // thinking block 结束
  if (streamEvent?.type === 'content_block_stop') {
    const index = typeof streamEvent.index === 'number' ? streamEvent.index : 0;
    const block = thinkingStore.getBlocks(sessionId)[index];
    if (block?.isThinking) {
      thinkingStore.stopBlock(sessionId, index);
    }
  }

  // tool_use block 开始
  if (streamEvent?.type === 'content_block_start' && streamEvent.content_block?.type === 'tool_use') {
    const { id, name, input } = streamEvent.content_block;
    const existing = toolStore.getExecution(id);
    toolStore.updateExecution(id, {
      toolUseId: id,
      sessionId,
      toolName: name ?? existing?.toolName ?? 'Tool',
      status: 'running',
      input: input ?? existing?.input,
      startTime: existing?.startTime ?? Date.now()
    });

    if (typeof streamEvent.index === 'number') {
      const sessionMap = streamToolIndexMap.get(sessionId) ?? new Map<number, string>();
      sessionMap.set(streamEvent.index, id);
      streamToolIndexMap.set(sessionId, sessionMap);
    }
  }

  if (streamEvent?.type === 'content_block_delta' && streamEvent.delta?.type === 'input_json_delta') {
    const sessionMap = streamToolIndexMap.get(sessionId);
    const toolUseId = typeof streamEvent.index === 'number' ? sessionMap?.get(streamEvent.index) : undefined;
    if (toolUseId) {
      // 缓冲 delta：50ms 防抖 + 超过 100 字符立即 flush，避免每个字符触发一次 Zustand 更新
      bufferInputDelta(toolUseId, streamEvent.delta.partial_json ?? '');
    }
  }
}

function processAssistantToolUse(sessionId: string, message: StreamMessage): void {
  if ((message as any).type === 'assistant' && (message as any).message?.content) {
    const contents = (message as any).message.content;
    const toolStore = useToolExecutionStore.getState();
    for (const block of contents) {
      if (block.type === 'tool_use') {
        const existing = toolStore.getExecution(block.id);
        toolStore.updateExecution(block.id, {
          toolUseId: block.id,
          sessionId,
          toolName: block.name ?? existing?.toolName ?? 'Tool',
          status: existing?.status && ['success', 'error'].includes(existing.status)
            ? existing.status
            : 'running',
          input: block.input ?? existing?.input,
          startTime: existing?.startTime ?? Date.now()
        });
      }
    }
  }
}

function processUserToolResult(sessionId: string, message: StreamMessage): void {
  if ((message as any).type === 'user' && (message as any).message?.content) {
    const contents = (message as any).message.content;
    if (!Array.isArray(contents)) return;
    for (const block of contents) {
      if (block.type === 'tool_result') {
        let output: string;
        try {
          if (Array.isArray(block.content)) {
            output = block.content
              .map((item: any) => (typeof item.text === 'string' ? item.text : ''))
              .join('\n');
          } else {
            // 用 ?? '' 代替 || '' 避免 String(null) → "null" / String(undefined) → "undefined"
            output = typeof block.content === 'string'
              ? block.content
              : String(block.content ?? '');
          }
        } catch {
          output = '';
        }

        useToolExecutionStore.getState().updateExecution(block.tool_use_id, {
          sessionId,
          status: block.is_error ? 'error' : 'success',
          output,
          endTime: Date.now()
        });
        // 工具完成：清理可能残留的 input delta 缓冲，避免定时器延迟 flush 覆盖终态
        clearPendingDelta(block.tool_use_id);
      }
    }
  }
}

export function handleStreamUserPrompt(
  event: Extract<ServerEvent, { type: "stream.user_prompt" }>,
  set: StoreSet
): void {
  const { sessionId, prompt, images } = event.payload;
  const createdAt =
    typeof event.payload.timestamp === "number" ? event.payload.timestamp : Date.now();
  set((state) => {
    const existing = state.sessions[sessionId] ?? createSession(sessionId);
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...existing,
          messages: [...existing.messages, { type: "user_prompt", prompt, images, _createdAt: createdAt }]
        }
      }
    };
  });
}

export function handlePermissionRequest(
  event: Extract<ServerEvent, { type: "permission.request" }>,
  set: StoreSet
): void {
  const { sessionId, toolUseId, toolName, input } = event.payload;
  set((state) => {
    const existing = state.sessions[sessionId] ?? createSession(sessionId);
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...existing,
          permissionRequests: [...existing.permissionRequests, { toolUseId, toolName, input }]
        }
      }
    };
  });
}

export function handleRunnerError(
  event: Extract<ServerEvent, { type: "runner.error" }>,
  set: StoreSet
): void {
  const message = event.payload.message ?? "";
  if (isProcessExitError(message)) {
    return;
  }
  if (isBalanceErrorText(message)) {
    set({ globalError: INSUFFICIENT_BALANCE_GLOBAL_ERROR });
    return;
  }
  const normalized = message.toLowerCase();
  const isAbort =
    normalized.includes("aborted by user") ||
    normalized.includes("process aborted") ||
    normalized.includes("request aborted") ||
    normalized.includes("session aborted") ||
    message.includes("请求被取消");
  if (!isAbort) {
    set({ globalError: normalizeChatErrorText(message).text });
  }
}

export function handleSessionTitleUpdated(
  event: Extract<ServerEvent, { type: "session.titleUpdated" }>,
  set: StoreSet
): void {
  const { sessionId, title, isGenerating } = event.payload;
  set((state) => {
    const existing = state.sessions[sessionId];
    const nextTitleStates = {
      ...state.titleStates,
      [sessionId]: { isGenerating: isGenerating ?? false }
    };
    if (existing) {
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            title: title ?? existing.title,
            updatedAt: Date.now()
          }
        },
        titleStates: nextTitleStates
      };
    }
    return { titleStates: nextTitleStates };
  });
}

/**
 * 处理 SDK system 消息，提取可观测事件
 * 支持的子类型：hook_started, hook_progress, hook_response, task_notification, files_persisted
 */
function processSystemMessage(systemMsg: any): SystemObservableEvent | null {
  const subtype = systemMsg.subtype;
  const now = Date.now();

  // Hook 生命周期事件
  if (subtype === 'hook_started') {
    const entry: HookLogEntry = {
      hookId: systemMsg.hook_id ?? systemMsg.hookId ?? crypto.randomUUID(),
      hookName: systemMsg.hook_name ?? systemMsg.hookName ?? 'unknown',
      hookEvent: systemMsg.hook_event ?? systemMsg.hookEvent ?? 'unknown',
      status: 'started',
      timestamp: now
    };
    return { kind: 'hook', entry };
  }

  if (subtype === 'hook_progress') {
    const entry: HookLogEntry = {
      hookId: systemMsg.hook_id ?? systemMsg.hookId ?? '',
      hookName: systemMsg.hook_name ?? systemMsg.hookName ?? 'unknown',
      hookEvent: systemMsg.hook_event ?? systemMsg.hookEvent ?? 'unknown',
      status: 'running',
      output: systemMsg.output ?? systemMsg.progress ?? undefined,
      timestamp: now
    };
    return { kind: 'hook', entry };
  }

  if (subtype === 'hook_response') {
    const entry: HookLogEntry = {
      hookId: systemMsg.hook_id ?? systemMsg.hookId ?? '',
      hookName: systemMsg.hook_name ?? systemMsg.hookName ?? 'unknown',
      hookEvent: systemMsg.hook_event ?? systemMsg.hookEvent ?? 'unknown',
      status: 'completed',
      output: systemMsg.output ?? systemMsg.response ?? undefined,
      timestamp: now
    };
    return { kind: 'hook', entry };
  }

  // 任务通知
  if (subtype === 'task_notification') {
    return {
      kind: 'task_notification',
      message: systemMsg.message ?? systemMsg.notification ?? '',
      sessionId: systemMsg.session_id ?? systemMsg.sessionId,
      timestamp: now
    };
  }

  // 文件持久化通知
  if (subtype === 'files_persisted') {
    return {
      kind: 'files_persisted',
      files: Array.isArray(systemMsg.files) ? systemMsg.files : [],
      timestamp: now
    };
  }

  return null;
}

/**
 * 更新 hook 日志列表（不可变更新）
 * 如果 hookId 已存在，更新其状态和输出；否则追加新条目
 */
function updateHookLogs(prevLogs: HookLogEntry[], entry: HookLogEntry): HookLogEntry[] {
  const existingIndex = prevLogs.findIndex((log) => log.hookId === entry.hookId);
  if (existingIndex >= 0) {
    return prevLogs.map((log, i) =>
      i === existingIndex
        ? {
            ...log,
            status: entry.status,
            output: entry.output ?? log.output,
            timestamp: entry.timestamp
          }
        : log
    );
  }
  return [...prevLogs, entry];
}
