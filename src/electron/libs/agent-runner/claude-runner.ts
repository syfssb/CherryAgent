/**
 * ClaudeAgentRunner — 将现有 Claude SDK 调用封装为 IAgentRunner 接口
 *
 * 策略：适配器模式。内部委托给现有的 runClaude()，
 * 将其事件流映射为中性的 AgentRunnerEvent。
 * 这样 runner.ts 的 754 行核心逻辑无需大规模重构，降低回归风险。
 */

import type {
  IAgentRunner,
  AgentProvider,
  AgentRuntime,
  AgentRunnerOptions,
  AgentRunnerHandle,
  AgentEventCallback,
} from "./types.js";
import { runClaude, type RunnerOptions, type RunnerHandle } from "../runner.js";
import type { Session } from "../session-store.js";
import type { ServerEvent, PermissionMode, ImageContent } from "../../types.js";

/**
 * 将 AgentRunnerOptions 转换为 runClaude 所需的 RunnerOptions
 */
function toRunnerOptions(
  opts: AgentRunnerOptions,
  session: Session,
  onEvent: (event: ServerEvent) => void,
  onSessionUpdate?: (updates: Partial<Session>) => void,
  isNewSession?: boolean,
): RunnerOptions {
  return {
    prompt: opts.prompt,
    images: opts.images as ImageContent[] | undefined,
    model: opts.model,
    session,
    resumeSessionId: opts.resumeSessionId,
    onEvent,
    onSessionUpdate,
    isNewSession,
    contextInjection: opts.contextInjection
      ? {
          memoryContext: opts.contextInjection.memoryContext,
          skillContext: opts.contextInjection.skillContext,
          customSystemPrompt: opts.contextInjection.customSystemPrompt,
        }
      : undefined,
    permissionMode: (opts.permissionMode ?? "bypassPermissions") as PermissionMode,
  };
}

/**
 * 将 ServerEvent 映射为 AgentRunnerEvent 并回调
 *
 * 注意：当前阶段 ClaudeAgentRunner 不做事件转换，
 * 而是直接将 ServerEvent 透传给 ipc-handlers 层。
 * 这是因为 ipc-handlers 已经深度依赖 ServerEvent 格式，
 * 完整的事件转换将在 B.4（IPC 改造）中实现。
 */

export class ClaudeAgentRunner implements IAgentRunner {
  readonly provider: AgentProvider = "claude";
  readonly runtime: AgentRuntime = "claude-sdk";

  /**
   * 启动或继续一个 Claude Agent 会话
   *
   * @param options - 中性的 runner 选项
   * @param onEvent - 中性事件回调（当前阶段未使用，保留接口兼容）
   * @param session - 会话对象（Claude 特有，由 ipc-handlers 传入）
   * @param onSessionUpdate - 会话更新回调
   * @param isNewSession - 是否新会话
   * @param serverEventEmitter - ServerEvent 发射器（直接透传给 runClaude）
   */
  async runWithSession(
    options: AgentRunnerOptions,
    session: Session,
    serverEventEmitter: (event: ServerEvent) => void,
    onSessionUpdate?: (updates: Partial<Session>) => void,
    isNewSession?: boolean,
  ): Promise<AgentRunnerHandle> {
    const runnerOpts = toRunnerOptions(
      options,
      session,
      serverEventEmitter,
      onSessionUpdate,
      isNewSession,
    );

    const handle: RunnerHandle = await runClaude(runnerOpts);

    return {
      abort: () => handle.abort(),
    };
  }

  /**
   * IAgentRunner.run 的标准实现
   * 注意：此方法需要外部传入 session 对象，
   * 因此实际使用时应调用 runWithSession。
   * 此方法仅为满足接口契约，抛出错误提示使用 runWithSession。
   */
  async run(
    _options: AgentRunnerOptions,
    _onEvent: AgentEventCallback,
  ): Promise<AgentRunnerHandle> {
    throw new Error(
      "ClaudeAgentRunner.run() requires a Session object. Use runWithSession() instead.",
    );
  }
}
