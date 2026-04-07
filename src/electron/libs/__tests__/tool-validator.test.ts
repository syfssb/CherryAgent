// Mocked Suite: M-01 / M-02 / M-03
//
// 覆盖范围：
//   M-01 — 所有 8 个工具的合法最小输入 → validateToolInput 返回 null
//   M-02 — 非法输入 → 返回对应错误码
//   M-03 — 截断阈值 / timeout 边界检测

import { describe, it, expect } from "vitest";
import {
  validateToolInput,
  ToolValidationErrorCode,
} from "../tool-validator";

// ─── M-01：合法输入全部放行 ───────────────────────────────────────────────────

describe("M-01: valid inputs → null", () => {
  it("Bash: 最小合法输入", () => {
    expect(validateToolInput("Bash", { command: "ls -la" })).toBeNull();
  });

  it("Read: 最小合法输入", () => {
    expect(validateToolInput("Read", { file_path: "/tmp/test.txt" })).toBeNull();
  });

  it("Write: 最小合法输入", () => {
    expect(
      validateToolInput("Write", { file_path: "/tmp/out.txt", content: "hello" }),
    ).toBeNull();
  });

  it("Edit: old_string 与 new_string 不同", () => {
    expect(
      validateToolInput("Edit", {
        file_path: "/tmp/a.ts",
        old_string: "foo",
        new_string: "bar",
      }),
    ).toBeNull();
  });

  it("Glob: 最小合法输入", () => {
    expect(validateToolInput("Glob", { pattern: "**/*.ts" })).toBeNull();
  });

  it("Grep: 最小合法输入", () => {
    expect(validateToolInput("Grep", { pattern: "function" })).toBeNull();
  });

  it("NotebookEdit: 最小合法输入", () => {
    expect(
      validateToolInput("NotebookEdit", {
        notebook_path: "/tmp/nb.ipynb",
        new_source: "print(1)",
      }),
    ).toBeNull();
  });

  it("AskUserQuestion: 单个问题合法输入", () => {
    expect(
      validateToolInput("AskUserQuestion", {
        questions: [
          {
            question: "Q?",
            header: "H",
            options: [{ label: "A", description: "B" }],
            multiSelect: false,
          },
        ],
      }),
    ).toBeNull();
  });
});

// ─── M-02：非法输入 → 对应错误码 ─────────────────────────────────────────────

describe("M-02: invalid inputs → error codes", () => {
  it("Bash: 空对象缺少 command → tool_missing_field(command)", () => {
    const result = validateToolInput("Bash", {});
    expect(result).toMatchObject({
      code: ToolValidationErrorCode.tool_missing_field,
      field: "command",
    });
  });

  it("Read: 空对象缺少 file_path → tool_missing_field(file_path)", () => {
    const result = validateToolInput("Read", {});
    expect(result).toMatchObject({
      code: ToolValidationErrorCode.tool_missing_field,
      field: "file_path",
    });
  });

  it("Write: file_path 为空字符串 → tool_missing_field", () => {
    const result = validateToolInput("Write", { file_path: "" });
    expect(result).toMatchObject({
      code: ToolValidationErrorCode.tool_missing_field,
    });
  });

  it("Edit: old_string === new_string → tool_noop_edit", () => {
    const result = validateToolInput("Edit", {
      file_path: "x",
      old_string: "a",
      new_string: "a",
    });
    expect(result).toMatchObject({
      code: ToolValidationErrorCode.tool_noop_edit,
    });
  });

  it("AskUserQuestion: 5 个问题超出上限 4 → tool_question_limit", () => {
    const fiveQuestions = Array.from({ length: 5 }, (_, i) => ({
      question: `Q${i}?`,
      header: `H${i}`,
      options: [{ label: "Yes", description: "yes" }],
      multiSelect: false,
    }));
    const result = validateToolInput("AskUserQuestion", { questions: fiveQuestions });
    expect(result).toMatchObject({
      code: ToolValidationErrorCode.tool_question_limit,
    });
  });

  it("未注册的工具名 → null（直接放行）", () => {
    expect(validateToolInput("UnknownTool", {})).toBeNull();
  });
});

// ─── M-03：截断阈值 / timeout 边界 ───────────────────────────────────────────

describe("M-03: truncation & timeout boundaries", () => {
  const THRESHOLD = 50_000;
  const TIMEOUT_MAX = 600_000;

  it("Bash: command 长度恰好 50000 → null（临界允许）", () => {
    const command = "x".repeat(THRESHOLD);
    expect(validateToolInput("Bash", { command })).toBeNull();
  });

  it("Bash: command 长度 50001 → tool_input_truncated(command)", () => {
    const command = "x".repeat(THRESHOLD + 1);
    const result = validateToolInput("Bash", { command });
    expect(result).toMatchObject({
      code: ToolValidationErrorCode.tool_input_truncated,
      field: "command",
    });
  });

  it("Bash: timeout 600000 → null（合法上限）", () => {
    expect(
      validateToolInput("Bash", { command: "sleep 1", timeout: TIMEOUT_MAX }),
    ).toBeNull();
  });

  it("Bash: timeout 600001 → tool_timeout_capped", () => {
    const result = validateToolInput("Bash", {
      command: "sleep 1",
      timeout: TIMEOUT_MAX + 1,
    });
    expect(result).toMatchObject({
      code: ToolValidationErrorCode.tool_timeout_capped,
    });
  });

  it("Bash: timeout 负数 → tool_field_invalid", () => {
    const result = validateToolInput("Bash", { command: "ls", timeout: -1 });
    expect(result).toMatchObject({
      code: ToolValidationErrorCode.tool_field_invalid,
      field: "timeout",
    });
  });
});
