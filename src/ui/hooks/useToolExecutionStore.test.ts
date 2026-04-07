import { afterEach, describe, expect, it } from "vitest";
import { useToolExecutionStore } from "./useToolExecutionStore";

describe("useToolExecutionStore finalizeSessionExecutions", () => {
  afterEach(() => {
    useToolExecutionStore.setState({ executions: {} });
  });

  it("应将指定 session 中仍在运行的工具终态化", () => {
    useToolExecutionStore.setState({
      executions: {
        "tool-1": {
          toolUseId: "tool-1",
          sessionId: "session-a",
          toolName: "Write",
          status: "running",
          startTime: 1000,
        },
        "tool-2": {
          toolUseId: "tool-2",
          sessionId: "session-a",
          toolName: "Read",
          status: "pending",
          startTime: 1200,
        },
        "tool-3": {
          toolUseId: "tool-3",
          sessionId: "session-a",
          toolName: "Bash",
          status: "success",
          startTime: 900,
          endTime: 1100,
        },
        "tool-4": {
          toolUseId: "tool-4",
          sessionId: "session-b",
          toolName: "Edit",
          status: "running",
          startTime: 1300,
        },
      },
    });

    useToolExecutionStore.getState().finalizeSessionExecutions("session-a", "error");

    const { executions } = useToolExecutionStore.getState();
    expect(executions["tool-1"].status).toBe("error");
    expect(executions["tool-2"].status).toBe("error");
    expect(executions["tool-1"].endTime).toBeTypeOf("number");
    expect(executions["tool-2"].endTime).toBeTypeOf("number");
    expect(executions["tool-3"].status).toBe("success");
    expect(executions["tool-4"].status).toBe("running");
  });

  it("hydrate 时应保留运行中 tool 的计时基线", () => {
    useToolExecutionStore.setState({
      executions: {
        "tool-5": {
          toolUseId: "tool-5",
          sessionId: "session-c",
          toolName: "Write",
          status: "running",
          startTime: 123456,
          elapsedSeconds: 9.8,
          input: { file_path: "/tmp/demo.md" },
        },
      },
    });

    useToolExecutionStore.getState().hydrateFromMessages(
      [
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool-5",
                name: "Write",
                input: { file_path: "/tmp/demo.md" },
              },
            ],
          },
        } as any,
      ],
      "session-c",
      { preserveRunningState: true },
    );

    const { executions } = useToolExecutionStore.getState();
    expect(executions["tool-5"].status).toBe("running");
    expect(executions["tool-5"].startTime).toBe(123456);
    expect(executions["tool-5"].elapsedSeconds).toBe(9.8);
  });
});
