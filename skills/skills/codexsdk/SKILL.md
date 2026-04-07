---
name: codexsdk
description: Codex SDK 开发指南。当需要使用 Codex SDK 构建 AI 编码助手、修改 Codex 运行器、调试 Codex 相关问题时触发。
---

# Codex SDK 开发指南

## 1. 概述

Codex SDK (`@openai/codex-sdk`) 是 OpenAI Codex CLI 的 TypeScript 封装层。它通过 **spawn 子进程** 运行 `codex` CLI 二进制，并通过 **stdin/stdout 交换 JSONL 事件** 实现通信。

**核心设计理念：** SDK 本身不实现 agent 逻辑，而是将 Codex CLI（Rust 编写的 `codex-rs`）作为执行引擎，SDK 只负责进程管理和事件解析。

### 包名与依赖

| 包名 | 说明 |
|------|------|
| `@openai/codex-sdk` | SDK 本体 |
| `@openai/codex` | CLI 主包（包含平台检测逻辑） |
| `@openai/codex-darwin-arm64` | macOS Apple Silicon 二进制 |
| `@openai/codex-darwin-x64` | macOS Intel 二进制 |
| `@openai/codex-win32-x64` | Windows x64 二进制 |
| `@openai/codex-linux-x64` | Linux x64 二进制 |
| `@openai/codex-linux-arm64` | Linux arm64 二进制 |

## 2. 核心架构

```
Codex (入口类)
  ├── startThread(options) → Thread
  └── resumeThread(id, options) → Thread
        ├── run(input, turnOptions) → Turn (同步等待完成)
        └── runStreamed(input, turnOptions) → StreamedTurn (异步事件流)
              └── 内部调用 CodexExec.run()
                    └── spawn("codex", ["exec", "--experimental-json", ...args])
                          ├── stdin: 写入 prompt
                          ├── stdout: 逐行读取 JSONL 事件
                          └── stderr: 收集错误输出
```

### 模块文件

| 文件 | 职责 |
|------|------|
| `codex.ts` | `Codex` 类 — 入口，创建/恢复 Thread |
| `codexOptions.ts` | `CodexOptions` 类型 — 全局配置 |
| `thread.ts` | `Thread` 类 — 会话管理，run/runStreamed |
| `threadOptions.ts` | `ThreadOptions` 类型 — 线程级配置 |
| `turnOptions.ts` | `TurnOptions` 类型 — 单轮配置 |
| `exec.ts` | `CodexExec` 类 — 子进程管理，参数构建 |
| `events.ts` | 事件类型定义 |
| `items.ts` | 线程项（ThreadItem）类型定义 |
| `outputSchemaFile.ts` | 结构化输出 schema 临时文件管理 |
| `index.ts` | 公共导出 |

## 3. Codex 类（入口）

```typescript
import { Codex } from "@openai/codex-sdk";

// 基本用法
const codex = new Codex();

// 完整配置
const codex = new Codex({
  codexPathOverride: "/path/to/codex",  // 自定义 CLI 路径
  baseUrl: "https://api.openai.com/v1", // API 基础 URL
  apiKey: "sk-...",                      // API Key
  env: { PATH: "/usr/local/bin" },       // 自定义环境变量（不继承 process.env）
  config: {                              // --config 覆盖项
    model_provider: "openai",
    sandbox_workspace_write: { network_access: true },
  },
});
```

### CodexOptions 完整类型

```typescript
type CodexOptions = {
  codexPathOverride?: string;        // 覆盖自动检测的 codex 二进制路径
  baseUrl?: string;                  // 注入为 OPENAI_BASE_URL 环境变量
  apiKey?: string;                   // 注入为 CODEX_API_KEY 环境变量
  config?: CodexConfigObject;        // 额外 --config key=value 覆盖
  env?: Record<string, string>;      // 完全替换子进程环境变量
};

// config 值支持嵌套对象，SDK 自动展平为点路径 + TOML 序列化
type CodexConfigValue = string | number | boolean | CodexConfigValue[] | CodexConfigObject;
type CodexConfigObject = { [key: string]: CodexConfigValue };
```

**env 行为细节：**
- 未提供 `env` 时，子进程继承 `process.env` 全部变量
- 提供 `env` 时，**只** 传入指定变量（不继承 process.env）
- SDK 始终在 env 之上注入 `OPENAI_BASE_URL`、`CODEX_API_KEY`、`CODEX_INTERNAL_ORIGINATOR_OVERRIDE`

**config 序列化示例：**
```typescript
// 输入
config: {
  approval_policy: "never",
  sandbox_workspace_write: { network_access: true },
  tool_rules: { allow: ["git status", "git diff"] },
}
// 输出 CLI 参数
--config 'approval_policy="never"'
--config sandbox_workspace_write.network_access=true
--config 'tool_rules.allow=["git status", "git diff"]'
```

## 4. Thread 类（会话管理）

### 创建与恢复

```typescript
// 新建 Thread
const thread = codex.startThread({
  model: "codex",
  sandboxMode: "workspace-write",
  workingDirectory: "/path/to/project",
  skipGitRepoCheck: true,
});

// 恢复已有 Thread（会话持久化在 ~/.codex/sessions）
const thread = codex.resumeThread("thread-id-xxx", options);
```

### ThreadOptions 完整类型

```typescript
type ThreadOptions = {
  model?: string;                        // 使用的模型
  sandboxMode?: SandboxMode;             // 沙箱模式
  workingDirectory?: string;             // 工作目录
  skipGitRepoCheck?: boolean;            // 跳过 Git 仓库检查
  modelReasoningEffort?: ModelReasoningEffort; // 推理深度
  networkAccessEnabled?: boolean;        // 允许网络访问
  webSearchMode?: WebSearchMode;         // 网络搜索模式
  webSearchEnabled?: boolean;            // 网络搜索开关（旧版）
  approvalPolicy?: ApprovalMode;         // 审批策略
  additionalDirectories?: string[];      // 额外可访问目录
};

type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";
type ApprovalMode = "never" | "on-request" | "on-failure" | "untrusted";
type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
type WebSearchMode = "disabled" | "cached" | "live";
```

### run() — 同步等待完成

```typescript
const turn = await thread.run("Diagnose the test failure and propose a fix");
console.log(turn.finalResponse); // 最终文本回复
console.log(turn.items);         // 所有 ThreadItem
console.log(turn.usage);         // token 用量
```

**Turn 类型：**
```typescript
type Turn = {
  items: ThreadItem[];       // 所有线程项（消息、命令、文件变更等）
  finalResponse: string;     // 最后一个 agent_message 的文本
  usage: Usage | null;       // token 用量统计
};
```

### runStreamed() — 流式事件

```typescript
const { events } = await thread.runStreamed("Fix the bug");

for await (const event of events) {
  switch (event.type) {
    case "thread.started":
      console.log("Thread ID:", event.thread_id);
      break;
    case "turn.started":
      console.log("Turn started");
      break;
    case "item.started":
    case "item.updated":
    case "item.completed":
      handleItem(event.item);
      break;
    case "turn.completed":
      console.log("Usage:", event.usage);
      break;
    case "turn.failed":
      console.error("Error:", event.error.message);
      break;
  }
}
```

### 多轮对话

同一 `Thread` 实例多次调用 `run()` 即可实现多轮对话，SDK 会自动通过 `resume` 子命令恢复会话：

```typescript
const thread = codex.startThread();
await thread.run("Read the codebase and understand the architecture");
await thread.run("Now fix the authentication bug");
await thread.run("Write tests for the fix");
```

### 结构化输出

```typescript
// 使用 JSON Schema
const turn = await thread.run("Summarize status", {
  outputSchema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      status: { type: "string", enum: ["ok", "action_required"] },
    },
    required: ["summary", "status"],
    additionalProperties: false,
  },
});

// 使用 Zod（需要 zod-to-json-schema）
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

const schema = z.object({
  summary: z.string(),
  status: z.enum(["ok", "action_required"]),
});

const turn = await thread.run("Summarize status", {
  outputSchema: zodToJsonSchema(schema, { target: "openAi" }),
});
```

**实现细节：** SDK 将 schema 写入临时文件（`os.tmpdir()/codex-output-schema-xxx/schema.json`），通过 `--output-schema` 参数传递给 CLI，turn 结束后自动清理。

### 图片输入

```typescript
const turn = await thread.run([
  { type: "text", text: "Describe these screenshots" },
  { type: "local_image", path: "./ui.png" },
  { type: "local_image", path: "./diagram.jpg" },
]);
```

**Input 类型：**
```typescript
type Input = string | UserInput[];
type UserInput =
  | { type: "text"; text: string }
  | { type: "local_image"; path: string };
```

多个 text 段会用 `\n\n` 连接；image 通过 `--image` 参数传递给 CLI。

### 取消操作

```typescript
const controller = new AbortController();

// 5秒后取消
setTimeout(() => controller.abort(), 5000);

try {
  const turn = await thread.run("Long task", { signal: controller.signal });
} catch (err) {
  // AbortError
}
```

`signal` 直接传递给 `child_process.spawn()`，中止时子进程被终止。

## 5. 事件系统

### ThreadEvent 类型

```typescript
type ThreadEvent =
  | ThreadStartedEvent      // 新线程创建
  | TurnStartedEvent        // 新轮次开始
  | TurnCompletedEvent      // 轮次完成（含 usage）
  | TurnFailedEvent         // 轮次失败
  | ItemStartedEvent        // 项开始（in_progress）
  | ItemUpdatedEvent        // 项更新（流式进度）
  | ItemCompletedEvent      // 项完成
  | ThreadErrorEvent;       // 不可恢复错误
```

### 事件生命周期

```
thread.started → turn.started
  → item.started (agent_message)
  → item.updated (文本增量更新)
  → item.completed (最终文本)
  → item.started (command_execution)
  → item.updated (输出累积)
  → item.completed (含 exit_code)
  → item.started (file_change)
  → item.completed (含 changes 列表)
→ turn.completed (含 usage)
```

### ThreadItem 类型

```typescript
type ThreadItem =
  | AgentMessageItem       // agent 文本回复
  | ReasoningItem          // agent 推理过程
  | CommandExecutionItem   // shell 命令执行
  | FileChangeItem         // 文件变更补丁
  | McpToolCallItem        // MCP 工具调用
  | WebSearchItem          // 网络搜索
  | TodoListItem           // 待办列表
  | ErrorItem;             // 非致命错误
```

**AgentMessageItem:**
```typescript
type AgentMessageItem = {
  id: string;
  type: "agent_message";
  text: string;            // 文本或 JSON（结构化输出时）
};
```

**CommandExecutionItem:**
```typescript
type CommandExecutionItem = {
  id: string;
  type: "command_execution";
  command: string;              // 执行的命令行
  aggregated_output: string;    // stdout + stderr 合并输出
  exit_code?: number;           // 退出码（运行中时无）
  status: "in_progress" | "completed" | "failed";
};
```

**FileChangeItem:**
```typescript
type FileChangeItem = {
  id: string;
  type: "file_change";
  changes: FileUpdateChange[];  // { path, kind: "add"|"delete"|"update" }
  status: "completed" | "failed";
};
```

**McpToolCallItem:**
```typescript
type McpToolCallItem = {
  id: string;
  type: "mcp_tool_call";
  server: string;               // MCP 服务器名
  tool: string;                 // 工具名
  arguments: unknown;           // 调用参数
  result?: {                    // 成功时的返回
    content: McpContentBlock[];
    structured_content: unknown;
  };
  error?: { message: string };  // 失败时的错误
  status: "in_progress" | "completed" | "failed";
};
```

**TodoListItem:**
```typescript
type TodoListItem = {
  id: string;
  type: "todo_list";
  items: Array<{ text: string; completed: boolean }>;
};
```

### Usage 类型

```typescript
type Usage = {
  input_tokens: number;          // 输入 token 数
  cached_input_tokens: number;   // 缓存命中的输入 token 数
  output_tokens: number;         // 输出 token 数
};
```

## 6. CodexExec — 子进程执行引擎

### 二进制定位策略

SDK 通过 `findCodexPath()` 自动定位 codex 二进制：

1. 使用 `createRequire(import.meta.url)` 解析 `@openai/codex/package.json`
2. 从该位置的 `node_modules` 中查找平台特定包（如 `@openai/codex-darwin-arm64`）
3. 拼接路径：`{platform-package}/vendor/{target-triple}/codex/codex`

**平台映射表：**

| platform + arch | target-triple | 包名 |
|----------------|---------------|------|
| darwin + arm64 | aarch64-apple-darwin | @openai/codex-darwin-arm64 |
| darwin + x64 | x86_64-apple-darwin | @openai/codex-darwin-x64 |
| win32 + x64 | x86_64-pc-windows-msvc | @openai/codex-win32-x64 |
| linux + x64 | x86_64-unknown-linux-musl | @openai/codex-linux-x64 |
| linux + arm64 | aarch64-unknown-linux-musl | @openai/codex-linux-arm64 |

### CLI 参数构建

`CodexExec.run()` 构建的命令行格式：

```
codex exec --experimental-json \
  [--config key=value ...]       # 全局 config 覆盖
  [--model <model>]              # 模型名
  [--sandbox <mode>]             # 沙箱模式
  [--cd <dir>]                   # 工作目录
  [--add-dir <dir> ...]          # 额外目录
  [--skip-git-repo-check]        # 跳过 Git 检查
  [--output-schema <file>]       # 结构化输出 schema
  [--config model_reasoning_effort="<level>"]
  [--config sandbox_workspace_write.network_access=<bool>]
  [--config web_search="<mode>"]
  [--config approval_policy="<policy>"]
  [resume <thread-id>]           # 恢复已有会话
  [--image <path> ...]           # 图片文件
```

**关键顺序：** `resume <thread-id>` 必须在 `--image` 之前。

### 子进程通信

1. **stdin:** 写入 prompt 文本后立即 `end()`
2. **stdout:** 使用 `readline` 逐行读取，每行是一个 JSON 字符串
3. **stderr:** 收集到 buffer，仅在非零退出时用于错误消息
4. **退出处理:** 等待 `exit` 事件，非零退出码或 signal 时抛错

```typescript
// 核心流程伪代码
const child = spawn(executablePath, commandArgs, { env, signal });
child.stdin.write(prompt);
child.stdin.end();

const rl = readline.createInterface({ input: child.stdout });
for await (const line of rl) {
  yield line; // 每行是一个 JSONL 事件
}

const { code, signal } = await exitPromise;
if (code !== 0 || signal) {
  throw new Error(`Codex Exec exited with ${detail}: ${stderr}`);
}
```

## 7. 在 Cherry Agent 中的集成模式

### CodexAgentRunner

项目通过 `CodexAgentRunner` 类（`src/electron/libs/agent-runner/codex-runner.ts`）将 Codex SDK 集成为可选的 agent 运行时。

**关键集成点：**

1. **配置解析** (`codex-settings.ts`)：
   - 优先读 `OPENAI_API_KEY` 环境变量（直连 OpenAI）
   - 回退到登录态 token + 代理 URL
   - 打包后使用 `getPackagedCodexPathOverride()` 定位 asar.unpacked 中的二进制

2. **权限模式映射：**
   ```typescript
   bypassPermissions → approvalPolicy: "never",    sandboxMode: "danger-full-access"
   acceptEdits       → approvalPolicy: "on-request", sandboxMode: "workspace-write"
   default           → approvalPolicy: "untrusted",  sandboxMode: "read-only"
   ```

3. **事件映射** — Codex SDK 事件 → 中性 AgentRunnerEvent：
   - `agent_message` → `text_delta_start` / `text_delta` / `text_delta_stop` / `text`
   - `command_execution` → `tool_use` + `tool_result`
   - `file_change` → `tool_result`（summary 格式）
   - `mcp_tool_call` → `tool_use` + `tool_result`
   - `reasoning` → `thinking`
   - `turn.completed` → usage 统计 + `idle`
   - `turn.failed` → `error`

4. **流式打字机效果：**
   ```typescript
   // item.started → 开始标记
   onEvent({ type: "message", message: { type: "text_delta_start" } });

   // item.updated → 计算增量
   const delta = item.text.slice(lastAgentMessageText.length);
   onEvent({ type: "message", message: { type: "text_delta", text: delta } });

   // item.completed → 结束标记 + 完整文本
   onEvent({ type: "message", message: { type: "text_delta_stop" } });
   onEvent({ type: "message", message: { type: "text", text: item.text } });
   ```

5. **prompt 构建：** 按 systemPrompt → memory → skills → historyContext → userPrompt 顺序拼接。

### 打包后二进制定位

```typescript
// codex-settings.ts
const candidate = join(
  process.resourcesPath,       // Electron Resources 目录
  "app.asar.unpacked",         // asarUnpack 解压目录
  "node_modules",
  platformPackage,             // 如 @openai/codex-darwin-arm64
  "vendor",
  triple,                      // 如 aarch64-apple-darwin
  "codex",
  executableName,              // codex 或 codex.exe
);
```

需要在 `electron-builder.json` 的 `asarUnpack` 中包含：
```json
"asarUnpack": ["**/node_modules/@openai/codex-*/vendor/**"]
```

### 本地 Cherry Agent 补丁

Cherry Agent 的 `patches/@anthropic-ai%2Fclaude-agent-sdk@0.2.6.patch` 将 `ProcessTransport` 的 `spawn` 改为 `fork`，这个补丁影响的是 Claude Agent SDK，**不影响 Codex SDK**（Codex SDK 始终使用原生 `spawn`）。

## 8. 常见问题与调试

### 二进制找不到

**错误：** `Unable to locate Codex CLI binaries. Ensure @openai/codex is installed with optional dependencies.`

**原因：**
- `bun install` / `npm install` 未安装平台特定的 optional dependency
- 交叉编译场景（Mac 上打 Windows 包）

**修复：**
```bash
# 手动安装目标平台包
npm pack @openai/codex-win32-x64
tar -xzf openai-codex-win32-x64-*.tgz
mv package node_modules/@openai/codex-win32-x64
```

### 子进程崩溃

**错误：** `Codex Exec exited with code 1: ...`

**调试：** stderr 内容包含在错误消息中，检查：
- API Key 是否有效
- baseUrl 是否可达
- 工作目录是否存在且有权限
- 未通过 Git 仓库检查（设置 `skipGitRepoCheck: true`）

### 会话恢复失败

**错误：** thread.id 为 null

**原因：** `thread.id` 在第一个 `thread.started` 事件后才被设置。如果 turn 失败（如 API 错误），可能未收到此事件。

**解决：** 检查 thread.id 是否为 null 后再保存。

### 环境变量泄漏

提供 `env` 参数时，SDK **不继承** process.env。确保包含 PATH 等必要变量：
```typescript
const codex = new Codex({
  env: {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin",
    HOME: process.env.HOME ?? "",
  },
});
```

### config 覆盖优先级

Thread 级别的配置（通过 `ThreadOptions`）在 CLI 参数中排在 Codex 级 config 之后，因此 **Thread 配置会覆盖 Codex 配置**：

```typescript
const codex = new Codex({ config: { approval_policy: "never" } });
const thread = codex.startThread({ approvalPolicy: "on-request" });
// CLI 收到: --config approval_policy="never" --config approval_policy="on-request"
// 最后一个生效: on-request
```

### AbortSignal 行为

- 已中止的 signal 会立即导致 spawn 失败
- 执行中中止会终止子进程并抛出 AbortError
- `run()` 和 `runStreamed()` 均支持 signal

## 9. 测试模式

SDK 测试使用本地 HTTP 代理（`responsesProxy.ts`）模拟 OpenAI Responses API：

```typescript
// 启动测试代理
const { url, close, requests } = await startResponsesTestProxy({
  statusCode: 200,
  responseBodies: [
    sse(
      responseStarted(),           // response.created 事件
      assistantMessage("Hi!"),     // response.output_item.done 事件
      responseCompleted(),         // response.completed 事件（含 usage）
    ),
  ],
});

// 使用代理 URL 创建客户端
const client = new Codex({ codexPathOverride, baseUrl: url, apiKey: "test" });
```

**SSE 事件格式：**
```
event: response.created
data: {"type":"response.created","response":{"id":"resp_mock"}}

event: response.output_item.done
data: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","id":"msg_mock","content":[{"type":"output_text","text":"Hi!"}]}}

event: response.completed
data: {"type":"response.completed","response":{"id":"resp_mock","usage":{...}}}
```

**codexExecSpy：** 通过 mock `child_process.spawn` 捕获 CLI 调用参数：
```typescript
const { args: spawnArgs, envs: spawnEnvs, restore } = codexExecSpy();
// 执行操作...
const commandArgs = spawnArgs[0]; // 第一次调用的参数数组
restore(); // 恢复原始 spawn
```

## 10. 与 OpenAI Responses API 的关系

Codex CLI（`codex-rs`）底层与 OpenAI Responses API（`POST /responses`）通信。SDK 的 `baseUrl` 最终被 CLI 用于构建 API 请求。

**请求格式（通过代理可观察）：**
```json
{
  "model": "codex",
  "input": [
    { "role": "user", "content": [{ "type": "input_text", "text": "..." }] },
    { "role": "assistant", "content": [{ "type": "output_text", "text": "..." }] }
  ],
  "text": {
    "format": {
      "name": "codex_output_schema",
      "type": "json_schema",
      "strict": true,
      "schema": { ... }
    }
  }
}
```

**多轮对话：** CLI 自动将前一轮的 assistant 回复作为 `input` 中的 `assistant` 角色条目发送。

## 11. 快速参考

### 最小可用代码

```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex({ apiKey: process.env.OPENAI_API_KEY });
const thread = codex.startThread({ skipGitRepoCheck: true });
const turn = await thread.run("What files are in the current directory?");
console.log(turn.finalResponse);
```

### 流式聊天循环

```typescript
import { Codex } from "@openai/codex-sdk";
import type { ThreadEvent, ThreadItem } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();

while (true) {
  const input = await getUserInput();
  const { events } = await thread.runStreamed(input);

  for await (const event of events) {
    if (event.type === "item.completed" && event.item.type === "agent_message") {
      console.log(event.item.text);
    }
    if (event.type === "item.updated" && event.item.type === "todo_list") {
      for (const todo of event.item.items) {
        console.log(`${todo.completed ? "[x]" : "[ ]"} ${todo.text}`);
      }
    }
    if (event.type === "turn.completed") {
      console.log(`Tokens: ${event.usage.input_tokens}in + ${event.usage.output_tokens}out`);
    }
  }
}
```

### Electron 集成模式

```typescript
const codex = new Codex({
  codexPathOverride: getPackagedCodexPath(),
  apiKey: authToken,
  baseUrl: proxyBaseUrl,
  env: buildSafeEnv(), // 不继承 Electron 的 process.env
  config: { model_provider: "openai" },
});

const thread = codex.startThread({
  model: "codex",
  workingDirectory: projectPath,
  skipGitRepoCheck: true,
  sandboxMode: "workspace-write",
  approvalPolicy: "on-request",
  networkAccessEnabled: true,
  additionalDirectories: [skillsDir],
});
```
