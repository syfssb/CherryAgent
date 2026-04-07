import { describe, expect, it, vi } from "vitest";
import {
  activateSelectedSession,
  resolveSessionSelectionAction,
} from "./session-selection";

describe("session selection", () => {
  it("navigates back to chat when reselecting the active session from another page", () => {
    const action = resolveSessionSelectionAction({
      currentRoute: "/skills",
      targetSessionId: "session-1",
      activeSessionId: "session-1",
    });

    expect(action).toBe("navigate-only");
  });

  it("allows switching sessions while another session is running", () => {
    const action = resolveSessionSelectionAction({
      currentRoute: "/pricing",
      targetSessionId: "session-2",
      activeSessionId: "session-1",
    });

    expect(action).toBe("switch");
  });

  it("allows switching sessions when no task is running", () => {
    const action = resolveSessionSelectionAction({
      currentRoute: "/usage",
      targetSessionId: "session-2",
      activeSessionId: "session-1",
    });

    expect(action).toBe("switch");
  });

  it("delegates selection through the app-level callback when provided", () => {
    const onSelectSession = vi.fn();
    const setActiveSessionId = vi.fn();

    activateSelectedSession("session-42", onSelectSession, setActiveSessionId);

    expect(onSelectSession).toHaveBeenCalledWith("session-42");
    expect(setActiveSessionId).not.toHaveBeenCalled();
  });

  it("falls back to the store setter when no callback is provided", () => {
    const setActiveSessionId = vi.fn();

    activateSelectedSession("session-42", undefined, setActiveSessionId);

    expect(setActiveSessionId).toHaveBeenCalledWith("session-42");
  });
});
