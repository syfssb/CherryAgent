# src/ui/components/chat/

## Responsibility
聊天 UI 组件层，负责消息渲染、思考链展示、工具调用日志、代码高亮、消息适配等。将 Claude Agent SDK 消息格式转换为 UI 可视化呈现，支持流式思考、工具执行、费用展示和权限确认。

## Design

### 核心架构
- **分层渲染**：SDK 原始消息 → MessageAdapter（适配） → 具体卡片组件（UserPromptCard, AssistantMessageCard 等）
- **流式支持**：ThinkingBlock、ToolLogItem 集成 store（useThinkingStore、useToolExecutionStore）实时更新
- **懒加载**：MarkdownRenderer 使用 Suspense + lazy 延迟加载 react-markdown（~1.5MB）
- **不可变性**：所有组件接收 immutable props，状态变更通过 store 或 callback

### 关键抽象
1. **MessageAdapter**：SDK 消息的适配器，根据消息类型（user_prompt, assistant, result, system）分发到不同卡片
   - `getErrorIcon(error)` 根据错误类型返回语义化 SVG 图标（lock/dollar/lightning/warning）
   - `result.success` 展示完成徽章（时长、token、费用）；之前版本错误地返回 null
   - 文本流式输出末尾显示打字光标：`animate-blink` 竖线（`isRunning` 时激活）
2. **ThinkingBlock**：可折叠思考内容展示，支持流式更新、时长计时、摘要截断
   - 折叠动画：CSS `grid-template-rows: 0fr ↔ 1fr` 过渡（无需 JS 高度测量）
   - 折叠时标题行内联显示摘要文本（截断 100 字符）
   - `isThinking` 时图标使用 `thinking-pulse` 关键帧脉冲动画
3. **ToolLogItem + ExecutionLogItem**：工具执行日志，支持展开/折叠、状态指示、耗时展示
   - `ToolIcon` 组件：按工具名展示差异化 SVG 图标（Bash/Read/Write/Edit/Grep/Glob/Web/Agent/默认）
   - 状态文本、进度提示均通过 i18n `t()` 国际化（不再硬编码中文）
4. **MarkdownRenderer**：支持 GFM 全语法（表格、任务列表、删除线、代码高亮），自定义各元素样式，遵循聊天排版 CSS 变量
5. **CodeBlock**：增强型代码块，支持行号、语言检测、文件名、复制按钮、行高亮
6. **ChatView**：顶级容器，管理消息虚拟化、加载指示、权限对话、部分消息预览
   - 消息入场动画：最新消息（运行中时）添加 `animate-fade-in` class
   - 跳转按钮使用 `animate-bounce-y`（纯垂直弹跳，无水平位移）
   - 实时工具执行标题显示执行数量 `liveToolExecutions.length`

### 设计模式
- **容器 + 展示**：ChatView（容器）→ MessageAdapter（路由）→ Card 组件（展示）
- **实时流更新**：StreamingThinkingBlock 监听 store，流式阶段读实时内容，完成后用静态内容
- **懒加载边界**：MarkdownRenderer 作为懒加载组件，预览和最终消息都用 lazy import
- **CSS grid-template-rows 折叠**：ThinkingBlock 用 `1fr/0fr` CSS 过渡代替 JS 高度计算，避免初始值 0 问题

## Flow

### 消息渲染流程
```
ChatView（props: visibleMessages）
  ↓
.map(visibleMessage) →
  ↓
MessageAdapter（message, isRunning, usage, provider）
  ├─ 根据 message.type 判断
  ├─ user_prompt → UserPromptCard
  ├─ assistant → AssistantMessageCard
  │   ├─ thinking → StreamingThinkingBlock
  │   ├─ text → MarkdownRenderer（lazy）
  │   └─ tool_use → ToolLogItem（useToolExecutionStore）
  ├─ system → SystemInitCard
  ├─ result → SessionResultCard（成功）或错误信息
  └─ user（tool_result） → ToolResultCard
```

### 思考链实时更新
1. 助手开始回复 → 前端创建 thinking content_block_start 事件 → `useThinkingStore` 记录 `startTime` 和初始 `content: ''`
2. 文本流入 → text_delta 事件累加到 `activeBlock.content`
3. 流式完成 → content_block_stop 事件 → 标记 `isThinking: false, endTime`
4. **StreamingThinkingBlock** 逻辑：
   - 若 `activeBlock.isThinking === true` 且是最后一个 content → 显示实时内容 + 计时器
   - 流式完成后 → 使用 static content（来自 SDK message）+ 最终耗时

### 工具执行日志
1. **ToolLogItem** 接收 `toolUseId, toolName, input`
2. 读取 `useToolExecutionStore` 里 `executions[toolUseId]` 的运行状态
3. 映射 status: `pending|running|success|error` 和耗时
4. 委托给 **ExecutionLogItem**（通用日志容器）+ **ToolCallCard**（展开内容）

### 权限确认流
```
ChatView 收到 permissionRequests[0]
  ↓
传递给 MessageAdapter → AssistantMessageCard
  ↓
若有 ToolUseBlock（已移除）或通过 onPermissionResult callback
  ↓
ChatView 的 onPermissionResult 回调
  ↓
触发 Electron IPC 或后端权限处理
```

### Markdown 渲染管道
```
MarkdownRenderer（content）
  ↓
<Suspense fallback={MarkdownShimmer}>
  <MarkdownRendererCore lazy={lazy}> ← lazy import markdown-core.tsx
    ↓
    ReactMarkdown
      .remarkPlugins: [remarkGfm]
      .rehypePlugins: [rehypeHighlight?]
      .components: { code, pre, h1-h6, table, img, ... }
        ├─ code: 判断 inline/block → CodeBlock (block) 或 <code> inline
        └─ pre: enhancedCodeBlocks ? skip : direct render
```

## Integration

### 依赖
- **@anthropic-ai/claude-agent-sdk**：消息类型定义（SDKMessage, SDKAssistantMessage 等）
- **react-markdown + rehype-highlight + rehype-raw + remark-gfm**：Markdown 渲染
- **useThinkingStore**：思考内容实时存储
- **useToolExecutionStore**：工具执行日志存储
- **useAppStore**：全局 app 状态（activeSessionId, pendingStart 等）
- **useAuthStore**：认证状态（isAuthenticated）
- **useSettingsStore**：排版设置（fontSize, lineHeight, paragraphSpacing）
- **chat-error utils**：错误文本规范化（normalizeChatErrorText）

### 被依赖
- **App.tsx** 或主聊天容器：import ChatView
- **MessageAdapter 的使用方**：
  - ChatView（主聊天界面）
  - 历史消息预览等

### 关键接口

#### ChatViewProps
```typescript
interface ChatViewProps {
  activeSessionId: string | null;
  visibleMessages: IndexedMessage[];      // 虚拟化消息列表
  isRunning: boolean;                     // 当前会话是否运行中
  isRetrying?: boolean;                   // SDK 正在重试（显示重试指示器）
  retryAttempt?: number;                  // 重试次数（显示在重试指示器中）
  permissionRequests: PermissionRequest[]; // 待确认权限
  liveToolExecutions: ToolExecutionState[]; // 实时执行的工具
  partialMessage: string;                 // 部分消息预览内容
  showPartialMessage: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  onPermissionResult: (sessionId, toolUseId, result) => void;
  provider?: string;                      // AI 提供商（用于头像）
}
```

#### MessageAdapterProps
```typescript
interface MessageAdapterProps {
  message: StreamMessage;                 // SDK 消息
  isLast?: boolean;
  isRunning?: boolean;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId, result) => void;
  usage?: MessageUsageInfo;               // 消息使用量
  showCost?: boolean;
  sessionId?: string;
  provider?: string;
}
```

#### MarkdownRendererProps
```typescript
interface MarkdownRendererProps {
  content: string;
  enhancedCodeBlocks?: boolean;  // true: 用 CodeBlock, false: 用 rehypeHighlight
  className?: string;
}
```

#### ThinkingBlockProps
```typescript
interface ThinkingBlockProps {
  content: string;
  durationMs?: number;
  isThinking?: boolean;
  defaultExpanded?: boolean;     // 默认展开
  summaryMaxLength?: number;     // 折叠时摘要截断长度
}
```

#### CodeBlockProps
```typescript
interface CodeBlockProps {
  code: string;
  language?: string;             // 语言（用于高亮）
  filename?: string;             // 文件名显示
  showLineNumbers?: boolean;
  highlightLines?: number[];     // 高亮行号
  startLineNumber?: number;
}
```

### 文件清单
- **ChatView.tsx**：顶级聊天界面，消息虚拟化、加载/等待指示、权限对话、部分消息预览
- **MessageAdapter.tsx**：SDK 消息 → UI 卡片的适配器，包含 UserPromptCard, AssistantMessageCard, SystemInitCard, ToolResultCard, SessionResultCard
- **ThinkingBlock.tsx**：可折叠思考内容，支持流式更新和计时
- **ToolLogItem.tsx**：工具日志条目（和 ExecutionLogItem 结合）
- **ExecutionLogItem.tsx**：通用执行日志容器，支持展开/折叠和状态指示
- **MarkdownRenderer.tsx**：Suspense 懒加载入口
- **MarkdownRendererCore.tsx**：核心 Markdown 渲染（react-markdown + 自定义 components）
- **CodeBlock.tsx**：增强型代码块（行号、复制、文件名、语法高亮）
- **Avatar.tsx**：聊天头像（user/ai/system）
- **MessageTimestamp.tsx**：消息时间戳
- **MessageActions.tsx**：消息操作按钮（复制、编辑等）
- **MessageCost.tsx**：消息费用显示
- **ToolCallCard.tsx**：工具调用详情卡片（input/output）
- **index.ts**：组件导出桶
