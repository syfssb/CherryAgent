import { describe, expect, it } from "vitest";
import { shouldSuppressAssistantSystemErrorMessage } from "./message-system-error";

describe("MessageAdapter assistant system error suppression", () => {
  it("应隐藏纯登录系统错误 assistant 消息", () => {
    const suppressed = shouldSuppressAssistantSystemErrorMessage({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "登录已过期，请重新登录后继续使用。" }],
      },
    });

    expect(suppressed).toBe(true);
  });

  it("带正常文本内容时不应隐藏 assistant 消息", () => {
    const suppressed = shouldSuppressAssistantSystemErrorMessage({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "这是正常回复，不是系统错误。" }],
      },
    });

    expect(suppressed).toBe(false);
  });

  it("带工具调用的 assistant 消息不应被误隐藏", () => {
    const suppressed = shouldSuppressAssistantSystemErrorMessage({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "tool-1", name: "Read", input: {} },
          { type: "text", text: "登录已过期，请重新登录后继续使用。" },
        ],
      },
    });

    expect(suppressed).toBe(false);
  });
});
