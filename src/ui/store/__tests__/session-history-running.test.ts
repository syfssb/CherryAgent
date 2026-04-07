import { describe, expect, it, vi } from "vitest";
import type { ServerEvent, StreamMessage, UserPromptMessage } from "../../types";
import { createSession, handleSessionHistory } from "../session-event-handlers";
import type { AppState } from "../types";

function createUserPromptMessage(prompt: string, createdAt: number): StreamMessage {
  return {
    type: "user_prompt",
    prompt,
    _createdAt: createdAt,
  } as StreamMessage;
}

function createState(sessionId: string, messages: StreamMessage[], status: "idle" | "running" | "completed" | "error" = "idle"): AppState {
  return {
    sessions: {
      [sessionId]: {
        ...createSession(sessionId),
        status,
        messages,
      },
    },
    activeSessionId: null,
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

function createSessionHistoryEvent(
  sessionId: string,
  messages: StreamMessage[],
  status: "idle" | "running" | "completed" | "error" = "running"
): Extract<ServerEvent, { type: "session.history" }> {
  return {
    type: "session.history",
    payload: {
      sessionId,
      status,
      messages,
    },
  };
}

describe("running session history merge", () => {
  it("keeps an in-memory user prompt when the DB snapshot has not persisted it yet", () => {
    const sessionId = "session-pending-user-prompt";
    const pendingPrompt = createUserPromptMessage("hello", 200);
    const stateRef = {
      current: createState(sessionId, [pendingPrompt], "running"),
    };

    handleSessionHistory(
      createSessionHistoryEvent(sessionId, []),
      stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    expect(stateRef.current.sessions[sessionId].messages).toEqual([pendingPrompt]);
  });

  it("keeps same-text user prompts from different turns as distinct messages", () => {
    const sessionId = "session-repeat-prompt";
    const persistedPrompt = createUserPromptMessage("继续", 100);
    const pendingPrompt = createUserPromptMessage("继续", 200);
    const stateRef = {
      current: createState(sessionId, [persistedPrompt, pendingPrompt], "running"),
    };

    handleSessionHistory(
      createSessionHistoryEvent(sessionId, [persistedPrompt]),
      stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    const messages = stateRef.current.sessions[sessionId].messages as UserPromptMessage[];
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message._createdAt)).toEqual([100, 200]);
  });

  it("does not duplicate a user prompt that is already present in the DB snapshot", () => {
    const sessionId = "session-persisted-user-prompt";
    const persistedPrompt = createUserPromptMessage("hello", 300);
    const stateRef = {
      current: createState(sessionId, [persistedPrompt], "running"),
    };

    handleSessionHistory(
      createSessionHistoryEvent(sessionId, [persistedPrompt]),
      stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    expect(stateRef.current.sessions[sessionId].messages).toEqual([persistedPrompt]);
  });
});
