import { describe, expect, it } from "vitest";
import {
  buildFatalRunnerErrorPayload,
  isFatalRunnerStderr,
  isLoginRequiredRunnerError,
} from "../libs/runner-errors.js";

describe("runner fatal error helpers", () => {
  it("AUTH_1001 应被识别为登录错误", () => {
    expect(isLoginRequiredRunnerError('API Error: 401 {"error":{"code":"AUTH_1001","message":"Missing authentication credentials."}}')).toBe(true);
  });

  it("致命 stderr 应被识别并归一成友好错误", () => {
    expect(isFatalRunnerStderr("context_length_exceeded: maximum context length reached")).toBe(true);
    expect(buildFatalRunnerErrorPayload("fatal_api_error", "context_length_exceeded: maximum context length reached")).toEqual({
      error: "上下文过长，请开启新会话或缩短输入后重试。",
      metadata: {
        errorType: "FatalApiError",
      },
    });
  });

  it("登录 fatal abort 应返回 AUTH_1001 和 needsAuth", () => {
    expect(buildFatalRunnerErrorPayload("login_required")).toEqual({
      error: "AUTH_1001",
      metadata: {
        errorType: "UnauthenticatedError",
        needsAuth: true,
      },
    });
  });
});
