import type { SessionStatus } from "../types.js";

/**
 * Agent runner 的 idle 表示当前一轮正常结束。
 * 桌面端会话层需要把它解释为 completed，而不是可继续输入前的 idle。
 */
export function mapAgentRunnerStatusToSessionStatus(
  status: "running" | "idle" | "error",
): SessionStatus {
  if (status === "idle") {
    return "completed";
  }
  return status;
}
