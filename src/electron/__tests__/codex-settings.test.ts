import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
  },
}));

vi.mock("../libs/auth-service.js", () => ({
  getAccessToken: vi.fn(),
}));

vi.mock("../libs/proxy-client.js", () => ({
  getProxyConfig: vi.fn(),
}));

vi.mock("../libs/local-proxy.js", () => ({
  ensureLocalProxy: vi.fn(),
}));

describe("getCodexConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.CODEX_PATH;
    delete process.env.CODEX_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("直连模式优先走本地代理", async () => {
    process.env.OPENAI_API_KEY = "sk-direct";

    const { ensureLocalProxy } = await import("../libs/local-proxy.js");
    vi.mocked(ensureLocalProxy).mockResolvedValue({
      url: "http://127.0.0.1:34567",
      token: "token",
    });

    const { getCodexConfig } = await import("../libs/agent-runner/codex-settings.js");
    const config = await getCodexConfig("gpt-5.3-codex");

    expect(config).not.toBeNull();
    expect(config?.apiKey).toBe("token");
    expect(config?.model).toBe("gpt-5.3-codex");
    expect(config?.baseUrl).toBe("http://127.0.0.1:34567/v1");
    expect(ensureLocalProxy).toHaveBeenCalledWith("https://api.openai.com/v1");
  });

  it("直连模式本地代理失败时回退远端 baseUrl", async () => {
    process.env.OPENAI_API_KEY = "sk-direct";
    process.env.OPENAI_BASE_URL = "https://my-openai-proxy.example.com/v1/";

    const { ensureLocalProxy } = await import("../libs/local-proxy.js");
    vi.mocked(ensureLocalProxy).mockRejectedValue(new Error("port busy"));

    const { getCodexConfig } = await import("../libs/agent-runner/codex-settings.js");
    const config = await getCodexConfig("gpt-5.3-codex");

    expect(config).not.toBeNull();
    expect(config?.baseUrl).toBe("https://my-openai-proxy.example.com/v1");
    expect(ensureLocalProxy).toHaveBeenCalledWith("https://my-openai-proxy.example.com/v1");
  });

  it("代理模式优先走本地代理", async () => {
    const { getProxyConfig } = await import("../libs/proxy-client.js");
    const { getAccessToken } = await import("../libs/auth-service.js");
    const { ensureLocalProxy } = await import("../libs/local-proxy.js");

    vi.mocked(getProxyConfig).mockReturnValue({
      baseURL: "https://api.cherry-agent.com/api",
      apiKey: "",
      timeout: 120000,
    });
    vi.mocked(getAccessToken).mockResolvedValue("user-access-token");
    vi.mocked(ensureLocalProxy).mockResolvedValue({
      url: "http://127.0.0.1:45678",
      token: "token",
    });

    const { getCodexConfig } = await import("../libs/agent-runner/codex-settings.js");
    const config = await getCodexConfig("gpt-5.3-codex");

    expect(config).not.toBeNull();
    expect(config?.apiKey).toBe("token");
    expect(config?.baseUrl).toBe("http://127.0.0.1:45678/v1");
    expect(ensureLocalProxy).toHaveBeenCalledWith("https://api.cherry-agent.com/api/proxy/v1");
  });

  it("无可用凭据时返回 null", async () => {
    const { getProxyConfig } = await import("../libs/proxy-client.js");
    const { getAccessToken } = await import("../libs/auth-service.js");

    vi.mocked(getProxyConfig).mockReturnValue({
      baseURL: "",
      apiKey: "",
      timeout: 120000,
    });
    vi.mocked(getAccessToken).mockResolvedValue(null);

    const { getCodexConfig } = await import("../libs/agent-runner/codex-settings.js");
    const config = await getCodexConfig("gpt-5.3-codex");

    expect(config).toBeNull();
  });
});
