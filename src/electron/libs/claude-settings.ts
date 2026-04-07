/**
 * Claude Settings Module
 *
 * 支持两种模式:
 * 1. 代理模式: 通过云端代理服务使用 Claude (推荐,支持计费)
 * 2. 直连模式: 直接连接 Anthropic API (需要用户自己的 API Key)
 *
 * 优先级:
 * 代理模式 > 直连模式
 */

import { join } from "path";
import { existsSync } from "fs";
import { app } from "electron";
import { type ApiConfig } from "./config-store.js";
import { shouldUseProxy, getProxyApiConfig, buildProxyEnv, type ProxyApiConfig } from "./proxy-adapter.js";

// Get Claude Code CLI path
export function getClaudeCodePath(): string {
  if (app.isPackaged) {
    // For packaged apps, the SDK needs the explicit path to the CLI
    // The path should point to the unpackaged asar.unpacked directory
    const candidate = join(
      process.resourcesPath,
      'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk/cli.js'
    );
    if (!existsSync(candidate)) {
      console.error('[claude-settings] cli.js not found at expected path:', candidate,
        '\nThis is likely a packaging issue — ensure claude-agent-sdk is in asarUnpack.');
    }
    return candidate;
  }
  // In development, use node_modules CLI
  return join(app.getAppPath(), 'node_modules/@anthropic-ai/claude-agent-sdk/cli.js');
}

/**
 * 获取当前有效的 API 配置
 *
 * 优先使用代理模式,如果用户已登录
 */
export async function getCurrentApiConfig(model?: string): Promise<ApiConfig | ProxyApiConfig | null> {
  // 1. 优先尝试代理模式（已登录用户）
  try {
    const useProxy = await shouldUseProxy();
    if (useProxy) {
      const proxyConfig = await getProxyApiConfig(model);
      if (proxyConfig) {
        console.log("[claude-settings] Using proxy mode:", {
          baseURL: proxyConfig.baseURL,
          model: proxyConfig.model,
          isProxy: true
        });
        return proxyConfig;
      }
    }
  } catch (error) {
    console.warn("[claude-settings] Failed to check proxy mode:", error);
  }

  // 2. 回退到直连模式（使用本地 API Key）
  const apiKey =
    process.env.ANTHROPIC_API_KEY ||
    process.env.VITE_ANTHROPIC_API_KEY;

  if (apiKey) {
    const directModel = model ||
             process.env.ANTHROPIC_MODEL ||
             process.env.VITE_DEFAULT_MODEL ||
             null;

    if (!directModel) {
      console.warn("[claude-settings] Direct mode: no model specified or configured");
      return null;
    }

    const directConfig: ApiConfig = {
      apiKey,
      model: directModel,
      baseURL: process.env.ANTHROPIC_BASE_URL ||
               process.env.VITE_ANTHROPIC_BASE_URL ||
               'https://api.anthropic.com',
    };

    console.info("[claude-settings] Using direct API mode (local API key):", {
      model: directConfig.model,
      hasBaseURL: !!directConfig.baseURL
    });

    return directConfig;
  }

  // 3. 都不可用，提示用户配置
  console.warn("[claude-settings] No API configuration available. Please:");
  console.warn("  1. Login to use cloud service (proxy mode), OR");
  console.warn("  2. Set ANTHROPIC_API_KEY in environment variables");

  return null;
}

/**
 * 为配置构建环境变量
 */
export async function buildEnvForConfig(config: ApiConfig | ProxyApiConfig): Promise<Record<string, string>> {
  const baseEnv = { ...process.env } as Record<string, string>;

  // 检查是否是代理模式
  if ('isProxy' in config && config.isProxy) {
    // 代理模式 - 使用代理环境变量
    const proxyEnv = await buildProxyEnv();
    return {
      ...baseEnv,
      ...proxyEnv,
      ANTHROPIC_MODEL: config.model,
    };
  }

  // 直连模式 - 使用原有逻辑
  baseEnv.ANTHROPIC_AUTH_TOKEN = config.apiKey;
  baseEnv.ANTHROPIC_BASE_URL = config.baseURL;
  baseEnv.ANTHROPIC_MODEL = config.model;

  return baseEnv;
}
