import { describe, expect, it, vi } from "vitest";
import { ProxyError, proxyRequest } from "../libs/proxy-client.js";

vi.mock("../libs/secure-storage.js", () => ({
  getToken: vi.fn(),
}));

vi.mock("../libs/auth-service.js", () => ({
  getAccessToken: vi.fn(),
}));

describe("proxy-client error code compatibility", () => {
  it("应保留 code-only 错误结构中的 error.code", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        error: {
          code: "SRV_9001",
          message: "认证过程发生错误",
        },
      }),
    }) as unknown as typeof fetch;

    let captured: ProxyError | null = null;
    try {
      await proxyRequest("/api/proxy/messages", {
        method: "POST",
        body: { model: "claude-3-5-sonnet", messages: [] },
        config: { baseURL: "http://localhost:3000", apiKey: "sk-test" },
      });
    } catch (error) {
      captured = error as ProxyError;
    }

    expect(captured).toBeInstanceOf(ProxyError);
    expect(captured?.code).toBe("SRV_9001");
    expect(captured?.message).toBe("认证过程发生错误");
  });
});
