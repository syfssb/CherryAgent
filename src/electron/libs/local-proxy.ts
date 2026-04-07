import http from "node:http";
import crypto from "node:crypto";
import { Readable } from "node:stream";

let server: http.Server | null = null;
let localBaseURL: string | null = null;
let remoteBaseURL: string | null = null;
let starting: Promise<{ url: string; token: string }> | null = null;
let proxySecret: string | null = null;

function getSingleHeaderValue(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) {
    return header[0] ?? null;
  }
  return header ?? null;
}

function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isProxyRemoteBase(remoteBase: string): boolean {
  try {
    const pathname = new URL(remoteBase).pathname.replace(/\/+$/, "");
    return (
      pathname.endsWith("/api/proxy") ||
      pathname.endsWith("/api/proxy/v1") ||
      pathname.endsWith("/proxy") ||
      pathname.endsWith("/proxy/v1")
    );
  } catch {
    return false;
  }
}

async function getProxyModeAuthorizationHeader(): Promise<string | null> {
  const { getProxyConfig } = await import("./proxy-client.js");
  const config = getProxyConfig();

  if (config.apiKey) {
    return `Bearer ${config.apiKey}`;
  }

  const { getAccessToken } = await import("./auth-service.js");
  const accessToken = await getAccessToken();
  return accessToken ? `Bearer ${accessToken}` : null;
}

async function resolveUpstreamHeaders(
  remoteBase: string,
  requestHeaders: Record<string, string>,
): Promise<Record<string, string>> {
  if (isProxyRemoteBase(remoteBase)) {
    const authorization = await getProxyModeAuthorizationHeader();
    return authorization ? { authorization } : {};
  }

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiApiKey) {
    return { authorization: `Bearer ${openAiApiKey}` };
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicApiKey) {
    const anthropicHeaders: Record<string, string> = {
      "x-api-key": anthropicApiKey,
    };

    const anthropicVersion = requestHeaders["anthropic-version"];
    if (anthropicVersion) {
      anthropicHeaders["anthropic-version"] = anthropicVersion;
    }

    const betaHeader = requestHeaders["anthropic-beta"];
    if (betaHeader) {
      anthropicHeaders["anthropic-beta"] = betaHeader;
    }

    return anthropicHeaders;
  }

  return {};
}

async function getRefreshedAuthorizationHeader(
  remoteBase: string,
  currentAuthorization?: string
): Promise<string | null> {
  try {
    if (!isProxyRemoteBase(remoteBase)) {
      return null;
    }

    const { getProxyConfig } = await import("./proxy-client.js");
    const config = getProxyConfig();

    // API Key 模式不做 token refresh 重试
    if (config.apiKey) {
      return null;
    }

    const { getAccessToken, refresh } = await import("./auth-service.js");

    const currentToken = await getAccessToken();
    if (currentToken) {
      const authorization = `Bearer ${currentToken}`;
      if (!currentAuthorization || authorization !== currentAuthorization) {
        return authorization;
      }
    }

    const refreshResult = await refresh();
    if (!refreshResult.success) {
      return null;
    }

    const refreshedToken = await getAccessToken();
    if (!refreshedToken) {
      return null;
    }

    const refreshedAuthorization = `Bearer ${refreshedToken}`;
    if (currentAuthorization && refreshedAuthorization === currentAuthorization) {
      return null;
    }

    return refreshedAuthorization;
  } catch (error) {
    console.warn("[local-proxy] Failed to refresh auth token:", error);
    return null;
  }
}

function joinPaths(basePath: string, extraPath: string): string {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  if (!extraPath || extraPath === "/") {
    return base || "/";
  }
  const extra = extraPath.startsWith("/") ? extraPath : `/${extraPath}`;
  return `${base}${extra}`;
}

function normalizeV1Path(pathname: string, keepV1: boolean): string {
  if (pathname === "/v1" || pathname.startsWith("/v1/")) {
    return keepV1 ? pathname : pathname.replace(/^\/v1/, "") || "/";
  }
  return pathname;
}

function mapRequestPath(pathname: string, keepV1: boolean): string | null {
  if (pathname === "/v1" || pathname.startsWith("/v1/")) {
    return normalizeV1Path(pathname, keepV1);
  }

  if (pathname === "/api/proxy" || pathname.startsWith("/api/proxy/")) {
    const stripped = pathname.replace(/^\/api\/proxy/, "") || "/";
    return normalizeV1Path(stripped, keepV1);
  }

  // 兼容 Codex 直接请求的 API 路径（如 /responses、/chat/completions）
  if (pathname.startsWith("/")) {
    const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";
    if (lastSegment.includes(".")) {
      return null;
    }
    return pathname;
  }

  return null;
}

function buildUpstreamUrl(base: URL, mappedPath: string, search: string): string {
  const upstream = new URL(base.toString());
  upstream.pathname = joinPaths(upstream.pathname, mappedPath);
  upstream.search = search;
  return upstream.toString();
}

async function fetchUpstream(
  url: string,
  method: string | undefined,
  headers: Record<string, string>,
  body?: Uint8Array
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers,
  };
  if (body) {
    (init as any).body = body;
  }
  return fetch(url, init);
}

async function handleProxyRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!remoteBaseURL || !localBaseURL) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Local proxy not initialized" }));
    return;
  }

  // 验证本地代理令牌。
  // SDK 可以通过 x-proxy-token / x-api-key / Authorization: Bearer 三种形式携带，
  // 但都必须与主进程生成的短期 proxySecret 精确匹配。
  const explicitProxyToken = getSingleHeaderValue(req.headers["x-proxy-token"]);
  const apiKeyToken = getSingleHeaderValue(req.headers["x-api-key"]);
  const authorizationToken = extractBearerToken(getSingleHeaderValue(req.headers.authorization));
  const presentedProxyToken = explicitProxyToken || apiKeyToken || authorizationToken;

  if (!proxySecret || presentedProxyToken !== proxySecret) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unauthorized: invalid local proxy token" }));
    return;
  }

  try {
    const reqUrl = new URL(req.url ?? "/", localBaseURL);
    const remotePath = new URL(remoteBaseURL).pathname.replace(/\/+$/, "");
    const keepV1 = remotePath === "" || remotePath === "/";
    const mappedPath = mapRequestPath(reqUrl.pathname, keepV1);
    if (!mappedPath) {
      console.warn(
        `[local-proxy] Unsupported path: ${JSON.stringify({
          path: reqUrl.pathname,
          remoteBase: remoteBaseURL,
          keepV1,
        })}`,
      );
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `Unsupported path: ${reqUrl.pathname}` }));
      return;
    }

    const upstreamBase = new URL(remoteBaseURL);

    const headers = { ...req.headers } as Record<string, string | string[] | undefined>;
    delete headers.host;

    delete headers.authorization;
    delete headers["x-api-key"];
    delete headers["x-proxy-token"];

    let body: Buffer | undefined;
    if (req.method && !["GET", "HEAD"].includes(req.method.toUpperCase())) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      if (chunks.length) {
        body = Buffer.concat(chunks);
      }
    }


    const fetchBody = body ? new Uint8Array(body) : undefined;
    const method = req.method;
    const safeHeaders = Object.fromEntries(
      Object.entries(headers)
        .map(([key, value]) => [key, getSingleHeaderValue(value)])
        .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
    );
    const upstreamHeaders = await resolveUpstreamHeaders(remoteBaseURL, safeHeaders);

    if (Object.keys(upstreamHeaders).length === 0) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Local proxy has no upstream credentials" }));
      return;
    }

    const requestHeaders = {
      ...safeHeaders,
      ...upstreamHeaders,
    };
    const primaryUrl = buildUpstreamUrl(upstreamBase, mappedPath, reqUrl.search);

    console.info(`[local-proxy] ${method} ${reqUrl.pathname} -> ${primaryUrl}`);
    let upstreamResponse = await fetchUpstream(primaryUrl, method, requestHeaders, fetchBody);

    if (upstreamResponse.status === 401) {
      const refreshedAuthorization = await getRefreshedAuthorizationHeader(remoteBaseURL, requestHeaders.authorization);
      if (refreshedAuthorization) {
        console.warn("[local-proxy] Received 401, refreshed token and retrying once");
        const retryHeaders = {
          ...requestHeaders,
          authorization: refreshedAuthorization,
        };
        upstreamResponse = await fetchUpstream(primaryUrl, method, retryHeaders, fetchBody);
      }
    }

    if (upstreamResponse.status === 404 && mappedPath.startsWith("/")) {
      const fallbackPath = mappedPath.startsWith("/v1/") ? mappedPath.replace(/^\/v1/, "") : `/v1${mappedPath}`;
      if (fallbackPath !== mappedPath) {
        const fallbackUrl = buildUpstreamUrl(upstreamBase, fallbackPath, reqUrl.search);
        console.warn(`[local-proxy] 404 from ${primaryUrl}, retrying ${fallbackUrl}`);
        upstreamResponse = await fetchUpstream(fallbackUrl, method, requestHeaders, fetchBody);
      }
    }

    res.statusCode = upstreamResponse.status;
    upstreamResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") {
        return;
      }
      res.setHeader(key, value);
    });

    if (!upstreamResponse.ok) {
      const text = await upstreamResponse.text();
      console.warn(
        `[local-proxy] Upstream ${upstreamResponse.status} ${upstreamResponse.statusText}: ${text.slice(0, 500)}`
      );
      res.end(text);
      return;
    }

    if (upstreamResponse.body) {
      const readable = Readable.fromWeb(upstreamResponse.body as any);
      readable.on('error', (err) => {
        console.error('[local-proxy] Upstream stream error:', err.message);
        if (!res.writableEnded) res.end();
      });
      req.on('close', () => {
        readable.destroy();
      });
      readable.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Local proxy error",
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

async function closeServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
  server = null;
  localBaseURL = null;
  remoteBaseURL = null;
  proxySecret = null;
}

export async function ensureLocalProxy(remoteBase: string): Promise<{ url: string; token: string }> {
  if (server && localBaseURL && remoteBaseURL === remoteBase && proxySecret) {
    return { url: localBaseURL, token: proxySecret };
  }

  if (server) {
    await closeServer();
  }

  if (starting) {
    return starting;
  }

  starting = new Promise<{ url: string; token: string }>((resolve, reject) => {
    proxySecret = crypto.randomBytes(32).toString("hex");

    const nextServer = http.createServer((req, res) => {
      void handleProxyRequest(req, res);
    });

    nextServer.listen(0, "127.0.0.1", () => {
      const address = nextServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate local proxy port"));
        return;
      }
      server = nextServer;
      remoteBaseURL = remoteBase;
      localBaseURL = `http://127.0.0.1:${address.port}`;
      console.info(`[local-proxy] Started on ${localBaseURL} -> ${remoteBaseURL}`);
      resolve({ url: localBaseURL, token: proxySecret! });
      starting = null;
    });

    nextServer.on("error", (err) => {
      starting = null;
      reject(err);
    });
  });

  return starting;
}
