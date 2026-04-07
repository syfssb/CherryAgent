# src/routes/proxy/adapters/

## Responsibility
实现各个 AI provider（Anthropic、OpenAI 等）的 API 适配器，统一转换消息格式、流式处理、token 计费等。

## Design
每个适配器实现 ProviderAdapter 接口，包括模型匹配、能力声明、请求处理、流式转换等。通过 adapters/index.ts 统一注册到 ProviderRegistry。

## Files & Functions

### **index.ts** — 适配器注册
- 导入所有内置适配器
- 调用 providerRegistry.register() 注册

### **anthropic.ts** — Anthropic (Claude) 适配器
实现 Claude Messages API（v1）的完整支持：
- `anthropicAdapter` — 适配器实例
- `countTokens()` — 预估 token 数量
- 模型匹配：claude-* 系列
- 能力：streaming=true、tools=true、vision=true
- 特性：支持 thinking 块、cache_control、extended thinking 等高级特性
- 流式转换：
  - content_block_start → 开启 text/thinking/tool_use 块
  - content_block_delta → 追加文本内容
  - content_block_stop → 关闭块
  - message_stop → 完成

### **openai-compat.ts** — OpenAI 兼容适配器
支持 OpenAI、讯虎（moonshot）、智谱（zhipu）等兼容 OpenAI API 的 provider：
- `openaiCompatAdapter` — 适配器实例
- 模型匹配：gpt-*、moonshot-*、glm-* 等
- 能力：streaming、tools 根据 channel 配置
- 消息转换：
  - user/assistant 角色直接透传
  - 支持 function_calling（OpenAI tools API）
- 流式转换：
  - data: ... 前缀的 SSE 格式
  - chunk.choices[0].delta 提取内容
  - [DONE] 标记流结束

## Key Patterns

### 模型匹配
```typescript
// 正则列表定义
readonly modelPatterns: RegExp[] = [
  /^claude-/, /^gpt-/, /^moonshot-/
]

matchesModel(modelId: string): boolean {
  return this.modelPatterns.some(p => p.test(modelId))
}
```

### 适配器实现框架
```typescript
const xxxAdapter: ProviderAdapter = {
  name: 'provider-name',
  modelPatterns: [...],
  capabilities: { streaming: true, tools: true, vision: true },
  matchesModel(id) { ... },
  async createCompletion(channel, params) { ... },
  async createStream(channel, params) { ... }
}
```

### 流式处理模式
```typescript
async *createStream(channel, params) {
  const stream = await fetch(...)
  for await (const line of readLines(stream.body)) {
    const parsed = parseProviderEvent(line)
    yield convertToStreamChunk(parsed)
  }
}
```

## Integration
- **依赖**：fetch/axios、channel、types (ProviderAdapter、UnifiedCompletionParams)
- **被依赖**：registry 和 handler (handleClaudeMessages、handleChatCompletions 等)
- **调用链**：
  - handler → adapter.createCompletion/createStream
  - → fetch(channel.apiUrl/key)
  - → 消息格式转换
  - → 流式处理 + token 计算
  - → yield StreamChunk

## Adding a New Provider
1. 创建 `src/routes/proxy/adapters/newprovider.ts`
2. 实现 ProviderAdapter 接口
3. 在 `adapters/index.ts` 添加 `register(newProviderAdapter)`
4. 模型表中添加对应 provider 和模型 ID
5. 无需修改其他代码，自动可用
