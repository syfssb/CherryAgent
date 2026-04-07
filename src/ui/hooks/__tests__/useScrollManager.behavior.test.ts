import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useScrollManager } from "../useScrollManager";

describe("useScrollManager behavior", () => {
  let rafQueue: FrameRequestCallback[] = [];
  let rafId = 0;

  const flushRaf = () => {
    let safety = 0;
    while (rafQueue.length > 0 && safety < 20) {
      const pending = [...rafQueue];
      rafQueue = [];
      for (const cb of pending) {
        cb(performance.now());
      }
      safety += 1;
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
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

  function createMockContainer(overrides: Record<string, unknown> = {}) {
    return {
      scrollTop: 500,
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTo: vi.fn(),
      ...overrides,
    } as any;
  }

  it("keeps smooth scrolling for manual 'new messages' action", () => {
    const resetToLatest = vi.fn();
    const loadMoreMessages = vi.fn();

    const { result } = renderHook(() =>
      useScrollManager(
        "session-1",
        1,
        "",
        resetToLatest,
        false,
        false,
        loadMoreMessages,
        [],
        false
      )
    );

    const container = createMockContainer();

    act(() => {
      result.current.scrollContainerRef.current = container;
      vi.runOnlyPendingTimers();
      flushRaf();
      container.scrollTo.mockClear();
    });

    act(() => {
      result.current.scrollToBottom();
      flushRaf();
    });

    expect(resetToLatest).toHaveBeenCalled();
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "smooth" });
  });

  it("uses auto behavior for automatic streaming follow", () => {
    const resetToLatest = vi.fn();
    const loadMoreMessages = vi.fn();

    const { result, rerender } = renderHook(
      (props: { messagesLength: number; partialMessage: string; isStreaming: boolean }) =>
        useScrollManager(
          "session-1",
          props.messagesLength,
          props.partialMessage,
          resetToLatest,
          false,
          false,
          loadMoreMessages,
          [],
          props.isStreaming
        ),
      {
        initialProps: {
          messagesLength: 1,
          partialMessage: "",
          isStreaming: false,
        },
      }
    );

    const container = createMockContainer();

    act(() => {
      result.current.scrollContainerRef.current = container;
      vi.runOnlyPendingTimers();
      flushRaf();
      container.scrollTo.mockClear();
    });

    act(() => {
      result.current.shouldAutoScrollRef.current = true;
      rerender({
        messagesLength: 2,
        partialMessage: "delta",
        isStreaming: true,
      });
    });

    act(() => {
      vi.runOnlyPendingTimers();
      flushRaf();
    });

    expect(result.current.shouldAutoScrollRef.current).toBe(true);
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "auto" });
  });

  it("does not auto-scroll when user scrolled up and shows new-message state", () => {
    const resetToLatest = vi.fn();
    const loadMoreMessages = vi.fn();

    const { result, rerender } = renderHook(
      (props: { messagesLength: number; partialMessage: string; isStreaming: boolean }) =>
        useScrollManager(
          "session-1",
          props.messagesLength,
          props.partialMessage,
          resetToLatest,
          false,
          false,
          loadMoreMessages,
          [],
          props.isStreaming
        ),
      {
        initialProps: {
          messagesLength: 1,
          partialMessage: "",
          isStreaming: false,
        },
      }
    );

    const container = createMockContainer({
      scrollTop: 0,
      scrollHeight: 1000,
      clientHeight: 200,
    });

    act(() => {
      result.current.scrollContainerRef.current = container;
      vi.runOnlyPendingTimers();
      flushRaf();
      container.scrollTo.mockClear();
    });

    act(() => {
      result.current.handleScroll();
    });

    act(() => {
      rerender({
        messagesLength: 2,
        partialMessage: "next",
        isStreaming: true,
      });
    });

    act(() => {
      vi.runOnlyPendingTimers();
      flushRaf();
    });

    expect(container.scrollTo).not.toHaveBeenCalled();
    expect(result.current.hasNewMessages).toBe(true);
  });
});
