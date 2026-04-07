# src/routes/proxy/

## Responsibility
AI 模型 API 代理网关。统一处理来自客户端（Electron、Web）的 AI 模型请求，转发至后端渠道（Anthropic、OpenAI 等），实现多渠道负载均衡、成本控制和计费。

## Design
**适配器模式**：每个 provider（anthropic、openai 等）实现统一的 ProviderAdapter 接口，通过 ProviderRegistry 统一管理。消息格式转换、流式处理、token 计费等由适配器完成。核心模块包括：

- **registry.ts** — Provider 注册表，支持动态注册和查询
- **adapters/** — Provider 适配器实现（anthropic、openai-compat）
- **schemas.ts** — 请求/响应 Zod schema
- **types.ts** — 统一类型定义（UnifiedCompletionParams、StreamChunk 等）
- **chat-completions.ts** — OpenAI 兼容格式处理
- **claude-handler.ts** — Claude Messages API 处理
- **responses.ts** — Codex SDK 响应代理
- **upstream-error.ts** — 上游服务错误处理
- **utils.ts** — 工具函数（token 计算、错误转换等）

## Flow
1. **请求进入** → validate body (schema)
2. **选择渠道** → selectChannel(model) 找到可用渠道
3. **消息转换** → 客户端格式 → 统一格式 → provider 格式
4. **预检费用** → preCharge() 预扣费用（支持期卡优先）
5. **发送请求** → adapter.createStream() / createCompletion()
6. **处理响应**：
   - 非流式：CompletionResult → 转换为 OpenAI/Claude 格式 → 返回
   - 流式：AsyncIterable<StreamChunk> → 逐块转换 → Server-Sent Events (SSE)
7. **结算费用** → settlementCharge() 根据实际使用量调整
8. **记录日志** → usageLog 记录请求

## Routes

### POST /api/proxy/v1/responses/compact (Codex SDK 上下文压缩)
- Codex CLI 会话历史超出上下文窗口时自动调用，将对话历史压缩为摘要
- 非流式 JSON 响应；路由注册在 /v1/responses 之前
- 中间件：authenticate、balanceCheck

### POST /api/proxy/v1/messages (Claude API)
- 请求体：Claude Messages API 格式
- 响应：同格式（streaming 返回 SSE）
- 中间件：authenticate、balanceCheck

### POST /api/proxy/chat/completions (OpenAI 兼容)
- 请求体：OpenAI ChatCompletion 格式
- 响应：同格式
- 中间件：authenticate、balanceCheck

### POST /api/proxy/responses (Codex SDK)
- 用于 Codex SDK 调用
- 中间件：authenticate、balanceCheck

### POST /api/proxy/v1/messages/count_tokens
- 预估 token 数量（不消耗额度）
- 无 balanceCheck 中间件

### GET /api/proxy/models
- 返回所有启用的模型列表及能力
- optionalAuth

### GET /api/proxy/channels
- 返回渠道状态和健康度
- authenticate

### GET /api/proxy/providers
- 返回已注册 Provider 列表
- optionalAuth

## Integration
- **依赖**：Express、Zod、services (channel、billing、usage)、adapters、utils
- **被依赖**：app.ts 挂载 proxyRouter
- **调用链**：
  - 客户端 → proxyRouter (index.ts) → validateBody → auth → balanceCheck
  - → specific handler (handleClaudeMessages 等) → selectChannel
  - → adapter.createStream/createCompletion → 返回流或完成响应
  - → billing 结算 → usageLog 记录

## Key Abstractions
- **ProviderAdapter** — Provider 统一接口
- **UnifiedCompletionParams** — 客户端请求统一格式
- **StreamChunk** — 流式响应统一格式
- **ProviderRegistry** — 动态管理适配器注册和查询
