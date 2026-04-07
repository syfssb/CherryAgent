/**
 * tool-validator.ts — Tool 契约校验系统
 *
 * 设计：
 *   - 每个工具对应一个 ToolContract（纯函数，无副作用）
 *   - 全部注册在 MODULE_CONTRACTS Map 中
 *   - 对外只暴露 validateToolInput 单一入口
 */

// ─── 错误码枚举 ───────────────────────────────────────────────────────────────

/** 工具契约校验错误码 */
export enum ToolValidationErrorCode {
  /** 输入内容超过安全截断阈值（可能被 LLM 截断） */
  tool_input_truncated   = "tool_input_truncated",
  /** timeout 参数超出允许上限，已被强制限制 */
  tool_timeout_capped    = "tool_timeout_capped",
  /** Edit 工具的 old_string 与 new_string 完全相同（空操作） */
  tool_noop_edit         = "tool_noop_edit",
  /** 必填字段缺失 */
  tool_missing_field     = "tool_missing_field",
  /** 字段值类型或格式不合法 */
  tool_field_invalid     = "tool_field_invalid",
  /** 权限等待超时（由上游注入，此处仅定义码） */
  permission_timeout     = "permission_timeout",
  /** 会话停滞（由上游注入，此处仅定义码） */
  session_stalled        = "session_stalled",
  /** AskUserQuestion 超过允许的最大问题数 */
  tool_question_limit    = "tool_question_limit",
}

// ─── 错误类型 ─────────────────────────────────────────────────────────────────

/** 工具校验错误（null 表示通过） */
export type ToolValidationError = {
  code: ToolValidationErrorCode;
  message: string;
  /** 发生问题的字段名（可选） */
  field?: string;
};

// ─── 契约接口 ─────────────────────────────────────────────────────────────────

/** 单个工具的校验契约 */
export interface ToolContract {
  toolName: string;
  /** 返回 null 表示校验通过；返回错误对象表示拒绝 */
  validate: (input: unknown) => ToolValidationError | null;
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/** 类型守卫：input 是否是 plain object */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 构造"字段缺失"错误 */
function missingField(field: string): ToolValidationError {
  return {
    code: ToolValidationErrorCode.tool_missing_field,
    message: `必填字段 "${field}" 缺失或为空`,
    field,
  };
}

/** 构造"字段非法"错误 */
function invalidField(field: string, reason: string): ToolValidationError {
  return {
    code: ToolValidationErrorCode.tool_field_invalid,
    message: `字段 "${field}" 不合法：${reason}`,
    field,
  };
}

/** 断言字符串字段存在且非空；失败返回错误 */
function requireString(
  input: Record<string, unknown>,
  field: string,
): ToolValidationError | null {
  const v = input[field];
  if (typeof v !== "string" || v.trim() === "") {
    return missingField(field);
  }
  return null;
}

// ─── Bash 限制常量 ────────────────────────────────────────────────────────────

const BASH_INPUT_TRUNCATION_THRESHOLD = 50_000;  // 字符
const BASH_TIMEOUT_MAX_MS             = 600_000;  // 毫秒（与 runner.ts SDK 硬上限对齐）

// ─── 各工具契约实现 ───────────────────────────────────────────────────────────

const bashContract: ToolContract = {
  toolName: "Bash",
  validate(input) {
    if (!isObject(input)) return missingField("command");

    // command 必填
    const cmdErr = requireString(input, "command");
    if (cmdErr) return cmdErr;

    const command = input["command"] as string;

    // 检测截断输入（超过阈值可能是 LLM 截断产物）
    if (command.length > BASH_INPUT_TRUNCATION_THRESHOLD) {
      return {
        code: ToolValidationErrorCode.tool_input_truncated,
        message: `command 长度 ${command.length} 超过安全阈值 ${BASH_INPUT_TRUNCATION_THRESHOLD}，疑似被截断`,
        field: "command",
      };
    }

    // timeout 上限校验
    if ("timeout" in input) {
      const t = input["timeout"];
      if (typeof t !== "number" || !Number.isFinite(t) || t < 0) {
        return invalidField("timeout", "必须是非负有限数值（毫秒）");
      }
      if (t > BASH_TIMEOUT_MAX_MS) {
        return {
          code: ToolValidationErrorCode.tool_timeout_capped,
          message: `timeout ${t}ms 超过上限 ${BASH_TIMEOUT_MAX_MS}ms`,
          field: "timeout",
        };
      }
    }

    return null;
  },
};

const readContract: ToolContract = {
  toolName: "Read",
  validate(input) {
    if (!isObject(input)) return missingField("file_path");
    return requireString(input, "file_path");
  },
};

const writeContract: ToolContract = {
  toolName: "Write",
  validate(input) {
    if (!isObject(input)) return missingField("file_path");
    return (
      requireString(input, "file_path") ??
      requireString(input, "content")
    );
  },
};

const editContract: ToolContract = {
  toolName: "Edit",
  validate(input) {
    if (!isObject(input)) return missingField("file_path");

    // 三个必填字段逐一校验
    const err =
      requireString(input, "file_path") ??
      requireString(input, "old_string") ??
      requireString(input, "new_string");
    if (err) return err;

    // 空操作检测：old_string 与 new_string 完全相同
    if (input["old_string"] === input["new_string"]) {
      return {
        code: ToolValidationErrorCode.tool_noop_edit,
        message: "old_string 与 new_string 完全相同，本次 Edit 为空操作",
        field: "new_string",
      };
    }

    return null;
  },
};

const globContract: ToolContract = {
  toolName: "Glob",
  validate(input) {
    if (!isObject(input)) return missingField("pattern");
    return requireString(input, "pattern");
  },
};

const grepContract: ToolContract = {
  toolName: "Grep",
  validate(input) {
    if (!isObject(input)) return missingField("pattern");
    return requireString(input, "pattern");
  },
};

const notebookEditContract: ToolContract = {
  toolName: "NotebookEdit",
  validate(input) {
    if (!isObject(input)) return missingField("notebook_path");
    return (
      requireString(input, "notebook_path") ??
      requireString(input, "new_source")
    );
  },
};

const ASK_USER_QUESTION_LIMIT = 4;

const askUserQuestionContract: ToolContract = {
  toolName: "AskUserQuestion",
  validate(input) {
    if (!isObject(input)) return missingField("questions");

    const questions = input["questions"];

    // questions 必须是数组
    if (!Array.isArray(questions)) {
      return invalidField("questions", "必须是数组类型");
    }

    // 数量上限
    if (questions.length > ASK_USER_QUESTION_LIMIT) {
      return {
        code: ToolValidationErrorCode.tool_question_limit,
        message: `AskUserQuestion 最多允许 ${ASK_USER_QUESTION_LIMIT} 个问题，当前为 ${questions.length} 个`,
        field: "questions",
      };
    }

    return null;
  },
};

// ─── 注册表 ───────────────────────────────────────────────────────────────────

/** 所有已注册工具契约的 Map（key = toolName） */
const MODULE_CONTRACTS = new Map<string, ToolContract>([
  ["Bash",            bashContract],
  ["Read",            readContract],
  ["Write",           writeContract],
  ["Edit",            editContract],
  ["Glob",            globContract],
  ["Grep",            grepContract],
  ["NotebookEdit",    notebookEditContract],
  ["AskUserQuestion", askUserQuestionContract],
]);

// ─── 对外入口 ─────────────────────────────────────────────────────────────────

/**
 * 校验工具输入是否满足契约。
 *
 * @param toolName - 工具名称（区分大小写，与 SDK 保持一致）
 * @param input    - 来自 LLM 的工具输入（原始 unknown 类型）
 * @returns 校验通过返回 null；失败返回 ToolValidationError
 */
export function validateToolInput(
  toolName: string,
  input: unknown,
): ToolValidationError | null {
  const contract = MODULE_CONTRACTS.get(toolName);
  // 未注册的工具视为无需校验，直接放行
  if (!contract) return null;
  return contract.validate(input);
}
