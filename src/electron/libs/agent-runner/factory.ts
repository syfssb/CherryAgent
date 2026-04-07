/**
 * AgentRunnerFactory — 根据 provider 创建对应的 Runner 实例
 */

import type { AgentProvider, IAgentRunner } from "./types.js";
import { isCodexEnabled } from "../feature-flags.js";

/**
 * 延迟导入 runner 实现，避免未安装 SDK 时启动崩溃
 */
async function createClaudeRunner(): Promise<IAgentRunner> {
  const { ClaudeAgentRunner } = await import("./claude-runner.js");
  return new ClaudeAgentRunner();
}

async function createCodexRunner(): Promise<IAgentRunner> {
  const { CodexAgentRunner } = await import("./codex-runner.js");
  return new CodexAgentRunner();
}

export class AgentRunnerFactory {
  /**
   * 创建指定 provider 的 runner
   * @throws 如果 provider 不可用（feature flag 未开启或 SDK 未安装）
   */
  static async create(provider: AgentProvider): Promise<IAgentRunner> {
    switch (provider) {
      case "claude":
        return createClaudeRunner();

      case "codex": {
        if (!isCodexEnabled()) {
          throw new Error(
            "Codex provider is not enabled. Set desktop.enableCodexRunner feature flag to true.",
          );
        }
        return createCodexRunner();
      }

      default:
        throw new Error(`Unknown agent provider: ${provider as string}`);
    }
  }

  /**
   * 获取当前可用的 provider 列表
   */
  static getAvailableProviders(): AgentProvider[] {
    const providers: AgentProvider[] = ["claude"];
    if (isCodexEnabled()) {
      providers.push("codex");
    }
    return providers;
  }
}
