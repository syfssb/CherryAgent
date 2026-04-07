import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import {
  type ForegroundRealignTarget,
  realignChatViewportForForeground,
} from "../utils/chat-visibility";

function VisibilityRestoreBridge({ target }: { target: ForegroundRealignTarget }) {
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        realignChatViewportForForeground(target);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [target]);

  return null;
}

function createMockContainer(overrides: Partial<HTMLElement> = {}) {
  return {
    getBoundingClientRect: vi.fn(() => ({
      x: 0, y: 0, width: 720, height: 400,
      top: 0, left: 0, right: 720, bottom: 400,
      toJSON: () => ({}),
    })),
    scrollHeight: 1000,
    clientHeight: 400,
    scrollTop: 0,
    scrollTo: vi.fn(),
    ...overrides,
  } as unknown as HTMLDivElement;
}

describe("chat visibility restore", () => {
  const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "visibilityState"
  );

  const setVisibility = (value: DocumentVisibilityState) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => value,
    });
  };

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalVisibilityDescriptor) {
      Object.defineProperty(Document.prototype, "visibilityState", originalVisibilityDescriptor);
    }
  });

  it("restores viewport immediately after hidden -> visible", () => {
    const container = createMockContainer();
    const handleScroll = vi.fn();

    const target: ForegroundRealignTarget = {
      scrollContainerRef: { current: container },
      shouldAutoScrollRef: { current: true },
      handleScroll,
    };

    render(<VisibilityRestoreBridge target={target} />);

    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(handleScroll).not.toHaveBeenCalled();

    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(container.getBoundingClientRect).toHaveBeenCalled();
    expect(handleScroll).toHaveBeenCalled();
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 600, behavior: "auto" });
  });

  it("keeps current position when auto-scroll is disabled", () => {
    const container = createMockContainer();
    const handleScroll = vi.fn();

    const target: ForegroundRealignTarget = {
      scrollContainerRef: { current: container },
      shouldAutoScrollRef: { current: false },
      handleScroll,
    };

    setVisibility("visible");
    render(<VisibilityRestoreBridge target={target} />);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(container.getBoundingClientRect).toHaveBeenCalled();
    expect(handleScroll).toHaveBeenCalled();
    expect(container.scrollTo).not.toHaveBeenCalled();
  });

  it("clamps scrollTop when out of bounds after foreground restore", () => {
    const container = createMockContainer({
      scrollHeight: 500,
      clientHeight: 400,
      scrollTop: 200,
    } as any);
    const handleScroll = vi.fn();

    const target: ForegroundRealignTarget = {
      scrollContainerRef: { current: container },
      shouldAutoScrollRef: { current: false },
      handleScroll,
    };

    realignChatViewportForForeground(target);

    // scrollTop(200) > maxScrollTop(100), should be clamped
    expect(container.scrollTop).toBe(100);
  });
});
