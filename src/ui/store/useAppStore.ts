import { create } from 'zustand';
import type { ServerEvent } from "../types";
import { useToolExecutionStore } from "../hooks/useToolExecutionStore";
import type { AppState } from "./types";
import {
  handleSessionList,
  handleSessionHistory,
  handleSessionStatus,
  handleSessionCompacting,
  handleSessionCompact,
  handleSessionDeleted,
  handleStreamMessage,
  handleStreamUserPrompt,
  handlePermissionRequest,
  handleRunnerError,
  handleSessionTitleUpdated,
} from "./session-event-handlers";
import { handleServerEventBatch } from "./batch-event-handler";
import { useSessionStore } from "./useSessionStore";

export type { PermissionRequest, SessionView, TitleState, PageType, AppState } from "./types";

// isStopping 超时重置计时器（sessionId → timerId），避免 IPC 丢失导致永久卡在 stopping 状态
const stoppingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useAppStore = create<AppState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  prompt: "",
  cwd: "",
  pendingStart: false,
  pendingStartRequestId: null,
  globalError: null,
  sessionsLoaded: false,
  showStartModal: false,
  showSettingsModal: false,
  historyRequested: new Set(),
  apiConfigChecked: false,
  titleStates: {},
  activePage: 'chat',

  setPrompt: (prompt) => set({ prompt }),
  setCwd: (cwd) => set({ cwd }),
  setPendingStart: (pendingStart) => set((state) => ({
    pendingStart,
    pendingStartRequestId: pendingStart ? state.pendingStartRequestId ?? null : null,
  })),
  setPendingStartRequestId: (pendingStartRequestId) => set({ pendingStartRequestId }),
  setGlobalError: (globalError) => set({ globalError }),
  setShowStartModal: (showStartModal) => set({ showStartModal }),
  setShowSettingsModal: (showSettingsModal) => set({ showSettingsModal }),
  setActiveSessionId: (id) => {
    set((state) => {
      const shouldClearPrompt = state.activeSessionId !== id;
      const nextPrompt = shouldClearPrompt ? "" : state.prompt;

      if (!id) {
        return { activeSessionId: null, prompt: nextPrompt };
      }

      const existing = state.sessions[id];
      if (!existing || !existing.hasUnreadCompletion) {
        return { activeSessionId: id, prompt: nextPrompt };
      }

      return {
        activeSessionId: id,
        prompt: nextPrompt,
        sessions: {
          ...state.sessions,
          [id]: {
            ...existing,
            hasUnreadCompletion: false,
          },
        },
      };
    });
    const toolStore = useToolExecutionStore.getState();
    if (!id) return;
    // 仅已 hydrated 的会话才立即 hydrate 工具状态；
    // 未 hydrated 的会话由 handleSessionHistory(replace) 返回后处理
    const session = get().sessions[id];
    if (session?.hydrated && session?.messages?.length) {
      toolStore.hydrateFromMessages(session.messages, id, {
        preserveRunningState: session.status === "running",
      });
    }
  },
  clearUnreadCompletion: (sessionId) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing || !existing.hasUnreadCompletion) {
        return {};
      }

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            hasUnreadCompletion: false,
          },
        },
      };
    });
  },
  setApiConfigChecked: (apiConfigChecked) => set({ apiConfigChecked }),
  setActivePage: (activePage) => set({ activePage }),

  markHistoryRequested: (sessionId) => {
    set((state) => {
      const next = new Set(state.historyRequested);
      next.add(sessionId);
      return { historyRequested: next };
    });
  },

  setSessionLoadingHistory: (sessionId, loading) => {
    set((s) => {
      const existing = s.sessions[sessionId];
      if (!existing) return {};
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: { ...existing, isLoadingServerHistory: loading }
        }
      };
    });
  },

  setSessionStopping: (sessionId, stopping) => {
    // 清理该 session 的旧超时计时器（无论 stopping 值如何，避免泄漏）
    const existingTimer = stoppingTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      stoppingTimers.delete(sessionId);
    }

    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing || existing.isStopping === stopping) {
        return {};
      }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            isStopping: stopping,
          }
        }
      };
    });

    // 设置为 true 时启动 30 秒兜底计时器，防止 IPC 丢失导致永久卡住
    if (stopping) {
      const timerId = setTimeout(() => {
        stoppingTimers.delete(sessionId);
        set((state) => {
          const existing = state.sessions[sessionId];
          if (!existing || !existing.isStopping) return {};
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...existing, isStopping: false },
            },
          };
        });
      }, 30_000);
      stoppingTimers.set(sessionId, timerId);
    }
  },

  resolvePermissionRequest: (sessionId, toolUseId) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return {};
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            permissionRequests: existing.permissionRequests.filter(req => req.toolUseId !== toolUseId)
          }
        }
      };
    });
  },

  handleServerEvent: (event: ServerEvent) => {
    const state = get();

    switch (event.type) {
      case "session.list":
        handleSessionList(event, state, get, set);
        break;
      case "session.history":
        handleSessionHistory(event, state, set);
        break;
      case "session.status":
        handleSessionStatus(event, state, get, set);
        break;
      case "session.compacting":
        handleSessionCompacting(event, set);
        break;
      case "session.compact":
        handleSessionCompact(event, set);
        break;
      case "session.deleted":
        handleSessionDeleted(event, get, set);
        // 删除会话后刷新标签使用计数
        useSessionStore.getState().fetchTags();
        break;
      case "stream.message":
        handleStreamMessage(event, state, set);
        break;
      case "stream.user_prompt":
        handleStreamUserPrompt(event, set);
        break;
      case "permission.request":
        handlePermissionRequest(event, set);
        break;
      case "runner.error":
        handleRunnerError(event, set);
        break;
      case "session.titleUpdated":
        handleSessionTitleUpdated(event, set);
        break;
    }
  },

  handleServerEventBatch: (events: ServerEvent[]) => {
    handleServerEventBatch(events, get, set);
  }
}));
