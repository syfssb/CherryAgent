/**
 * CodexAgentRunner — 接入 @openai/codex-sdk
 *
 * 实现 IAgentRunner 接口，将 Codex SDK 的事件流映射为中性 AgentRunnerEvent。
 * 使用动态 import 避免 SDK 不存在时编译失败。
 */

import type {
  IAgentRunner,
  AgentProvider,
  AgentRuntime,
  AgentRunnerOptions,
  AgentRunnerHandle,
  AgentEventCallback,
} from "./types.js";
import { getCodexConfig } from "./codex-settings.js";
import { proxyRequest } from "../proxy-client.js";
import { resolveEffectiveCwd } from "../cwd-resolver.js";
import { getSkillsDir } from "../skill-files.js";
import { shouldLoadSkillsPlugin } from "../skill-plugin-policy.js";
import { app } from "electron";
import { existsSync, statSync } from "fs";
import { join } from "path";

function buildPrompt(options: AgentRunnerOptions): string {
  const sections: string[] = [];

  const systemPrompt = options.contextInjection?.customSystemPrompt?.trim();
  if (systemPrompt) {
    sections.push(systemPrompt);
  }

  const memoryContext = options.contextInjection?.memoryContext?.trim();
  if (memoryContext) {
    sections.push(`# Memory\n${memoryContext}`);
  }

  // Codex SDK 没有 Skill tool，需要注入完整技能内容（非摘要）
  // 优先使用 fullSkillContext（包含完整 SKILL.md body），回退到 skillContext（仅摘要）
  const fullSkillContext = options.contextInjection?.fullSkillContext?.trim();
  const skillContext = options.contextInjection?.skillContext?.trim();
  if (fullSkillContext) {
    sections.push(fullSkillContext);
  } else if (skillContext) {
    sections.push(`# Skills\n${skillContext}`);
  }

  // 历史对话恢复（SDK 会话失效时注入）
  const historyContext = options.contextInjection?.historyContext?.trim();
  if (historyContext) {
    sections.push(
      `# Conversation History\n以下是本会话的历史对话记录，仅供参考上下文，请勿重复复述。当前用户问题在下方分隔线之后。\n\n${historyContext}`
    );
  }

  if (options.images && options.images.length > 0) {
    sections.push(
      `# Images\n用户附带了 ${options.images.length} 张图片。当前 Codex Runner 暂不支持 base64 图片直传，请基于文本上下文继续。`,
    );
  }

  sections.push(options.prompt);
  return sections.join("\n\n");
}

async function calculateCost(model: string, inputTokens: number, outputTokens: number): Promise<number> {
  try {
    const result = await proxyRequest<{ totalCredits: number }>(
      `/usage/calculate?model=${encodeURIComponent(model)}&input=${inputTokens}&output=${outputTokens}&cacheRead=0&cacheWrite=0`,
      { method: "GET" },
    );
    // 与 Claude runner 保持一致：1 USD = 72 积分
    return (result.totalCredits ?? 0) / 72;
  } catch {
    return 0;
  }
}

export class CodexAgentRunner implements IAgentRunner {
  readonly provider: AgentProvider = "codex";
  readonly runtime: AgentRuntime = "codex-sdk";

  async run(
    options: AgentRunnerOptions,
    onEvent: AgentEventCallback,
  ): Promise<AgentRunnerHandle> {
    const config = await getCodexConfig(options.model);
    if (!config) {
      throw new Error(
        "CodexAgentRunner: 缺少可用认证（OPENAI_API_KEY 或登录态 token）。请先登录或配置 OpenAI 环境变量。",
      );
    }

    // 动态 import，避免 SDK 不存在时崩溃
    let CodexSDK: typeof import("@openai/codex-sdk");
    try {
      CodexSDK = await import("@openai/codex-sdk");
    } catch (err) {
      throw new Error(
        `CodexAgentRunner: Failed to load @openai/codex-sdk. ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const { Codex } = CodexSDK;

    // 构建 AbortController
    const abortController = options.abortController ?? new AbortController();

    const fallbackCwd = (() => {
      try {
        if (app.isReady()) {
          return app.getPath("home");
        }
      } catch {
        // ignore
      }
      return process.cwd();
    })();

    const cwdResolution = await resolveEffectiveCwd({
      sessionCwd: options.cwd,
      fallbackCwd,
    });
    const effectiveCwd = cwdResolution.cwd;
    if (cwdResolution.source !== "session") {
      console.warn(
        "[codex-runner] Invalid cwd, fallback applied:",
        JSON.stringify({
          requestedCwd: options.cwd ?? null,
          fallbackCwd,
          resolvedCwd: effectiveCwd,
          source: cwdResolution.source,
          reason: cwdResolution.reason,
        }),
      );
    }

    const pluginDirs = (options.pluginPaths ?? []).filter((dir) => {
      try {
        return statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });
    if ((options.pluginPaths?.length ?? 0) > pluginDirs.length) {
      console.warn(
        "[codex-runner] Ignored invalid plugin paths:",
        JSON.stringify({
          input: options.pluginPaths ?? [],
          kept: pluginDirs,
        }),
      );
    }

    // 仅在当前会话真的启用了 skills 上下文时才挂载 skills 目录
    const shouldAttachSkillDirectories =
      pluginDirs.length > 0 || shouldLoadSkillsPlugin(options.contextInjection);
    const additionalDirectories = shouldAttachSkillDirectories ? [...pluginDirs] : [];
    if (shouldAttachSkillDirectories) {
      try {
        const sdkSkillsDir = join(getSkillsDir(), "skills");
        if (existsSync(sdkSkillsDir) && !additionalDirectories.includes(sdkSkillsDir)) {
          additionalDirectories.push(sdkSkillsDir);
        }
      } catch {
        // ignore — skills dir not available
      }
    }

    // 初始化 Codex 客户端
    const codex = new Codex({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      env: options.env,
      codexPathOverride: config.codexPathOverride,
      // 强制使用 openai provider，避免被用户全局 ~/.codex/config.toml 的 model_provider 覆盖
      config: {
        model_provider: "openai",
      },
    });

    // 权限模式映射
    const approvalPolicyMap: Record<string, "never" | "on-request" | "on-failure" | "untrusted"> = {
      bypassPermissions: "never",
      acceptEdits: "on-request",
      default: "untrusted",
    };
    const approvalPolicy =
      approvalPolicyMap[options.permissionMode ?? "bypassPermissions"] ?? "on-request";

    // sandbox 模式映射：与 approvalPolicy 联动
    const sandboxModeMap: Record<string, "read-only" | "workspace-write" | "danger-full-access"> = {
      bypassPermissions: "danger-full-access",
      acceptEdits: "workspace-write",
      default: "read-only",
    };
    const sandboxMode =
      sandboxModeMap[options.permissionMode ?? "bypassPermissions"] ?? "workspace-write";

    const shouldCheckPermission =
      options.permissionMode !== "bypassPermissions" && typeof options.permissionHandler === "function";

    const checkPermission = async (
      toolUseId: string,
      toolName: string,
      input: unknown,
    ): Promise<boolean> => {
      if (!shouldCheckPermission || !options.permissionHandler) {
        return true;
      }

      const decision = await options.permissionHandler({
        toolUseId,
        toolName,
        input,
      });

      if (decision.behavior === "deny") {
        onEvent({
          type: "message",
          message: {
            type: "tool_result",
            toolUseId,
            output: decision.message ?? `用户拒绝执行 ${toolName}`,
            isError: true,
          },
        });
        onEvent({
          type: "status",
          status: "error",
          error: decision.message ?? `Permission denied: ${toolName}`,
        });
        abortController.abort();
        return false;
      }

      return true;
    };

    // 启动或恢复 thread
    // 将 thinkingEffort 映射到 modelReasoningEffort
    const reasoningEffortMap: Record<string, "low" | "medium" | "high"> = {
      off: "low",
      low: "low",
      medium: "medium",
      high: "high",
    };
    const modelReasoningEffort = reasoningEffortMap[options.thinkingEffort ?? "medium"] ?? "medium";

    const threadOptions = {
      model: options.model ?? config.model,
      workingDirectory: effectiveCwd,
      approvalPolicy,
      sandboxMode,
      networkAccessEnabled: true,
      skipGitRepoCheck: true,
      modelReasoningEffort,
      ...(additionalDirectories.length ? { additionalDirectories } : {}),
    };

    const thread = options.resumeSessionId
      ? codex.resumeThread(options.resumeSessionId, threadOptions)
      : codex.startThread(threadOptions);

    onEvent({ type: "status", status: "running" });
    const prompt = buildPrompt(options);

    // 启动流式 turn
    const streamedTurn = await thread.runStreamed(prompt, {
      signal: abortController.signal,
    });

    // 异步消费事件流
    (async () => {
      try {
        let lastAgentMessageText = "";
        for await (const event of streamedTurn.events) {
          if (abortController.signal.aborted) break;

          switch (event.type) {
            case "thread.started": {
              const sessionId = event.thread_id ?? thread.id;
              if (sessionId) {
                onEvent({ type: "session_id", sessionId });
              }
              break;
            }

            case "turn.started": {
              onEvent({ type: "status", status: "running" });
              break;
            }

            case "item.started":
            case "item.updated":
            case "item.completed": {
              const item = event.item;

              if (item.type === "agent_message") {
                // 流式打字机效果：利用 item.updated 的累积文本快照计算增量
                if (event.type === "item.started") {
                  lastAgentMessageText = "";
                  onEvent({ type: "message", message: { type: "text_delta_start" } });
                } else if (event.type === "item.updated" && item.text) {
                  const delta = item.text.slice(lastAgentMessageText.length);
                  if (delta) {
                    onEvent({ type: "message", message: { type: "text_delta", text: delta } });
                  }
                  lastAgentMessageText = item.text;
                } else if (event.type === "item.completed") {
                  // 发送剩余 delta（如果有）
                  if (item.text && item.text.length > lastAgentMessageText.length) {
                    const delta = item.text.slice(lastAgentMessageText.length);
                    onEvent({ type: "message", message: { type: "text_delta", text: delta } });
                  }
                  onEvent({ type: "message", message: { type: "text_delta_stop" } });
                  lastAgentMessageText = "";
                  // 发送完整文本消息（用于持久化到消息列表）
                  if (item.text) {
                    onEvent({
                      type: "message",
                      message: { type: "text", text: item.text },
                    });
                  }
                }
              } else if (item.type === "command_execution") {
                if (event.type === "item.started") {
                  const allowed = await checkPermission(item.id, "command_execution", { command: item.command });
                  if (!allowed) {
                    return;
                  }
                  onEvent({
                    type: "message",
                    message: {
                      type: "tool_use",
                      toolUseId: item.id,
                      toolName: "command_execution",
                      input: { command: item.command },
                    },
                  });
                } else if (event.type === "item.completed") {
                  onEvent({
                    type: "message",
                    message: {
                      type: "tool_result",
                      toolUseId: item.id,
                      output: item.aggregated_output,
                      isError: item.status === "failed",
                    },
                  });
                }
              } else if (item.type === "file_change" && event.type === "item.completed") {
                const summary = item.changes
                  .map((c) => `${c.kind}: ${c.path}`)
                  .join("\n");
                onEvent({
                  type: "message",
                  message: {
                    type: "tool_result",
                    toolUseId: item.id,
                    output: summary,
                    isError: item.status === "failed",
                  },
                });
              } else if (item.type === "mcp_tool_call") {
                if (event.type === "item.started") {
                  const toolName = `mcp:${item.server}:${item.tool}`;
                  const allowed = await checkPermission(item.id, toolName, item.arguments);
                  if (!allowed) {
                    return;
                  }
                  onEvent({
                    type: "message",
                    message: {
                      type: "tool_use",
                      toolUseId: item.id,
                      toolName,
                      input: item.arguments,
                    },
                  });
                } else if (event.type === "item.completed") {
                  const output = item.error
                    ? item.error.message
                    : JSON.stringify(item.result ?? {});
                  onEvent({
                    type: "message",
                    message: {
                      type: "tool_result",
                      toolUseId: item.id,
                      output,
                      isError: item.status === "failed",
                    },
                  });
                }
              } else if (item.type === "reasoning" && event.type === "item.completed") {
                if (item.text) {
                  onEvent({
                    type: "message",
                    message: {
                      type: "thinking",
                      thinking: item.text,
                    },
                  });
                }
              }
              break;
            }

            case "turn.completed": {
              const { usage } = event;
              const totalTokens = usage.input_tokens + usage.output_tokens;
              const resolvedModel = options.model ?? config.model;
              const cost = await calculateCost(
                resolvedModel,
                usage.input_tokens,
                usage.output_tokens,
              );
              onEvent({
                type: "message",
                message: {
                  type: "system",
                  subtype: "status",
                  data: {
                    usage: {
                      inputTokens: usage.input_tokens,
                      outputTokens: usage.output_tokens,
                      totalTokens,
                    },
                  },
                },
                usage: {
                  inputTokens: usage.input_tokens,
                  outputTokens: usage.output_tokens,
                  totalTokens,
                  cost,
                  latencyMs: 0,
                  model: resolvedModel,
                  provider: "codex",
                },
              });
              onEvent({ type: "status", status: "idle" });
              break;
            }

            case "turn.failed": {
              onEvent({
                type: "status",
                status: "error",
                error: event.error.message,
              });
              break;
            }

            case "error": {
              onEvent({
                type: "status",
                status: "error",
                error: event.message,
              });
              break;
            }

            default:
              break;
          }
        }

        // 流结束后补发 session_id（如果之前没发过）
        const finalSessionId = thread.id;
        if (finalSessionId) {
          onEvent({ type: "session_id", sessionId: finalSessionId });
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          onEvent({
            type: "status",
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    return {
      abort: () => abortController.abort(),
    };
  }
}
