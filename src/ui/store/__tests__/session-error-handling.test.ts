import { describe, expect, it, vi } from "vitest";
import type { ServerEvent, StreamMessage } from "../../types";
import { createSession, handleSessionStatus, handleStreamMessage } from "../session-event-handlers";
import type { AppState } from "../types";
import { LOGIN_REQUIRED_MESSAGE } from "../../lib/chat-error";

const fetchBalanceMock = vi.fn(async () => {});
const hydrateFromMessagesMock = vi.fn();
const updateExecutionMock = vi.fn();
const getExecutionMock = vi.fn();
const clearSessionMock = vi.fn();
const updateStatusMock = vi.fn();

vi.mock("../useAuthStore", () => ({
  useAuthStore: {
    getState: () => ({
      fetchBalance: fetchBalanceMock,
    }),
  },
}));

vi.mock("../../hooks/useToolExecutionStore", () => ({
  useToolExecutionStore: {
    getState: () => ({
      hydrateFromMessages: hydrateFromMessagesMock,
      updateExecution: updateExecutionMock,
      getExecution: getExecutionMock,
    }),
  },
}));

vi.mock("../../hooks/useThinkingStore", () => ({
  useThinkingStore: {
    getState: () => ({
      clearSession: clearSessionMock,
    }),
  },
}));

vi.mock("../../hooks/useAuthStatusStore", () => ({
  useAuthStatusStore: {
    getState: () => ({
      updateStatus: updateStatusMock,
    }),
  },
}));

function createAssistantTextMessage(text: string): StreamMessage {
  return {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
    },
  } as StreamMessage;
}

function createState(sessionId: string): AppState {
  return {
    sessions: {
      [sessionId]: {
        ...createSession(sessionId),
        messages: [],
      },
    },
    activeSessionId: sessionId,
    prompt: "",
    cwd: "",
    pendingStart: false,
    pendingStartRequestId: null,
    globalError: null,
    sessionsLoaded: true,
    showStartModal: false,
    showSettingsModal: false,
    historyRequested: new Set<string>(),
    apiConfigChecked: true,
    titleStates: {},
    activePage: "chat",
    setPrompt: vi.fn(),
    setCwd: vi.fn(),
    setPendingStart: vi.fn(),
    setPendingStartRequestId: vi.fn(),
    setGlobalError: vi.fn(),
    setShowStartModal: vi.fn(),
    setShowSettingsModal: vi.fn(),
    setActiveSessionId: vi.fn(),
    clearUnreadCompletion: vi.fn(),
    setApiConfigChecked: vi.fn(),
    setActivePage: vi.fn(),
    markHistoryRequested: vi.fn(),
    resolvePermissionRequest: vi.fn(),
    handleServerEvent: vi.fn(),
    handleServerEventBatch: vi.fn(),
  };
}

function applySet(
  stateRef: { current: AppState },
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)
): void {
  const patch = typeof partial === "function" ? partial(stateRef.current) : partial;
  stateRef.current = {
    ...stateRef.current,
    ...patch,
  };
}

describe("session error handling", () => {
  it("assistant 登录系统错误应升级为全局 banner", () => {
    const sessionId = "session-login-banner";
    const stateRef = { current: createState(sessionId) };

    handleStreamMessage(
      {
        type: "stream.message",
        payload: {
          sessionId,
          message: createAssistantTextMessage('API Error: 401 {"error":{"code":"AUTH_1001","message":"Missing authentication credentials."}}'),
        },
      },
      stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    expect(stateRef.current.globalError).toBe(LOGIN_REQUIRED_MESSAGE);
    const storedMessage = stateRef.current.sessions[sessionId].messages[0] as Extract<StreamMessage, { type: "assistant" }>;
    expect(storedMessage.message.content[0].text).toBe(LOGIN_REQUIRED_MESSAGE);
  });

  it("session.status 的 UnauthenticatedError 元数据应显示全局登录提示", async () => {
    const sessionId = "session-status-login";
    const stateRef = { current: createState(sessionId) };

    handleSessionStatus(
      {
        type: "session.status",
        payload: {
          sessionId,
          status: "error",
          error: "AUTH_1001",
          metadata: {
            errorType: "UnauthenticatedError",
            needsAuth: true,
          },
        },
      } as Extract<ServerEvent, { type: "session.status" }>,
      stateRef.current,
      () => stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    await Promise.resolve();

    expect(stateRef.current.globalError).toBe(LOGIN_REQUIRED_MESSAGE);
    expect(fetchBalanceMock).toHaveBeenCalled();
  });
});
