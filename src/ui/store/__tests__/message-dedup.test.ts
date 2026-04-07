import { describe, expect, it, vi } from "vitest";
import type { ServerEvent, StreamMessage } from "../../types";
import { handleServerEventBatch } from "../batch-event-handler";
import { createSession, handleStreamMessage } from "../session-event-handlers";
import type { AppState } from "../types";

function createAssistantTextMessage(text: string, uuid?: string): StreamMessage {
  const base: any = {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
    },
  };
  if (uuid) {
    base.uuid = uuid;
  }
  return base as StreamMessage;
}

function createStreamMessageEvent(sessionId: string, message: StreamMessage): Extract<ServerEvent, { type: "stream.message" }> {
  return {
    type: "stream.message",
    payload: { sessionId, message },
  };
}

function createState(sessionId: string, messages: StreamMessage[]): AppState {
  return {
    sessions: {
      [sessionId]: {
        ...createSession(sessionId),
        messages,
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

describe("message deduplication", () => {
  it("single handler should skip duplicated uuid message", () => {
    const sessionId = "session-single";
    const initialMessage = createAssistantTextMessage("hello", "msg-1");
    const stateRef = { current: createState(sessionId, [initialMessage]) };

    handleStreamMessage(
      createStreamMessageEvent(sessionId, createAssistantTextMessage("hello", "msg-1")),
      stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    expect(stateRef.current.sessions[sessionId].messages).toHaveLength(1);

    handleStreamMessage(
      createStreamMessageEvent(sessionId, createAssistantTextMessage("new", "msg-2")),
      stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    expect(stateRef.current.sessions[sessionId].messages).toHaveLength(2);
  });

  it("single handler should keep messages without uuid", () => {
    const sessionId = "session-no-uuid";
    const stateRef = { current: createState(sessionId, []) };
    const message = createAssistantTextMessage("no uuid");

    handleStreamMessage(
      createStreamMessageEvent(sessionId, message),
      stateRef.current,
      (partial) => applySet(stateRef, partial)
    );
    handleStreamMessage(
      createStreamMessageEvent(sessionId, message),
      stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    expect(stateRef.current.sessions[sessionId].messages).toHaveLength(1);
  });

  it("single handler should keep same assistant text across different turns", () => {
    const sessionId = "session-cross-turn";
    const stateRef = { current: createState(sessionId, []) };
    const assistant = createAssistantTextMessage("same answer");

    handleStreamMessage(
      createStreamMessageEvent(sessionId, assistant),
      stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    applySet(stateRef, (state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          messages: [
            ...state.sessions[sessionId].messages,
            { type: "user_prompt", prompt: "next turn" } as any,
          ],
        },
      },
    }));

    handleStreamMessage(
      createStreamMessageEvent(sessionId, assistant),
      stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    expect(stateRef.current.sessions[sessionId].messages).toHaveLength(3);
  });

  it("batch handler should dedupe against existing and incoming duplicates", () => {
    const sessionId = "session-batch";
    const stateRef = {
      current: createState(sessionId, [createAssistantTextMessage("existing", "msg-1")]),
    };

    const events: ServerEvent[] = [
      createStreamMessageEvent(sessionId, createAssistantTextMessage("existing", "msg-1")),
      createStreamMessageEvent(sessionId, createAssistantTextMessage("new", "msg-2")),
      createStreamMessageEvent(sessionId, createAssistantTextMessage("new", "msg-2")),
    ];

    handleServerEventBatch(
      events,
      () => stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    const messages = stateRef.current.sessions[sessionId].messages as any[];
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.uuid)).toEqual(["msg-1", "msg-2"]);
  });

  it("batch handler should dedupe repeated assistant text without uuid in the same turn", () => {
    const sessionId = "session-batch-no-uuid";
    const stateRef = {
      current: createState(sessionId, []),
    };

    const duplicateA = createAssistantTextMessage("dup text");
    const duplicateB = createAssistantTextMessage("dup text");

    const events: ServerEvent[] = [
      createStreamMessageEvent(sessionId, duplicateA),
      createStreamMessageEvent(sessionId, duplicateB),
    ];

    handleServerEventBatch(
      events,
      () => stateRef.current,
      (partial) => applySet(stateRef, partial)
    );

    expect(stateRef.current.sessions[sessionId].messages).toHaveLength(1);
  });
});
