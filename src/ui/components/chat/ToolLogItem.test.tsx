import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ToolLogItem } from "./ToolLogItem";
import { useToolExecutionStore } from "@/ui/hooks/useToolExecutionStore";

describe("ToolLogItem pause behavior", () => {
  afterEach(() => {
    cleanup();
    useToolExecutionStore.setState({ executions: {} });
  });

  it("停止中时不应继续显示运行中 tool 的耗时", () => {
    useToolExecutionStore.setState({
      executions: {
        "tool-1": {
          toolUseId: "tool-1",
          toolName: "Write",
          status: "running",
          elapsedSeconds: 4.5,
          startTime: Date.now() - 4500,
          input: { file_path: "/tmp/report.md" },
        },
      },
    });

    render(
      <ToolLogItem
        toolUseId="tool-1"
        toolName="Write"
        input={{ file_path: "/tmp/report.md" }}
        isPaused
      />
    );

    expect(screen.queryByText("4.5s")).not.toBeInTheDocument();
  });

  it("停止中不应把已完成 tool 误回退为 pending", () => {
    useToolExecutionStore.setState({
      executions: {
        "tool-2": {
          toolUseId: "tool-2",
          toolName: "Write",
          status: "success",
          elapsedSeconds: 2.3,
          startTime: Date.now() - 2300,
          endTime: Date.now(),
          input: { file_path: "/tmp/done.md" },
        },
      },
    });

    render(
      <ToolLogItem
        toolUseId="tool-2"
        toolName="Write"
        input={{ file_path: "/tmp/done.md" }}
        isPaused
      />
    );

    expect(screen.getByText("2.3s")).toBeInTheDocument();
  });
});
