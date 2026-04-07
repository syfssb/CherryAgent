/**
 * Codex SDK 配置管理
 *
 * 管理 Codex 运行时所需的 API Key、模型等配置。
 * 优先从环境变量读取，回退到登录态代理配置。
 */

import { getAccessToken } from "../auth-service.js";
import { getProxyConfig } from "../proxy-client.js";
import { ensureLocalProxy } from "../local-proxy.js";
import { app } from "electron";
import { existsSync } from "fs";
import { join } from "path";

export interface CodexConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  codexPathOverride?: string;
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

function normalizeProxyBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api/proxy/v1")) return trimmed;
  if (trimmed.endsWith("/api/proxy") || trimmed.endsWith("/proxy")) return `${trimmed}/v1`;
  if (trimmed.endsWith("/api")) return `${trimmed}/proxy/v1`;
  return `${trimmed}/api/proxy/v1`;
}

function normalizeDirectBaseUrl(baseUrl?: string): string {
  if (!baseUrl?.trim()) {
    return DEFAULT_OPENAI_BASE_URL;
  }
  return baseUrl.trim().replace(/\/+$/, "");
}

function sanitizeBaseForLog(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return baseUrl;
  }
}

async function resolveLocalFirstBaseUrl(
  remoteBase: string,
  mode: "direct" | "proxy",
): Promise<{ baseUrl: string; proxyToken?: string }> {
  const normalizedRemote = remoteBase.trim().replace(/\/+$/, "");
  try {
    const localProxy = await ensureLocalProxy(normalizedRemote);
    const localBase = `${localProxy.url}/v1`;
    console.info(
      "[codex-settings] Resolved base URL:",
      JSON.stringify({
        mode,
        localProxyEnabled: true,
        remoteBase: sanitizeBaseForLog(normalizedRemote),
        resolvedBase: localBase,
      }),
    );
    return {
      baseUrl: localBase,
      proxyToken: localProxy.token,
    };
  } catch (error) {
    console.warn(
      "[codex-settings] Local proxy unavailable, fallback to remote base:",
      JSON.stringify({
        mode,
        localProxyEnabled: false,
        remoteBase: sanitizeBaseForLog(normalizedRemote),
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
    return { baseUrl: normalizedRemote };
  }
}

function getPackagedCodexPathOverride(): string | undefined {
  if (!app.isPackaged) return undefined;

  const platform = process.platform;
  const arch = process.arch;
  const executableName = platform === "win32" ? "codex.exe" : "codex";

  const packageByPlatformArch: Record<string, string> = {
    "darwin:arm64": "@openai/codex-darwin-arm64",
    "darwin:x64": "@openai/codex-darwin-x64",
    "linux:arm64": "@openai/codex-linux-arm64",
    "linux:x64": "@openai/codex-linux-x64",
    "win32:arm64": "@openai/codex-win32-arm64",
    "win32:x64": "@openai/codex-win32-x64",
  };

  const tripleByPlatformArch: Record<string, string> = {
    "darwin:arm64": "aarch64-apple-darwin",
    "darwin:x64": "x86_64-apple-darwin",
    "linux:arm64": "aarch64-unknown-linux-musl",
    "linux:x64": "x86_64-unknown-linux-musl",
    "win32:arm64": "aarch64-pc-windows-msvc",
    "win32:x64": "x86_64-pc-windows-msvc",
  };

  const key = `${platform}:${arch}`;
  const platformPackage = packageByPlatformArch[key];
  const triple = tripleByPlatformArch[key];

  if (!platformPackage || !triple) {
    return undefined;
  }

  const candidate = join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    platformPackage,
    "vendor",
    triple,
    "codex",
    executableName,
  );

  return existsSync(candidate) ? candidate : undefined;
}

export async function getCodexConfig(modelHint?: string): Promise<CodexConfig | null> {
  const envApiKey = process.env.OPENAI_API_KEY?.trim();
  const envBaseUrl = process.env.OPENAI_BASE_URL?.trim();
  const envCodexPath = process.env.CODEX_PATH?.trim();
  const packagedCodexPath = getPackagedCodexPathOverride();
  const codexPathOverride = envCodexPath || packagedCodexPath;
  const model = modelHint || process.env.CODEX_MODEL || "codex";

  // 兼容：允许直连 OpenAI（开发或自托管场景）
  if (envApiKey) {
    const remoteBase = normalizeDirectBaseUrl(envBaseUrl);
    const resolved = await resolveLocalFirstBaseUrl(remoteBase, "direct");
    return {
      apiKey: resolved.proxyToken || envApiKey,
      model,
      baseUrl: resolved.baseUrl,
      codexPathOverride,
    };
  }

  // 默认走云端代理：使用登录态 token + /api/proxy/v1/responses
  const proxyConfig = getProxyConfig();
  const authToken = proxyConfig.apiKey?.trim() || await getAccessToken();
  const proxyBase = proxyConfig.baseURL?.trim();

  if (!authToken || !proxyBase) {
    return null;
  }

  const remoteBase = normalizeProxyBaseUrl(proxyBase);
  const resolved = await resolveLocalFirstBaseUrl(remoteBase, "proxy");

  return {
    apiKey: resolved.proxyToken || authToken,
    model,
    baseUrl: resolved.baseUrl,
    codexPathOverride,
  };
}
