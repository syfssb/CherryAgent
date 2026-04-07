import { describe, expect, it } from "vitest";
import {
  decideContinueFailureStrategy,
  type DispatchAck,
} from "../PromptInput";

describe("PromptInput continue failure strategy", () => {
  it("SESSION_NOT_READY + 会话 error 时不自动新建，优先展示 ack.error", () => {
    const ack: DispatchAck = {
      success: false,
      code: "SESSION_NOT_READY",
      error: "网络连接失败，请稍后重试",
    };

    const decision = decideContinueFailureStrategy(ack, "error");

    expect(decision.action).toBe("stay_with_error");
    expect(decision.message).toBe("网络连接失败，请稍后重试");
  });

  it("SESSION_NOT_READY + 会话非 error 时允许自动降级新会话", () => {
    const ack: DispatchAck = {
      success: false,
      code: "SESSION_NOT_READY",
      error: "会话尚未准备完成，请稍后重试。",
    };

    const decision = decideContinueFailureStrategy(ack, "idle");

    expect(decision.action).toBe("fallback_to_new_session");
  });

  it("无 code 仅旧文本时仍兼容识别并降级", () => {
    const ack: DispatchAck = {
      success: false,
      error: "session has no resume id yet",
    };

    const decision = decideContinueFailureStrategy(ack, "completed");

    expect(decision.action).toBe("fallback_to_new_session");
  });

  it("普通失败时展示真实错误，不触发自动降级", () => {
    const ack: DispatchAck = {
      success: false,
      error: "请求超时，请检查网络",
    };

    const decision = decideContinueFailureStrategy(ack, "running");

    expect(decision.action).toBe("show_error");
    expect(decision.message).toBe("请求超时，请检查网络");
  });
});
