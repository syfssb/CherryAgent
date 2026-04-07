import { describe, expect, it, vi } from "vitest";
import type { ServerEvent } from "../../types";
import { createSession, handleSessionStatus } from "../session-event-handlers";
import type { AppState } from "../types";

function createState(): AppState {
  return {
    sessions: {
      "session-a": {
        ...createSession("session-a"),
        status: "running",
        title: "A",
      },
    },
    activeSessionId: null,
    prompt: "",
    cwd: "",
    pendingStart: true,
    pendingStartRequestId: "req-b",
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

function createStatusEvent(
  sessionId: string,
  metadata?: Record<string, unknown>,
): Extract<ServerEvent, { type: "session.status" }> {
  return {
    type: "session.status",
    payload: {
      sessionId,
      status: "running",
      metadata,
    },
  };
}

describe("pending start routing", () => {
  it("ignores unrelated running statuses while a new session is pending", () => {
    const stateRef = { current: createState() };

    handleSessionStatus(
      createStatusEvent("session-a"),
      stateRef.current,
      () => stateRef.current,
      (partial) => applySet(stateRef, partial),
    );

    expect(stateRef.current.activeSessionId).toBeNull();
    expect(stateRef.current.pendingStart).toBe(true);
  });

  it("activates only the session whose clientRequestId matches the pending start", () => {
    const stateRef = { current: createState() };

    handleSessionStatus(
      createStatusEvent("session-b", { clientRequestId: "req-b" }),
      stateRef.current,
      () => stateRef.current,
      (partial) => applySet(stateRef, partial),
    );

    expect(stateRef.current.pendingStart).toBe(false);
    expect(stateRef.current.pendingStartRequestId).toBeNull();
    expect(stateRef.current.sessions["session-b"]?.status).toBe("running");
    expect(stateRef.current.setActiveSessionId).toHaveBeenCalledWith("session-b");
  });

  it("marks background completed sessions as unread until the user opens them", () => {
    const stateRef = {
      current: {
        ...createState(),
        activeSessionId: "session-a",
        sessions: {
          "session-a": {
            ...createSession("session-a"),
            status: "running",
            title: "A",
          },
          "session-b": {
            ...createSession("session-b"),
            status: "running",
            title: "B",
          },
        },
      },
    };

    handleSessionStatus(
      {
        type: "session.status",
        payload: {
          sessionId: "session-b",
          status: "completed",
        },
      },
      stateRef.current,
      () => stateRef.current,
      (partial) => applySet(stateRef, partial),
    );

    expect(stateRef.current.sessions["session-b"]?.hasUnreadCompletion).toBe(true);
    expect(stateRef.current.sessions["session-a"]?.hasUnreadCompletion).toBe(false);
  });
});
