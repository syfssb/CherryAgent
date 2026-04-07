import { afterEach, describe, expect, it } from "vitest";
import { useAppStore } from "../useAppStore";
import { createSession } from "../session-event-handlers";

const initialState = useAppStore.getState();

afterEach(() => {
  useAppStore.setState(initialState);
});

describe("unread completion indicator", () => {
  it("clears unread completion when the user opens the completed session", () => {
    useAppStore.setState({
      sessions: {
        "session-a": {
          ...createSession("session-a"),
          status: "running",
          title: "A",
        },
        "session-b": {
          ...createSession("session-b"),
          status: "completed",
          title: "B",
          hasUnreadCompletion: true,
        },
      },
      activeSessionId: "session-a",
    });

    useAppStore.getState().setActiveSessionId("session-b");

    const nextState = useAppStore.getState();
    expect(nextState.activeSessionId).toBe("session-b");
    expect(nextState.sessions["session-b"]?.hasUnreadCompletion).toBe(false);
  });

  it("clears the shared prompt when switching to another session", () => {
    useAppStore.setState({
      sessions: {
        "session-a": {
          ...createSession("session-a"),
          status: "completed",
          title: "A",
        },
        "session-b": {
          ...createSession("session-b"),
          status: "completed",
          title: "B",
        },
      },
      activeSessionId: "session-a",
      prompt: "上一条会话里正在浏览的输入历史",
    });

    useAppStore.getState().setActiveSessionId("session-b");

    const nextState = useAppStore.getState();
    expect(nextState.activeSessionId).toBe("session-b");
    expect(nextState.prompt).toBe("");
  });
});
