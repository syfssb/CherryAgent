import type { ServerEvent, StreamMessage } from "../types";
import type { AppState, HookLogEntry, SystemObservableEvent } from "./types";
import { useToolExecutionStore } from "../hooks/useToolExecutionStore";
import {
  appendMessageDedupByUuid,
  createSession,
  dedupMessagesByUuid,
  streamToolIndexMap,
} from "./session-event-handlers";

type StoreGet = () => AppState;
type StoreSet = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)
) => void;

function processBatchToolProgress(
  sessionId: string,
  msgAny: any,
  toolStore: ReturnType<typeof useToolExecutionStore.getState>
): void {
  const existingTool = toolStore.getExecution(msgAny.tool_use_id);
  if (existingTool?.status === "success" || existingTool?.status === "error") {
    return;
  }
  const elapsedSeconds =
    typeof msgAny.elapsed_time_seconds === "number"
      ? msgAny.elapsed_time_seconds
      : undefined;
  const status =
    existingTool?.status && ["success", "error"].includes(existingTool.status)
      ? existingTool.status
      : "running";
  const startTime =
    existingTool?.startTime ??
    (elapsedSeconds !== undefined
      ? Date.now() - Math.round(elapsedSeconds * 1000)
      : undefined);

  toolStore.updateExecution(msgAny.tool_use_id, {
    toolUseId: msgAny.tool_use_id,
    sessionId,
    toolName: msgAny.tool_name ?? existingTool?.toolName ?? "Tool",
    status,
    elapsedSeconds,
    startTime,
  });
}

function processBatchStreamEvent(
  sessionId: string,
  msgAny: any,
  toolStore: ReturnType<typeof useToolExecutionStore.getState>
): void {
  const streamEvent = msgAny.event;

  if (
    streamEvent?.type === "content_block_start" &&
    streamEvent.content_block?.type === "tool_use"
  ) {
    const { id, name, input } = streamEvent.content_block;
    const existingTool = toolStore.getExecution(id);
    // 终态守卫：已完成/已失败的工具不应被重置为 running
    if (existingTool?.status === "success" || existingTool?.status === "error") {
      return;
    }
    toolStore.updateExecution(id, {
      toolUseId: id,
      sessionId,
      toolName: name ?? existingTool?.toolName ?? "Tool",
      status: "running",
      input: input ?? existingTool?.input,
      startTime: existingTool?.startTime ?? Date.now(),
    });

    if (typeof streamEvent.index === "number") {
      const sessionMap = streamToolIndexMap.get(sessionId) ?? new Map<number, string>();
      sessionMap.set(streamEvent.index, id);
      streamToolIndexMap.set(sessionId, sessionMap);
    }
  }

  if (
    streamEvent?.type === "content_block_delta" &&
    streamEvent.delta?.type === "input_json_delta"
  ) {
    const sessionMap = streamToolIndexMap.get(sessionId);
    const toolUseId =
      typeof streamEvent.index === "number" ? sessionMap?.get(streamEvent.index) : undefined;
    if (toolUseId) {
      const existingTool = toolStore.getExecution(toolUseId);
      const nextJson = `${existingTool?.inputJson ?? ""}${streamEvent.delta.partial_json ?? ""}`;
      let nextInput = existingTool?.input;
      try {
        const parsed = JSON.parse(nextJson);
        if (parsed && typeof parsed === "object") {
          nextInput = parsed as Record<string, unknown>;
        }
      } catch {
        // JSON 可能是未完成的片段
      }
      toolStore.updateExecution(toolUseId, {
        inputJson: nextJson,
        input: nextInput,
      });
    }
  }
}

function processBatchAssistantMessage(
  sessionId: string,
  msgAny: any,
  toolStore: ReturnType<typeof useToolExecutionStore.getState>
): void {
  if (msgAny.type === "assistant" && msgAny.message?.content) {
    for (const block of msgAny.message.content) {
      if (block.type === "tool_use") {
        const existingTool = toolStore.getExecution(block.id);
        toolStore.updateExecution(block.id, {
          toolUseId: block.id,
          sessionId,
          toolName: block.name ?? existingTool?.toolName ?? "Tool",
          status:
            existingTool?.status && ["success", "error"].includes(existingTool.status)
              ? existingTool.status
              : "running",
          input: block.input ?? existingTool?.input,
          startTime: existingTool?.startTime ?? Date.now(),
        });
      }
    }
  }
}

function processBatchUserMessage(
  sessionId: string,
  msgAny: any,
  toolStore: ReturnType<typeof useToolExecutionStore.getState>
): void {
  if (msgAny.type === "user" && msgAny.message?.content) {
    for (const block of msgAny.message.content) {
      if (block.type === "tool_result") {
        const output = Array.isArray(block.content)
          ? block.content.map((item: any) => item.text || "").join("\n")
          : String(block.content ?? "");

        toolStore.updateExecution(block.tool_use_id, {
          sessionId,
          status: block.is_error ? "error" : "success",
          output,
          endTime: Date.now(),
        });
      }
    }
  }
}

export function handleServerEventBatch(
  events: ServerEvent[],
  get: StoreGet,
  set: StoreSet
): void {
  if (events.length === 0) return;

  const toolStore = useToolExecutionStore.getState();

  // 按 sessionId 分组 stream.message 事件
  const messagesBySession = new Map<string, StreamMessage[]>();
  const otherEvents: ServerEvent[] = [];

  for (const event of events) {
    if (event.type === "stream.message") {
      const { sessionId, message } = event.payload;
      const msgs = messagesBySession.get(sessionId) || [];
      msgs.push(message);
      messagesBySession.set(sessionId, msgs);
    } else {
      otherEvents.push(event);
    }
  }

  // 批量处理 stream.message（单次 set 调用）
  if (messagesBySession.size > 0) {
    set((state) => {
      const nextSessions = { ...state.sessions };

      for (const [sessionId, messages] of messagesBySession) {
        const existing = nextSessions[sessionId] ?? createSession(sessionId);
        const dedupedMessages = dedupMessagesByUuid(existing.messages, messages);
        if (dedupedMessages.length === 0) {
          continue;
        }
        let nextObservableEvents = existing.observableEvents ?? [];
        let nextHookLogs = existing.hookLogs ?? [];
        let observableChanged = false;

        for (const msg of dedupedMessages) {
          const msgAny = msg as any;

          if (msgAny.type === "tool_progress") {
            processBatchToolProgress(sessionId, msgAny, toolStore);
            continue;
          }

          if (msgAny.type === "stream_event") {
            processBatchStreamEvent(sessionId, msgAny, toolStore);
          }

          // 处理 system 子类型消息（可观测层）
          if (msgAny.type === "system") {
            const observableEvent = processBatchSystemMessage(msgAny);
            if (observableEvent) {
              nextObservableEvents = [...nextObservableEvents, observableEvent];
              if (observableEvent.kind === "hook") {
                nextHookLogs = batchUpdateHookLogs(nextHookLogs, observableEvent.entry);
              }
              observableChanged = true;
            }
          }

          // 处理 tool_use_summary（可观测层）
          if (msgAny.type === "tool_use_summary") {
            const summaryEvent: SystemObservableEvent = {
              kind: "tool_use_summary",
              toolName: msgAny.tool_name ?? "unknown",
              toolUseId: msgAny.tool_use_id ?? "",
              summary: msgAny.summary ?? "",
              timestamp: Date.now(),
            };
            nextObservableEvents = [...nextObservableEvents, summaryEvent];
            observableChanged = true;
          }

          processBatchAssistantMessage(sessionId, msgAny, toolStore);
          processBatchUserMessage(sessionId, msgAny, toolStore);
        }

        // 过滤掉 tool_progress（不存入消息列表）
        const filteredMessages = dedupedMessages.filter((m) => (m as any).type !== "tool_progress");

        if (filteredMessages.length > 0 || observableChanged) {
          const nextMessages = filteredMessages.reduce(
            (acc, msg) => appendMessageDedupByUuid(acc, msg),
            existing.messages
          );
          nextSessions[sessionId] = {
            ...existing,
            messages: filteredMessages.length > 0 ? nextMessages : existing.messages,
            ...(observableChanged
              ? { observableEvents: nextObservableEvents, hookLogs: nextHookLogs }
              : {}),
          };
        }
      }

      return { sessions: nextSessions };
    });
  }

  // 其他事件类型走原有逻辑
  for (const event of otherEvents) {
    get().handleServerEvent(event);
  }
}

/**
 * 批量处理 system 消息，提取可观测事件
 */
function processBatchSystemMessage(msgAny: any): SystemObservableEvent | null {
  const subtype = msgAny.subtype;
  const now = Date.now();

  if (subtype === "hook_started") {
    return {
      kind: "hook",
      entry: {
        hookId: msgAny.hook_id ?? msgAny.hookId ?? crypto.randomUUID(),
        hookName: msgAny.hook_name ?? msgAny.hookName ?? "unknown",
        hookEvent: msgAny.hook_event ?? msgAny.hookEvent ?? "unknown",
        status: "started",
        timestamp: now,
      },
    };
  }

  if (subtype === "hook_progress") {
    return {
      kind: "hook",
      entry: {
        hookId: msgAny.hook_id ?? msgAny.hookId ?? "",
        hookName: msgAny.hook_name ?? msgAny.hookName ?? "unknown",
        hookEvent: msgAny.hook_event ?? msgAny.hookEvent ?? "unknown",
        status: "running",
        output: msgAny.output ?? msgAny.progress ?? undefined,
        timestamp: now,
      },
    };
  }

  if (subtype === "hook_response") {
    return {
      kind: "hook",
      entry: {
        hookId: msgAny.hook_id ?? msgAny.hookId ?? "",
        hookName: msgAny.hook_name ?? msgAny.hookName ?? "unknown",
        hookEvent: msgAny.hook_event ?? msgAny.hookEvent ?? "unknown",
        status: "completed",
        output: msgAny.output ?? msgAny.response ?? undefined,
        timestamp: now,
      },
    };
  }

  if (subtype === "task_notification") {
    return {
      kind: "task_notification",
      message: msgAny.message ?? msgAny.notification ?? "",
      sessionId: msgAny.session_id ?? msgAny.sessionId,
      timestamp: now,
    };
  }

  if (subtype === "files_persisted") {
    return {
      kind: "files_persisted",
      files: Array.isArray(msgAny.files) ? msgAny.files : [],
      timestamp: now,
    };
  }

  return null;
}

/**
 * 批量更新 hook 日志（不可变更新）
 */
function batchUpdateHookLogs(prevLogs: HookLogEntry[], entry: HookLogEntry): HookLogEntry[] {
  const existingIndex = prevLogs.findIndex((log) => log.hookId === entry.hookId);
  if (existingIndex >= 0) {
    return prevLogs.map((log, i) =>
      i === existingIndex
        ? {
            ...log,
            status: entry.status,
            output: entry.output ?? log.output,
            timestamp: entry.timestamp,
          }
        : log
    );
  }
  return [...prevLogs, entry];
}
