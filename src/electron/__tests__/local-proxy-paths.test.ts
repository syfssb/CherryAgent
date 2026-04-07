import http from "node:http";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureLocalProxy } from "../libs/local-proxy.js";

vi.mock("../libs/auth-service.js", () => ({
  getAccessToken: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../libs/proxy-client.js", () => ({
  getProxyConfig: vi.fn(),
}));

interface LocalRequestResult {
  statusCode: number;
  body: string;
}

function requestLocalProxy(url: string, path: string, proxyToken?: string): Promise<LocalRequestResult> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path,
        method: "POST",
        headers: {
          ...(proxyToken ? { "x-proxy-token": proxyToken } : {}),
          "Content-Type": "application/json",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("error", reject);
    req.write(JSON.stringify({ ping: true }));
    req.end();
  });
}

describe("local-proxy path mapping", () => {
  const originalFetch = global.fetch;
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  afterAll(() => {
    warnSpy.mockRestore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(async () => {
    const { getAccessToken, refresh } = await import("../libs/auth-service.js");
    const { getProxyConfig } = await import("../libs/proxy-client.js");

    vi.mocked(getAccessToken).mockResolvedValue("user-access-token");
    vi.mocked(refresh).mockResolvedValue({ success: false });
    vi.mocked(getProxyConfig).mockReturnValue({
      baseURL: "https://example.com/api",
      apiKey: undefined,
      timeout: 120000,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("支持 /v1/responses 转发", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const local = await ensureLocalProxy("https://example.com/api/proxy/v1");
    const result = await requestLocalProxy(local.url, "/v1/responses", local.token);

    expect(result.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toBe("https://example.com/api/proxy/v1/responses");
    expect(vi.mocked(global.fetch).mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ authorization: "Bearer user-access-token" }),
    });
  });

  it("支持 /responses 透传并正常转发", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const local = await ensureLocalProxy("https://example.com/api/proxy/v1");
    const result = await requestLocalProxy(local.url, "/responses", local.token);

    expect(result.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toBe("https://example.com/api/proxy/v1/responses");
  });

  it("支持 /api/proxy/v1/responses 转发", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const local = await ensureLocalProxy("https://example.com/api/proxy/v1");
    const result = await requestLocalProxy(local.url, "/api/proxy/v1/responses", local.token);

    expect(result.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toBe("https://example.com/api/proxy/v1/responses");
  });

  it("不支持路径返回 404 并输出上下文日志", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const local = await ensureLocalProxy("https://example.com/api/proxy/v1");
    const result = await requestLocalProxy(local.url, "/favicon.ico", local.token);

    expect(result.statusCode).toBe(404);
    expect(result.body).toContain("Unsupported path");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[local-proxy] Unsupported path"));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("缺少代理令牌时返回 401", async () => {
    const local = await ensureLocalProxy("https://example.com/api/proxy/v1");
    const result = await requestLocalProxy(local.url, "/v1/responses");

    expect(result.statusCode).toBe(401);
    expect(result.body).toContain("invalid local proxy token");
  });
});
