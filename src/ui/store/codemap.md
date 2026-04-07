# src/ui/store/

## Responsibility

全局状态管理层，使用 Zustand 管理应用的核心状态（会话、认证、设置、计费等），同时处理来自 Electron 主进程的服务器事件流，维持前后端数据同步。

## Design

采用多个专用 Store 模式，每个 Store 职责清晰：
- **useAppStore**：会话、消息、权限等核心业务逻辑（事件分发中枢）
- **useAuthStore**：用户认证、令牌、余额（持久化）
- **useSettingsStore**：用户偏好设置（localStorage 持久化）
- **useSessionStore**：本地会话列表、标签、搜索过滤（IPC 驱动）
- **useBillingStore**：账单、使用记录、充值订单
- **useSkillStore**：技能库管理
- **session-event-handlers**：会话事件处理集合（handleSessionStatus、handleStreamMessage 等）
- **batch-event-handler**：批量事件优化处理（流式消息、工具调用的高效聚合）

事件处理两层：单事件处理（高优先级，立即执行）→ 批处理（低优先级，50ms 聚合）。

## Flow

```
Electron IPC 事件流
    ↓
useIPC (useEventQueue) 分类
    ├→ 高优先级（session.status, stream.user_prompt 等）
    │    ↓
    │  useAppStore.handleServerEvent()
    │    ↓
    │  session-event-handlers: handleSessionStatus、handleStreamMessage...
    │
    └→ 低优先级（stream.message 批量）
         ↓
       50ms 批处理
         ↓
       useAppStore.handleServerEventBatch()
         ↓
       batch-event-handler: handleServerEventBatch()
         ↓
       session-event-handlers + 批量优化

消息去重：
  - UUID 去重（dedupMessagesByUuid）
  - Assistant 消息签名去重（isDuplicateAssistantInCurrentTurn）

错误处理：
  - 余额不足错误 → globalError + 计费 Store 刷新
  - 流式错误规范化（normalizeChatErrorText）
  - 权限请求 → permissionRequests 入队

工具执行追踪：
  stream_event → tool_progress/input_json_delta → useToolExecutionStore 更新
```

### 关键事件处理

- **session.list**：初始化会话列表，自动激活最新会话
- **session.history**：加载历史消息（带 UUID 去重）
- **session.status**：会话状态转移，清理工具索引，刷新余额；当 `metadata.isRetrying=true` 时同步更新 `SessionView.isRetrying` 和 `retryAttempt`
- **stream.message**：消息入队，支持 tool_progress、stream_event、system 等子类型
- **stream.user_prompt**：用户输入消息（高优先级）
- **permission.request**：权限请求弹窗
- **session.titleUpdated**：标题生成回调
- **system 消息**：hook 生命周期、任务通知、文件持久化（可观测层）

## Integration

### 依赖
- React Hooks: useState, useCallback, useRef, useEffect
- zustand: create, persist 中间件
- 类型定义: ../types (ServerEvent, StreamMessage, SessionStatus)
- 工具库: useToolExecutionStore, useThinkingStore, useAuthStatusStore
- 错误处理: ../lib/chat-error (isBalanceErrorText, normalizeChatErrorText)

### 被依赖
- **useSessionEvents** (hooks)：订阅单/批事件、处理部分消息、滚动管理
- **ChatView** (components)：显示会话消息、权限请求、工具执行
- **App** (主组件)：初始化 AppStore、处理全局错误
- **Electron IPC**：通过 window.electron.onServerEvent 接收事件

### 关键接口

**useAppStore** 导出：
```typescript
{
  sessions: Record<string, SessionView>    // 会话字典（id → SessionView）
  activeSessionId: string | null           // 当前激活会话
  pendingStart: boolean                    // 发送命令后等待 status running
  globalError: string | null               // 全局错误消息
  handleServerEvent: (event) => void       // 单事件处理（高优先级）
  handleServerEventBatch: (events) => void // 批事件处理（低优先级）
  setActiveSessionId: (id) => void         // 激活会话 + 工具执行状态水合
  resolvePermissionRequest: (sessionId, toolUseId) => void
}
```

**SessionView** 结构：
```typescript
{
  id: string
  title: string
  status: 'idle' | 'running' | 'completed' | 'error'
  messages: StreamMessage[]              // 消息列表（支持流式更新、工具调用）
  permissionRequests: PermissionRequest[] // 待处理权限请求
  hookLogs: HookLogEntry[]               // 可观测层：hook 生命周期日志
  observableEvents: SystemObservableEvent[] // 可观测层：系统事件
  isCompacting: boolean
  lastCompact: { trigger, preTokens, at }
  hydrated: boolean
  isRetrying?: boolean                   // SDK 正在重试 API（来自 session.status metadata）
  retryAttempt?: number                  // 当前重试次数（从 1 开始）
}
```

### 不可变更新

所有 Store 操作遵循不可变原则：
```typescript
// 示例：resolvePermissionRequest
set((state) => ({
  sessions: {
    ...state.sessions,
    [sessionId]: {
      ...existing,
      permissionRequests: existing.permissionRequests.filter(...)
    }
  }
}));
```

### 性能优化

1. **事件队列分层**：高优先级事件立即处理（避免 UI 卡顿），低优先级批处理
2. **消息去重**：UUID + 签名双重去重，防止网络重复/重排导致消息重复
3. **流式 tool_progress 节流**（hooks 层）：500ms 间隔，但保证最终状态不丢失
4. **批量 set 调用**：stream.message 按 sessionId 分组，单次 zustand.set 更新
5. **工具索引映射**：streamToolIndexMap 缓存 stream_event 的 content_block 索引 → tool_use_id 映射

### 已知问题 & 修复

- **0.2.10**：ChatView pendingStart 三重防护，stream.user_prompt 升高为高优先级
- **计费退款**：session.status 完成/错误时刷新 balance 和 period cards
- **流式错误规范化**：normalizeAssistantMessage 在消息存入前对错误文本进行规范化
