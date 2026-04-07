/**
 * 抽象 LLM 调用服务
 *
 * 提供统一的文本生成接口，底层可以使用 Claude SDK 或其他 provider。
 * 用于标题生成、记忆提取等辅助功能，使调用方不直接依赖 Claude SDK。
 */

import { getCurrentApiConfig, buildEnvForConfig, getClaudeCodePath } from "./claude-settings.js";
import { createClaudeProcessSpawner } from "./claude-process-spawner.js";
import { getRemoteModelConfig } from "./remote-config.js";

export interface LLMCompletionOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** 预构建的环境变量，跳过自动获取 */
  env?: Record<string, string | undefined>;
}

export interface LLMCompletionResult {
  success: boolean;
  text: string;
  model: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * 获取当前可用的模型和环境配置
 * 供调用方在需要额外逻辑（如代理模式工具模型）时使用
 */
export async function getModelAndEnv(): Promise<{
  config: Awaited<ReturnType<typeof getCurrentApiConfig>>;
  model: string | undefined;
  env: Record<string, string | undefined>;
}> {
  const config = await getCurrentApiConfig();
  if (!config) {
    return { config: null, model: undefined, env: { ...process.env } };
  }

  const configEnv = await buildEnvForConfig(config);
  const env = { ...process.env, ...configEnv };
  const model = config.model || process.env.VITE_DEFAULT_MODEL || process.env.ANTHROPIC_MODEL;

  return { config, model, env };
}

/**
 * 统一 LLM 文本生成接口
 *
 * 默认实现使用 Claude SDK 的 V1 query() API。
 * 后续可扩展为支持其他 provider。
 */
export async function llmComplete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
  const { prompt, systemPrompt, env: prebuiltEnv } = options;

  // 获取配置
  const config = await getCurrentApiConfig();
  if (!config) {
    return {
      success: false,
      text: "",
      model: "",
      error: "No API configuration available",
    };
  }

  const claudeCodePath = getClaudeCodePath();
  const configEnv = await buildEnvForConfig(config);
  const currentEnv = prebuiltEnv ?? { ...process.env, ...configEnv };
  const model = options.model || config.model || process.env.VITE_DEFAULT_MODEL || process.env.ANTHROPIC_MODEL;

  if (!model) {
    return {
      success: false,
      text: "",
      model: "",
      error: "No model configured",
    };
  }

  // 构建完整 prompt（如果有 systemPrompt 则拼接）
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n${prompt}`
    : prompt;

  try {
    let sdk: { query: typeof import("@anthropic-ai/claude-agent-sdk").query };
    try {
      sdk = await import("@anthropic-ai/claude-agent-sdk");
    } catch {
      return {
        success: false,
        text: "",
        model,
        error: "Claude SDK is not available. LLM completion requires Claude SDK.",
      };
    }

    const claudeSpawner = createClaudeProcessSpawner({
      smallFastModelId: (await getRemoteModelConfig()).smallFastModelId,
      onStderr: (data: string) => {
        console.error('[llm-service:stderr]', data.slice(0, 300));
      },
    });

    // 使用 V1 query() API，因为 V2 unstable_v2_prompt 不支持 spawnClaudeCodeProcess
    const q = sdk.query({
      prompt: fullPrompt,
      options: {
        model,
        env: currentEnv,
        pathToClaudeCodeExecutable: claudeCodePath,
        spawnClaudeCodeProcess: claudeSpawner,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
      },
    });

    let resultText = "";
    let isSuccess = false;

    for await (const msg of q) {
      if (msg.type === "result") {
        if ("result" in msg && msg.subtype === "success") {
          resultText = (msg as any).result ?? "";
          isSuccess = true;
        }
        break;
      }
    }

    if (isSuccess) {
      return {
        success: true,
        text: resultText,
        model,
      };
    }

    return {
      success: false,
      text: "",
      model,
      error: "LLM returned non-success result",
    };
  } catch (error) {
    return {
      success: false,
      text: "",
      model,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
