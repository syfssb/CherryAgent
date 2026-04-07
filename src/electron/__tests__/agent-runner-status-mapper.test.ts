import { describe, expect, it } from "vitest";
import { mapAgentRunnerStatusToSessionStatus } from "../ipc/agent-runner-status.js";

describe("agent runner status mapper", () => {
  it("应将 running 透传为 running", () => {
    expect(mapAgentRunnerStatusToSessionStatus("running")).toBe("running");
  });

  it("应将 error 透传为 error", () => {
    expect(mapAgentRunnerStatusToSessionStatus("error")).toBe("error");
  });

  it("应将 idle 视为会话成功完成", () => {
    expect(mapAgentRunnerStatusToSessionStatus("idle")).toBe("completed");
  });
});
