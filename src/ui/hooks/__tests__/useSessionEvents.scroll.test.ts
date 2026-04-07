import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const handleServerEvent = vi.fn();
const handleServerEventBatch = vi.fn();
let sessions: Record<string, unknown> = {};
let activeSessionId = "session-1";

vi.mock("../../store/useAppStore", () => {
  const useAppStore = ((selector: any) =>
    selector({
      activeSessionId,
      handleServerEvent,
      handleServerEventBatch,
    })) as any;
  useAppStore.getState = () => ({ sessions, activeSessionId });
  return { useAppStore };
});

vi.mock("../../store/useAuthStore", () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));

vi.mock("../../store/useSettingsStore", () => ({
  useSettingsStore: () => ({
    notifications: {
      enabled: false,
      desktopNotifications: false,
      permissionNotifications: false,
      soundEnabled: false,
    },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

import { useSessionEvents } from "../useSessionEvents";

function createStreamEvent(event: any) {
  return {
    type: "stream.message",
    payload: {
      sessionId: "session-1",
      message: {
        type: "stream_event",
        event,
      },
    },
  } as any;
}

function createStreamEventForSession(sessionId: string, event: any) {
  return {
    type: "stream.message",
    payload: {
      sessionId,
      message: {
        type: "stream_event",
        event,
      },
    },
  } as any;
}

describe("useSessionEvents scroll behavior", () => {
  let rafQueue: FrameRequestCallback[] = [];
  let rafId = 0;

  const flushRaf = () => {
    const pending = [...rafQueue];
    rafQueue = [];
    for (const cb of pending) {
      cb(performance.now());
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    handleServerEvent.mockReset();
    handleServerEventBatch.mockReset();
    sessions = {};
    activeSessionId = "session-1";
    rafQueue = [];
    rafId = 0;

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      rafId += 1;
      return rafId;
    });

    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id: number) => {
      const index = id - 1;
      if (index >= 0 && index < rafQueue.length) {
        rafQueue[index] = () => undefined;
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("coalesces streaming auto-scroll into one frame and uses auto behavior", () => {
    const shouldAutoScrollRef = { current: true };
    const scrollTo = vi.fn();
    const scrollContainerRef = {
      current: {
        scrollTo,
        scrollHeight: 200,
        clientHeight: 100,
      } as any,
    };
    const setHasNewMessages = vi.fn();

    const { result } = renderHook(() =>
      useSessionEvents(shouldAutoScrollRef as any, scrollContainerRef as any, setHasNewMessages)
    );

    const deltaEvent = createStreamEvent({
      type: "content_block_delta",
      delta: {
        type: "text_delta",
        text: "hello",
      },
    });

    act(() => {
      result.current.onEvent(deltaEvent);
      result.current.onEvent(deltaEvent);
      result.current.onEvent(deltaEvent);
    });

    expect(scrollTo).not.toHaveBeenCalled();

    act(() => {
      flushRaf();
    });

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 100, behavior: "auto" });
  });

  it("performs final auto align on content_block_stop when auto-scroll is enabled", () => {
    const shouldAutoScrollRef = { current: true };
    const scrollTo = vi.fn();
    const scrollContainerRef = {
      current: {
        scrollTo,
        scrollHeight: 260,
        clientHeight: 100,
      } as any,
    };
    const setHasNewMessages = vi.fn();

    const { result } = renderHook(() =>
      useSessionEvents(shouldAutoScrollRef as any, scrollContainerRef as any, setHasNewMessages)
    );

    const stopEvent = createStreamEvent({
      type: "content_block_stop",
    });

    act(() => {
      result.current.onEvent(stopEvent);
    });

    act(() => {
      flushRaf();
      vi.runOnlyPendingTimers();
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 160, behavior: "auto" });
  });

  it("does not auto-scroll when user is away from bottom and marks new messages", () => {
    const shouldAutoScrollRef = { current: false };
    const scrollTo = vi.fn();
    const scrollContainerRef = {
      current: {
        scrollTo,
        scrollHeight: 200,
        clientHeight: 100,
      } as any,
    };
    const setHasNewMessages = vi.fn();

    const { result } = renderHook(() =>
      useSessionEvents(shouldAutoScrollRef as any, scrollContainerRef as any, setHasNewMessages)
    );

    const deltaEvent = createStreamEvent({
      type: "content_block_delta",
      delta: {
        type: "text_delta",
        text: "world",
      },
    });

    act(() => {
      result.current.onEvent(deltaEvent);
      flushRaf();
    });

    expect(scrollTo).not.toHaveBeenCalled();
    expect(setHasNewMessages).toHaveBeenCalledWith(true);
  });

  it("ignores partial streaming from non-active sessions", () => {
    const shouldAutoScrollRef = { current: true };
    const scrollTo = vi.fn();
    const scrollContainerRef = {
      current: {
        scrollTo,
        scrollHeight: 200,
        clientHeight: 100,
      } as any,
    };
    const setHasNewMessages = vi.fn();

    const { result } = renderHook(() =>
      useSessionEvents(shouldAutoScrollRef as any, scrollContainerRef as any, setHasNewMessages)
    );

    const deltaEvent = createStreamEventForSession("session-2", {
      type: "content_block_delta",
      delta: {
        type: "text_delta",
        text: "background",
      },
    });

    act(() => {
      result.current.onEvent(deltaEvent);
      flushRaf();
    });

    expect(result.current.partialMessage).toBe("");
    expect(result.current.showPartialMessage).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(setHasNewMessages).not.toHaveBeenCalled();
  });
});
