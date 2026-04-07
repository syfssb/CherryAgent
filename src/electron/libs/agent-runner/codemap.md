# src/electron/libs/agent-runner/

## Responsibility
Agent 运行时抽象层，提供双栈支持（Claude SDK + Codex SDK）的统一接口，处理消息流转、权限请求、工具调用、会话恢复等核心逻辑。

## Design
- **中立类型层**：types.ts 定义所有抽象类型（AgentProvider / IAgentRunner / AgentRunnerEvent），零 SDK 依赖
- **工厂模式**：AgentRunnerFactory.create(provider) 延迟导入对应 runner 实现，避免未安装 SDK 时启动崩溃
- **事件总线**：所有 runner 通过统一的 AgentRunnerEvent 类型与调用方通信（message / permission_request / session_id / status / title_hint）
- **权限请求拦截**：runner 发出 permission_request 事件 → 调用方决定 allow/deny → runner 继续或中止
- **会话恢复**：resumeSessionId 指向 provider 的原生会话 ID（Claude sessionId 或 Codex threadId），不存在时创建新会话
- **上下文注入**：memoryContext / skillContext / fullSkillContext / customSystemPrompt / historyContext 合成 system prompt

## Flow

### 1. types.ts（中立类型定义）
- **AgentProvider**：'claude' | 'codex'
- **AgentRuntime**：'claude-sdk' | 'codex-sdk'（用于统计和计费区分）
- **AgentMessage**：text / text_delta / thinking / tool_use / tool_result / system（中立消息类型）
- **AgentPermissionMode**：bypassPermissions / acceptEdits / default
- **AgentContextInjection**：上下文注入选项（memory / skill / customSystemPrompt / historyContext）
- **AgentRunnerOptions**：prompt / images / model / cwd / resumeSessionId / permissionMode / contextInjection / thinkingEffort
- **AgentRunnerEvent**：统一事件总线（message / permission_request / session_id / status / title_hint）
- **IAgentRunner**：interface 定义 run(options, onEvent) 方法

### 2. factory.ts（工厂）
- **createClaudeRunner()**：延迟导入 ./claude-runner.js（避免 SDK 未安装时启动失败）
- **createCodexRunner()**：延迟导入 ./codex-runner.js（检查特征标志是否启用）
- **AgentRunnerFactory.create(provider)**：根据 provider 创建对应 runner
- **AgentRunnerFactory.getAvailableProviders()**：返回可用 provider 列表（基于特征标志）

### 3. claude-runner.ts（Claude SDK 实现）
- **ClaudeAgentRunner**：implements IAgentRunner
  - provider = 'claude'
  - runtime = 'claude-sdk'
  - run(options, onEvent)：
    1. 构建 system prompt（注入上下文）
    2. 从 claude-settings 读取 API 配置（model / apiKey / customHeaders 等）
    3. 初始化 Claude SDK（ProcessTransport 子进程 fork）
    4. 继续或创建新会话（resumeSessionId）
    5. 流式接收 SDK Message 事件
    6. 转换为 AgentRunnerEvent（message / title_hint / status）
    7. 权限请求拦截：当 tool_use 到达，发出 permission_request 事件，等待调用方响应
    8. 工具调用结果注入：permission 批准后，注入 tool_result message
    9. 会话 ID 回调：session_id event（首次获得原生会话 ID）
    10. Abort 支持：abortController.abort() 停止运行

### 4. codex-runner.ts（Codex SDK 实现）
- **CodexAgentRunner**：implements IAgentRunner
  - provider = 'codex'
  - runtime = 'codex-sdk'
  - run(options, onEvent)：
    1. 从 codex-settings 读取 API 配置 & 工作目录（确保 Codex 可执行文件存在）
    2. 初始化 Codex SDK（类似 Claude）
    3. 处理线程 ID（resumeSessionId）
    4. 接收 Codex Message 事件流
    5. 转换为 AgentRunnerEvent（Codex 无原生权限模式，runner 负责权限拦截）
    6. fullSkillContext 注入（Codex 无 Skill tool，直接拼接到 system prompt）

### 5. codex-settings.ts（Codex 配置）
- **getCodexBinary()**：根据 platform/arch 返回 Codex 可执行文件路径
  - Windows：`node_modules/@openai/codex-win32-x64/vendor/.../codex.exe`
  - macOS arm64：`node_modules/@openai/codex-darwin-arm64/vendor/.../codex`
  - macOS x64：`node_modules/@openai/codex-darwin-x64/vendor/.../codex`
- **ensureCodexBinary()**：检查二进制文件存在，否则从 npm pack 解压
- **validateCodexSetup()**：校验环境（工作目录、二进制可执行、权限等）

### 6. index.ts（导出聚合）
- 导出 types.ts 的所有类型
- 导出 factory.ts 的 AgentRunnerFactory
- 公开的 API 包括：
  - AgentProvider / AgentRuntime / AgentMessage / AgentRunnerOptions / AgentRunnerEvent / IAgentRunner
  - AgentRunnerFactory

## Integration
- **依赖**：
  - `types.ts`：所有调用方依赖的中立类型
  - `@anthropic-ai/claude-agent-sdk`：Claude runner 用
  - `@anthropic-ai/codex-sdk`（可选）：Codex runner 用
  - `../feature-flags.js`：isCodexEnabled()
  - `../claude-settings.js`：Claude API 配置读取
  - `./codex-settings.ts`：Codex 二进制路径与验证

- **被依赖**：
  - `../runner.ts`：createRunner(provider) 用 factory 创建
  - `../ipc-handlers.ts`：session.start / session.continue 用 runner 实例
  - `main.ts`：provider 推导逻辑

- **关键接口**：
  - IAgentRunner.run(options, onEvent)：启动/继续会话，返回 Promise<AgentRunnerHandle>
  - AgentRunnerEvent：事件总线（message / permission_request / session_id / status / title_hint）
  - AgentPermissionHandler：权限决策回调函数
  - AbortController：会话中止信号
