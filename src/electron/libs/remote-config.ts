/**
 * 远程模型配置读取（带内存缓存）
 *
 * 从 api-server 的 /api/models/tool-model 端点获取后台配置的辅助模型 ID，
 * 供 spawner / runner / llm-service / title-generator 等模块共用。
 * 60 秒内重复调用直接返回缓存，避免每次启动会话都请求后端。
 */

import { getCurrentApiConfig } from "./claude-settings.js";
import { getProxyConfig } from "./proxy-client.js";

export interface RemoteModelConfig {
  toolModelId: string;
  smallFastModelId: string;
}

const EMPTY_CONFIG: RemoteModelConfig = { toolModelId: "", smallFastModelId: "" };
const TTL_MS = 60_000; // 60s

let cache: { data: RemoteModelConfig; ts: number } | null = null;

/**
 * 获取后台配置的模型 ID（toolModel + smallFastModel）。
 *
 * - 仅在代理模式下有效（直连模式返回空配置）
 * - 60 秒缓存，失败时 graceful fallback 到空字符串
 */
export async function getRemoteModelConfig(): Promise<RemoteModelConfig> {
  // 命中缓存
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return cache.data;
  }

  const config = await getCurrentApiConfig();
  if (!config || !("isProxy" in config) || !config.isProxy) {
    return EMPTY_CONFIG;
  }

  try {
    const proxyConfig = getProxyConfig();
    const apiBase = proxyConfig.baseURL?.replace(/\/+$/, "");
    if (!apiBase) return EMPTY_CONFIG;

    const url = `${apiBase}/models/tool-model`;
    const authToken = config.apiKey;
    const response = await fetch(url, {
      method: "GET",
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const json = (await response.json()) as {
        data?: { toolModelId?: string; smallFastModelId?: string };
      };
      const result: RemoteModelConfig = {
        toolModelId: json.data?.toolModelId ?? "",
        smallFastModelId: json.data?.smallFastModelId ?? "",
      };
      cache = { data: result, ts: Date.now() };
      return result;
    }
  } catch (error) {
    console.warn("[remote-config] Failed to fetch model config:", error);
  }

  return EMPTY_CONFIG;
}

/** 手动清除缓存（用于测试或配置变更后强制刷新） */
export function clearRemoteConfigCache(): void {
  cache = null;
}
