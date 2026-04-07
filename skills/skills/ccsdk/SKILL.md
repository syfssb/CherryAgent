---
name: ccsdk
description: Claude Agent SDK 开发指南。当需要使用 Claude Agent SDK 构建 AI Agent、修改 Agent 运行器、调试 SDK 相关问题、理解 SDK 消息协议或处理权限系统时触发。
---

# Claude Agent SDK 开发指南

## 概览

Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) 是 Anthropic 提供的 TypeScript SDK，用于以编程方式构建具有 Claude Code 能力的 AI Agent。Agent 能理解代码库、编辑文件、执行命令、完成复杂工作流。

**当前项目使用版本：** `0.2.6`（带本地补丁，spawn -> fork）

**SDK 本质：** SDK 是 Claude Code CLI 的编程封装。它启动一个 Claude Code 子进程，通过 stdin/stdout 以 JSON 流格式通信。SDK 本身是打包后的单文件 `sdk.mjs`（约 21000 行），配合 `cli.js` 作为子进程入口。

---

## 核心架构

```
SDK Host (你的应用)
  │
  ├── query() / createSession()
  │     │
  │     ├── ProcessTransport (启动子进程)
  │     │     ├── fork/spawn Claude Code 子进程 (cli.js)
  │     │     ├── stdin  → 写入用户消息 / 控制请求
  │     │     └── stdout ← 读取 SDK 消息流
  │     │
  │     └── Query (消息处理核心)
  │           ├── 读取消息流 (readMessages)
  │           ├── 控制请求/响应 (handleControlRequest)
  │           ├── SDK MCP 服务器管理
  │           ├── Hook 回调管理
  │           └── 权限回调 (canUseTool)
  │
  └── 消息输出 → AsyncGenerator<SDKMessage>
```

### 模块组成

| 模块 | 职责 |
|------|------|
| `ProcessTransport` | 子进程生命周期管理，stdin/stdout 通信 |
| `Query` | 消息解析、控制协议、事件分发 |
| `SessionImpl` | V2 Session API，多轮对话管理 |
| `createSdkMcpServer` | 创建进程内 MCP 工具服务器 |
| `tool()` | MCP 工具定义辅助函数 |

---

## API 导出

SDK 导出以下公开 API：

```typescript
export {
  query,                        // 核心查询函数（V1 API）
  unstable_v2_createSession,    // V2 Session API（实验性）
  unstable_v2_resumeSession,    // V2 恢复会话
  unstable_v2_prompt,           // V2 单次提问
  createSdkMcpServer,          // 创建 SDK MCP 服务器
  tool,                         // MCP 工具定义辅助函数
  HOOK_EVENTS,                 // Hook 事件常量
  EXIT_REASONS,                // 退出原因常量
  AbortError                   // 中止错误类
}
```

---

## V1 API: query()

`query()` 是主要的编程接口，返回一个 `Query` 对象（`AsyncGenerator<SDKMessage>`）。

### 基本用法

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// 单次查询（字符串 prompt）
const q = query({
  prompt: "解释这段代码的作用",
  options: {
    model: "claude-sonnet-4-20250514",
    cwd: "/path/to/project",
    pathToClaudeCodeExecutable: "/path/to/cli.js",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  }
});

for await (const message of q) {
  if (message.type === "assistant") {
    console.log(message.message.content);
  }
  if (message.type === "result") {
    console.log("完成:", message.result);
    console.log("花费:", message.total_cost_usd, "USD");
  }
}
```

### 流式多轮对话（AsyncIterable prompt）

```typescript
async function* userMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "你好" }] },
    parent_tool_use_id: null,
    session_id: ""
  };
}

const q = query({
  prompt: userMessages(),
  options: { /* ... */ }
});
```

### 带图片的消息

```typescript
const userMsg: SDKUserMessage = {
  type: "user",
  message: {
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: "<base64-data>"
        }
      },
      { type: "text", text: "分析这张图片" }
    ]
  },
  parent_tool_use_id: null,
  session_id: ""
};
```

---

## V2 Session API（实验性）

V2 API 提供更简洁的多轮对话接口：

```typescript
import {
  unstable_v2_createSession as createSession,
  unstable_v2_resumeSession as resumeSession,
  unstable_v2_prompt as prompt
} from "@anthropic-ai/claude-agent-sdk";

// 创建会话
const session = createSession({
  model: "claude-sonnet-4-20250514",
  pathToClaudeCodeExecutable: "/path/to/cli.js"
});

// 发送消息
await session.send("你好");

// 接收消息流
for await (const msg of session.stream()) {
  console.log(msg.type, msg);
  if (msg.type === "result") break;
}

// 恢复会话
const resumed = resumeSession("session-uuid", { /* options */ });

// 单次提问便捷方法
const result = await prompt("简单问题", { model: "..." });

// 关闭会话
session.close();
```

### SDKSession 接口

```typescript
interface SDKSession {
  readonly sessionId: string;          // 首次消息后可用
  send(message: string | SDKUserMessage): Promise<void>;
  stream(): AsyncGenerator<SDKMessage, void>;
  close(): void;
  [Symbol.asyncDispose](): Promise<void>;  // using 语法支持
}
```

---

## 配置选项（Options）

### 核心配置

| 选项 | 类型 | 说明 |
|------|------|------|
| `model` | `string` | Claude 模型 ID |
| `cwd` | `string` | 工作目录，默认 `process.cwd()` |
| `pathToClaudeCodeExecutable` | `string` | CLI 可执行文件路径 |
| `env` | `Record<string, string>` | 环境变量，默认 `process.env` |
| `executable` | `'node' \| 'bun' \| 'deno'` | JS 运行时 |
| `executableArgs` | `string[]` | 运行时额外参数 |

### 权限控制

| 选项 | 类型 | 说明 |
|------|------|------|
| `permissionMode` | `PermissionMode` | 权限模式 |
| `allowDangerouslySkipPermissions` | `boolean` | 必须配合 `bypassPermissions` |
| `canUseTool` | `CanUseTool` | 自定义权限回调 |
| `allowedTools` | `string[]` | 自动允许的工具列表 |
| `disallowedTools` | `string[]` | 禁用的工具列表 |
| `tools` | `string[] \| { type: 'preset', preset: 'claude_code' }` | 可用工具集 |

**PermissionMode 类型：**

```typescript
type PermissionMode =
  | 'default'            // 标准行为，危险操作需要确认
  | 'acceptEdits'        // 自动接受文件编辑
  | 'bypassPermissions'  // 跳过所有权限检查
  | 'plan'               // 计划模式，不执行工具
  | 'delegate'           // 委派模式，仅限 Teammate/Task 工具
  | 'dontAsk';           // 不提示，未预批准则拒绝
```

### 会话管理

| 选项 | 类型 | 说明 |
|------|------|------|
| `resume` | `string` | 恢复指定会话 ID |
| `resumeSessionAt` | `string` | 从指定消息 UUID 恢复 |
| `continue` | `boolean` | 继续当前目录最近的会话 |
| `forkSession` | `boolean` | 恢复时分叉到新会话 |
| `persistSession` | `boolean` | 是否持久化到磁盘，默认 true |

### 模型与预算

| 选项 | 类型 | 说明 |
|------|------|------|
| `fallbackModel` | `string` | 备选模型 |
| `maxThinkingTokens` | `number` | 思考 token 上限 |
| `maxTurns` | `number` | 最大对话轮数 |
| `maxBudgetUsd` | `number` | 最大预算（USD） |
| `betas` | `SdkBeta[]` | Beta 特性，如 `'context-1m-2025-08-07'` |

### 输出与流

| 选项 | 类型 | 说明 |
|------|------|------|
| `includePartialMessages` | `boolean` | 是否包含流式部分消息 |
| `outputFormat` | `OutputFormat` | 结构化输出 JSON Schema |
| `systemPrompt` | `string \| { type: 'preset', preset: 'claude_code', append?: string }` | 系统提示 |
| `stderr` | `(data: string) => void` | stderr 回调 |

### 设置与插件

| 选项 | 类型 | 说明 |
|------|------|------|
| `settingSources` | `('user' \| 'project' \| 'local')[]` | 加载的设置源 |
| `plugins` | `SdkPluginConfig[]` | 插件配置 |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP 服务器配置 |
| `agents` | `Record<string, AgentDefinition>` | 自定义子代理 |

### 其他

| 选项 | 类型 | 说明 |
|------|------|------|
| `abortController` | `AbortController` | 取消控制器 |
| `additionalDirectories` | `string[]` | 额外可访问目录 |
| `enableFileCheckpointing` | `boolean` | 文件检查点（支持 rewind） |
| `sandbox` | `SandboxSettings` | 沙箱隔离设置 |
| `spawnClaudeCodeProcess` | `(options: SpawnOptions) => SpawnedProcess` | 自定义进程启动 |

---

## 消息类型（SDKMessage）

SDK 消息是 `AsyncGenerator` 的 yield 值，所有消息类型的联合：

```typescript
type SDKMessage =
  | SDKAssistantMessage        // 助手完整响应
  | SDKUserMessage             // 用户消息
  | SDKUserMessageReplay       // 恢复会话时的历史用户消息重放
  | SDKResultMessage           // 查询结果（成功/错误）
  | SDKSystemMessage           // 系统消息（init, status 等）
  | SDKPartialAssistantMessage // 流式部分消息（需 includePartialMessages）
  | SDKCompactBoundaryMessage  // 上下文压缩边界
  | SDKStatusMessage           // 状态更新
  | SDKHookResponseMessage     // Hook 响应
  | SDKToolProgressMessage     // 工具进度
  | SDKAuthStatusMessage;      // 认证状态
```

### SDKAssistantMessage

```typescript
type SDKAssistantMessage = {
  type: 'assistant';
  message: BetaMessage;          // Anthropic API 消息格式
  parent_tool_use_id: string | null;
  error?: SDKAssistantMessageError;  // 错误类型
  uuid: UUID;
  session_id: string;
};

// 错误类型
type SDKAssistantMessageError =
  | 'authentication_failed'
  | 'billing_error'
  | 'rate_limit'
  | 'invalid_request'
  | 'server_error'
  | 'unknown';
```

`message.content` 是 Anthropic API 的 `ContentBlock[]`，包含：
- `{ type: "text", text: string }` — 文本内容
- `{ type: "thinking", thinking: string }` — 思考内容
- `{ type: "tool_use", id: string, name: string, input: object }` — 工具调用
- `{ type: "tool_result", tool_use_id: string, content: string }` — 工具结果

### SDKResultMessage

```typescript
// 成功结果
type SDKResultSuccess = {
  type: 'result';
  subtype: 'success';
  result: string;                    // 最终文本结果
  structured_output?: unknown;       // 结构化输出
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  total_cost_usd: number;
  usage: NonNullableUsage;           // Token 使用量
  modelUsage: Record<string, ModelUsage>;
  permission_denials: SDKPermissionDenial[];
  uuid: UUID;
  session_id: string;
};

// 错误结果
type SDKResultError = {
  type: 'result';
  subtype: 'error_during_execution'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries';
  errors: string[];
  // ...其余字段同 SDKResultSuccess
};
```

### SDKSystemMessage

系统消息有多个 `subtype`：
- `init` — 会话初始化，包含 `session_id`、`model`、`skills` 等
- `status` — 状态更新（如 `compacting`）
- `compact_boundary` — 上下文压缩边界
- `hook_response` — Hook 执行结果

### SDKPartialAssistantMessage

流式事件（需 `includePartialMessages: true`）：

```typescript
type SDKPartialAssistantMessage = {
  type: 'stream_event';
  event: BetaRawMessageStreamEvent;  // Anthropic 流式事件
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
};
```

### SDKUserMessage

```typescript
type SDKUserMessage = {
  type: 'user';
  message: MessageParam;            // { role: 'user', content: ContentBlock[] }
  parent_tool_use_id: string | null;
  session_id: string;
};
```

---

## Query 接口方法

`query()` 返回的对象除了是 `AsyncGenerator<SDKMessage>` 外，还提供控制方法（仅在流式输入模式下可用）：

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  // 中断当前执行
  interrupt(): Promise<void>;

  // 运行时修改权限模式
  setPermissionMode(mode: PermissionMode): Promise<void>;

  // 运行时切换模型
  setModel(model?: string): Promise<void>;

  // 设置思考 token 上限（null 清除限制）
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>;

  // 获取可用技能
  supportedSkills(): Promise<{ name: string; description: string }[]>;

  // 获取可用命令
  supportedCommands(): Promise<SlashCommand[]>;

  // 获取可用模型
  supportedModels(): Promise<ModelInfo[]>;

  // 获取可用子代理
  supportedAgents(): Promise<...>;

  // MCP 服务器状态
  mcpServerStatus(): Promise<McpServerStatus[]>;

  // 账户信息
  accountInfo(): Promise<AccountInfo>;

  // 文件回退（需 enableFileCheckpointing）
  rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<RewindFilesResult>;

  // 动态设置 MCP 服务器
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;

  // 流式输入
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;

  // 强制终止
  close(): void;

  // 获取提示建议
  promptSuggestion(): Promise<...>;

  // 重连/切换 MCP 服务器
  reconnectMcpServer(name: string): Promise<void>;
  toggleMcpServer(name: string, enabled: boolean): Promise<void>;
}
```

---

## Transport 层

### ProcessTransport

SDK 通过 `ProcessTransport` 启动 Claude Code 子进程：

```typescript
class ProcessTransport {
  // 启动子进程
  spawnLocalProcess(spawnOptions: SpawnOptions): SpawnedProcess;
  // 初始化（构造参数映射为 CLI args）
  initialize(): void;
  // 读取消息流
  readMessages(): AsyncGenerator<InternalMessage>;
  // 写入消息
  write(data: string): void;
  // 关闭输入
  endInput(): void;
  // 关闭传输
  close(): void;
}
```

**CLI 参数映射：** ProcessTransport 将 Options 映射为 CLI 参数：

```
--output-format stream-json
--verbose
--input-format stream-json
--max-thinking-tokens <N>
--max-turns <N>
--max-budget-usd <N>
--model <model>
--permission-mode <mode>
--resume <session-id>
```

**自定义进程启动：** 通过 `spawnClaudeCodeProcess` 选项可自定义进程启动逻辑（如在 VM、容器中运行）。

---

## 权限系统

### canUseTool 回调

自定义权限处理是 SDK 最重要的扩展点之一：

```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    toolUseID: string;
    agentID?: string;
  }
) => Promise<PermissionResult>;

// 返回值
type PermissionResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown>; updatedPermissions?: PermissionUpdate[] }
  | { behavior: 'deny'; message: string; interrupt?: boolean };
```

### 项目中的权限实现

项目 `runner.ts` 中根据 `permissionMode` 实现了三级权限策略：

```typescript
canUseTool: async (toolName, input, { signal }) => {
  // AskUserQuestion 总是需要用户确认
  if (toolName === "AskUserQuestion") {
    // 发送到前端等待用户响应
    return new Promise<PermissionResult>((resolve) => {
      session.pendingPermissions.set(toolUseId, { resolve });
    });
  }

  switch (permissionMode) {
    case 'bypassPermissions':
      return { behavior: "allow", updatedInput };

    case 'acceptEdits':
      // 文件操作自动允许，其他需要确认
      if (FILE_OPERATION_TOOLS.has(toolName)) {
        return { behavior: "allow", updatedInput };
      }
      // 发送到前端等待用户确认...

    case 'default':
      // 所有工具都需要用户确认
      // 发送到前端等待用户确认...
  }
}
```

---

## MCP 服务器

SDK 支持三种 MCP 服务器类型：

### Stdio MCP（外部进程）

```typescript
mcpServers: {
  "file-server": {
    type: "stdio",        // 可省略，默认值
    command: "node",
    args: ["./mcp-server.js"],
    env: { "KEY": "value" }
  }
}
```

### SSE / HTTP MCP（远程服务）

```typescript
mcpServers: {
  "remote-server": {
    type: "sse",          // 或 "http"
    url: "https://example.com/mcp",
    headers: { "Authorization": "Bearer ..." }
  }
}
```

### SDK MCP（进程内）

使用 `createSdkMcpServer` 创建运行在同一进程中的 MCP 服务器：

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const myServer = createSdkMcpServer({
  name: "my-tools",
  version: "1.0.0",
  tools: [
    tool(
      "get_weather",
      "获取指定城市的天气",
      { city: z.string().describe("城市名称") },
      async (args) => ({
        content: [{ type: "text", text: `${args.city} 的天气是晴天` }]
      })
    )
  ]
});

// 在 options 中使用
const q = query({
  prompt: "北京天气如何？",
  options: {
    mcpServers: { "my-tools": myServer }
  }
});
```

### 动态管理 MCP 服务器

```typescript
// 运行时添加/替换 MCP 服务器
const result = await q.setMcpServers({
  "new-server": { command: "node", args: ["./new-server.js"] }
});
// result: { added: [...], removed: [...], errors: {...} }

// 查询状态
const statuses = await q.mcpServerStatus();
// [{ name: "my-tools", status: "connected", serverInfo: {...} }]

// 重连
await q.reconnectMcpServer("my-tools");

// 启用/禁用
await q.toggleMcpServer("my-tools", false);
```

---

## Hook 系统

### Hook 事件类型

```typescript
const HOOK_EVENTS = [
  "PreToolUse",          // 工具执行前
  "PostToolUse",         // 工具执行后
  "PostToolUseFailure",  // 工具执行失败后
  "Notification",        // 通知
  "UserPromptSubmit",    // 用户提交提示
  "SessionStart",        // 会话开始
  "SessionEnd",          // 会话结束
  "Stop",                // 停止
  "SubagentStart",       // 子代理启动
  "SubagentStop",        // 子代理停止
  "PreCompact",          // 上下文压缩前
  "PermissionRequest"    // 权限请求
];
```

### Hook 配置

```typescript
const q = query({
  prompt: "...",
  options: {
    hooks: {
      PreToolUse: [{
        matcher: "Bash",    // 可选：匹配特定工具名
        timeout: 30,        // 可选：超时秒数
        hooks: [
          async (input, toolUseID, { signal }) => {
            console.log("即将执行 Bash:", input.tool_input);
            return {
              hookEventName: "PreToolUse",
              permissionDecision: "allow"   // "allow" | "deny" | "ask"
            };
          }
        ]
      }],

      PostToolUse: [{
        hooks: [
          async (input, toolUseID, { signal }) => {
            console.log("工具执行完成:", input.tool_name);
            return {
              hookEventName: "PostToolUse",
              additionalContext: "额外上下文信息"
            };
          }
        ]
      }]
    }
  }
});
```

### Hook 输入类型

```typescript
// 所有 Hook 共有
type BaseHookInput = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode?: string;
};

// PreToolUse
type PreToolUseHookInput = BaseHookInput & {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
};

// PostToolUse
type PostToolUseHookInput = BaseHookInput & {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown;
  tool_use_id: string;
};

// PermissionRequest
type PermissionRequestHookInput = BaseHookInput & {
  hook_event_name: 'PermissionRequest';
  tool_name: string;
  tool_input: unknown;
  permission_suggestions?: PermissionUpdate[];
};
```

---

## 子代理（Agents）

### 编程定义子代理

```typescript
const q = query({
  prompt: "运行所有测试并修复失败的",
  options: {
    agents: {
      "test-runner": {
        description: "执行测试并报告结果",
        prompt: "你是一个测试运行器...",
        tools: ["Bash", "Read", "Grep"],
        model: "haiku"    // "sonnet" | "opus" | "haiku" | "inherit"
      },
      "code-fixer": {
        description: "修复代码中的 bug",
        prompt: "你是一个代码修复专家...",
        disallowedTools: ["Write"],
        mcpServers: ["my-server"]
      }
    }
  }
});
```

### AgentDefinition

```typescript
type AgentDefinition = {
  description: string;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  mcpServers?: AgentMcpServerSpec[];
  criticalSystemReminder_EXPERIMENTAL?: string;
};
```

---

## Plugin 系统

### 加载插件

```typescript
const q = query({
  prompt: "...",
  options: {
    plugins: [
      { type: "local", path: "/path/to/my-plugin" },
      { type: "local", path: "./relative/plugin" }
    ]
  }
});
```

### 插件目录结构

```
my-plugin/
  .claude-plugin/
    plugin.json           # 插件元数据
  skills/                 # SDK 扫描此子目录
    frontend-design/
      SKILL.md
    pdf/
      SKILL.md
```

---

## 结构化输出

SDK 支持让 Agent 返回匹配 JSON Schema 的结构化数据：

```typescript
const q = query({
  prompt: "分析这个仓库的结构",
  options: {
    outputFormat: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          language: { type: "string" },
          framework: { type: "string" },
          files: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["language", "framework", "files"]
      }
    }
  }
});

for await (const msg of q) {
  if (msg.type === "result" && msg.subtype === "success") {
    const output = msg.structured_output;
    // { language: "TypeScript", framework: "React", files: [...] }
  }
}
```

---

## 系统提示配置

```typescript
// 自定义系统提示（替换默认提示）
systemPrompt: "你是一个专业的代码审查者。"

// 使用 Claude Code 默认提示
systemPrompt: { type: "preset", preset: "claude_code" }

// 在默认提示后追加
systemPrompt: {
  type: "preset",
  preset: "claude_code",
  append: "始终使用中文回答。所有文件操作前先确认。"
}

// 不设置 systemPrompt → 空提示（SDK 默认行为）
```

**重要：** SDK 默认不包含 Claude Code 的系统提示。要获得完整的 Claude Code 行为，必须显式设置 `{ type: 'preset', preset: 'claude_code' }`。

---

## 设置源控制

```typescript
// 不加载任何文件系统设置（SDK 隔离模式，默认）
settingSources: []

// 加载所有设置
settingSources: ["user", "project", "local"]

// 仅加载项目设置（包括 CLAUDE.md）
settingSources: ["project"]
```

| 源 | 路径 | 包含 |
|---|------|------|
| `user` | `~/.claude/settings.json` | 全局用户设置 |
| `project` | `.claude/settings.json` + `CLAUDE.md` | 项目设置 |
| `local` | `.claude/settings.local.json` | 本地设置 |

---

## 沙箱设置

```typescript
sandbox: {
  enabled: true,
  autoAllowBashIfSandboxed: true,    // 沙箱内自动允许 Bash
  allowUnsandboxedCommands: false,
  network: {
    allowedDomains: ["github.com"],
    allowLocalBinding: true,
    allowUnixSockets: ["/var/run/docker.sock"]
  },
  excludedCommands: ["rm -rf /"]
}
```

---

## 内置工具列表

以下是 Claude Code 的内置工具（可通过 `tools` / `allowedTools` / `disallowedTools` 控制）：

| 工具名 | 用途 |
|--------|------|
| `Bash` | 执行 shell 命令 |
| `Read` | 读取文件 |
| `Write` | 写入文件 |
| `Edit` | 编辑文件（精确替换） |
| `Glob` | 文件模式搜索 |
| `Grep` | 内容搜索 |
| `WebFetch` | 获取网页内容 |
| `WebSearch` | 搜索网页 |
| `NotebookEdit` | 编辑 Jupyter Notebook |
| `AskUserQuestion` | 向用户提问 |
| `Agent` / `Task` | 子代理调用 |
| `Skill` | 技能调用 |
| `TodoWrite` / `TaskCreate` / `TaskUpdate` / `TaskList` | 任务管理 |

---

## 错误处理

### 错误类型

```typescript
// 中止错误
class AbortError extends Error {}

// 退出原因
const EXIT_REASONS = [
  "clear",
  "logout",
  "prompt_input_exit",
  "other",
  "bypass_permissions_disabled"
];
```

### 结果错误子类型

```typescript
type SDKResultError = {
  subtype:
    | 'error_during_execution'             // 执行中出错
    | 'error_max_turns'                    // 超过最大轮数
    | 'error_max_budget_usd'               // 超过预算
    | 'error_max_structured_output_retries'; // 结构化输出重试超限
};
```

### 助手消息错误

```typescript
type SDKAssistantMessageError =
  | 'authentication_failed'   // 认证失败
  | 'billing_error'          // 计费错误
  | 'rate_limit'             // 速率限制
  | 'invalid_request'        // 无效请求
  | 'server_error'           // 服务器错误
  | 'unknown';               // 未知错误
```

### 错误处理模式

```typescript
try {
  for await (const message of q) {
    // 检查助手消息中的错误
    if (message.type === "assistant" && message.error) {
      console.error("API 错误:", message.error);
    }

    // 检查结果错误
    if (message.type === "result" && message.is_error) {
      console.error("执行错误:", message.errors);
    }
  }
} catch (error) {
  if (error instanceof AbortError) {
    console.log("查询被中止");
  } else {
    console.error("未预期的错误:", error);
  }
}
```

---

## 控制协议（内部）

SDK 与子进程之间通过 JSON 消息协议通信：

### 控制请求（SDK → 子进程）

```typescript
type SDKControlRequestInner =
  | { subtype: "initialize"; hooks?; sdkMcpServers?; jsonSchema?; systemPrompt?; agents? }
  | { subtype: "interrupt" }
  | { subtype: "set_permission_mode"; mode: PermissionMode }
  | { subtype: "set_model"; model?: string }
  | { subtype: "set_max_thinking_tokens"; max_thinking_tokens: number | null }
  | { subtype: "mcp_status" }
  | { subtype: "mcp_message"; server_name: string; message: JSONRPCMessage }
  | { subtype: "mcp_set_servers"; servers: Record<string, McpServerConfigForProcessTransport> }
  | { subtype: "rewind_files"; user_message_id: string; dry_run?: boolean }
  | { subtype: "can_use_tool"; tool_name: string; input: Record<string, unknown>; ... }  // 子进程→SDK
  | { subtype: "hook_callback"; callback_id: string; input: HookInput; ... }             // 子进程→SDK
```

### 控制响应（子进程 → SDK）

```typescript
type ControlResponse = { subtype: 'success'; request_id: string; response?: Record<string, unknown> };
type ControlErrorResponse = { subtype: 'error'; request_id: string; error: string };
```

### 消息流动

```
SDK Host                          Claude Code 子进程
   │                                    │
   ├── stdin: user message ──────────── │
   │                                    │
   │ ◄── stdout: control_request ────── │  (can_use_tool / hook_callback)
   │                                    │
   ├── stdin: control_response ──────── │  (allow/deny 决策)
   │                                    │
   │ ◄── stdout: assistant message ──── │
   │ ◄── stdout: stream_event ───────── │  (流式部分)
   │ ◄── stdout: result ─────────────── │  (最终结果)
   │                                    │
```

---

## 项目本地补丁：spawn → fork

### 补丁文件

`patches/@anthropic-ai%2Fclaude-agent-sdk@0.2.6.patch`

### 改动内容

```diff
- import { spawn } from "child_process";
+ import { fork } from "child_process";

  spawnLocalProcess(spawnOptions) {
-   const { command, args, cwd, env, signal } = spawnOptions;
+   const { args, cwd, env, signal } = spawnOptions;
    const stderrMode = ...;
-   const childProcess = spawn(command, args, {
+   const childProcess = fork(args[0], args.slice(1), {
      cwd,
-     stdio: ["pipe", "pipe", stderrMode],
+     stdio: stderrMode === "pipe"
+       ? ["pipe", "pipe", "pipe", "ipc"]
+       : ["pipe", "pipe", "ignore", "ipc"],
      signal,
-     env,
-     windowsHide: true
+     env
    });
```

### 改动原因

1. `fork` 是 Node.js 专用的子进程方式，自动建立 IPC 通道
2. 父子进程可通过 `process.send()` / `process.on('message')` 双向通信
3. 比纯 stdio pipe 更可靠，更适合 Electron 进程架构
4. stdio 增加 `"ipc"` 通道作为第 4 个 fd
5. 移除 `windowsHide: true`（Electron 不需要）
6. 不再需要 `command` 参数（fork 直接使用 Node.js）

---

## 项目集成模式

### runner.ts 核心调用流程

```typescript
// 1. 获取 API 配置（支持代理/直连）
const config = await getCurrentApiConfig(model);

// 2. 构建环境变量（注入 API Key 等）
const env = await buildEnvForConfig(config);
const mergedEnv = await getEnhancedEnv(config, env);

// 3. 构建增强提示词（注入记忆/技能/历史上下文）
const enhancedPrompt = buildEnhancedPrompt(prompt, contextInjection);

// 4. 调用 SDK
const q = query({
  prompt: promptInput,   // 字符串或 AsyncIterable<SDKUserMessage>
  options: {
    model: config.model,
    maxThinkingTokens,
    cwd: effectiveCwd,
    resume: resumeSessionId,
    abortController,
    env: mergedEnv,
    pathToClaudeCodeExecutable: getClaudeCodePath(),
    plugins: [{ type: "local", path: skillsPluginPath }],
    permissionMode: sdkPermissionMode,
    includePartialMessages: true,
    allowDangerouslySkipPermissions: true,
    canUseTool: async (toolName, input, { signal }) => { /* 权限处理 */ }
  }
});

// 5. 消费消息流
for await (const message of q) {
  if (message.type === "system" && message.subtype === "init") {
    session.claudeSessionId = message.session_id;
  }
  if (message.type === "result") {
    const usageInfo = await extractUsageFromResult(message, currentModel, isProxy);
    sendMessage(message, usageInfo);
  } else {
    sendMessage(message);
  }
}
```

### 关键文件映射

| 文件 | 职责 |
|------|------|
| `src/electron/libs/runner.ts` | SDK 调用入口，消息流处理 |
| `src/electron/libs/claude-settings.ts` | API 配置、环境变量、CLI 路径 |
| `src/electron/libs/skill-files.ts` | Skills 插件目录管理 |
| `src/electron/types.ts` | SDK 消息类型扩展 |
| `src/ui/components/chat/MessageAdapter.tsx` | 前端消息适配 |

---

## 调试指南

### 启用 SDK 调试日志

```typescript
// 方法 1：环境变量
env: { ...process.env, DEBUG_CLAUDE_AGENT_SDK: "1" }

// 方法 2：Options
options: {
  debug: true,
  debugFile: "/tmp/sdk-debug.log",
  stderr: (data) => console.error("[SDK stderr]", data)
}
```

### 常见问题

**1. 子进程启动失败**

```
Error: pathToClaudeCodeExecutable is required
```

确保 `pathToClaudeCodeExecutable` 指向正确的 `cli.js` 文件。项目中通过 `getClaudeCodePath()` 获取。

**2. 会话恢复失败**

清除过期的 `claudeSessionId`，让下一次以新会话启动：

```typescript
onSessionUpdate?.({ claudeSessionId: undefined });
```

**3. 权限回调不触发**

确保 `permissionMode` 不是 `bypassPermissions`，否则所有工具自动允许。使用 `default` 模式并提供 `canUseTool` 回调。

**4. MCP 工具超时**

默认超时 60 秒。设置环境变量 `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT` 增加超时。

**5. 内存泄漏（长会话）**

0.2.51 修复了消息 UUID 跟踪的内存无限增长问题。确保使用较新版本或注意长时间运行的会话。

**6. 流式消息闪烁**

`includePartialMessages: true` 会产生大量 `stream_event` 消息。前端需要正确去抖/合并这些事件。

---

## 版本兼容性

| SDK 版本 | Claude Code 版本 | 重要变更 |
|---------|-----------------|---------|
| 0.2.6 | v2.1.6 | 项目当前使用版本 |
| 0.1.0 | v2.0.x | 合并 systemPrompt，移除默认系统提示 |
| 0.1.45 | v2.0.45 | 结构化输出支持 |
| 0.1.54 | v2.0.54 | V2 Session API（实验性） |
| 0.1.57 | v2.0.57 | `tools` 选项（精确工具集） |
| 0.2.10 | v2.1.10 | agents 支持 skills 和 maxTurns |
| 0.2.15 | v2.1.15 | Query.close() 方法 |
| 0.2.21 | v2.1.21 | reconnectMcpServer/toggleMcpServer |
| 0.2.45 | v2.1.45 | Sonnet 4.6 支持 |
| 0.2.51 | v2.1.51 | 内存泄漏修复，task_progress 事件 |
| 0.2.59 | v2.1.59 | getSessionMessages() 历史消息 |
| 0.2.63 | v2.1.63 | supportedAgents() 方法 |
