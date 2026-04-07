# src/ui/hooks/

## Responsibility

UI 交互层 Hooks，处理服务器事件、渲染优化、IPC 通信、滚动管理、消息窗口分页、认证/设置等跨页面逻辑，将业务逻辑与 React 组件解耦。

## Design

专用 Hook 模式，按功能领域组织：
- **useEventQueue**：事件队列（高/低优先级分类、后台可见性感知、批处理）
- **useSessionEvents**：会话事件流处理（单/批事件分发、部分消息节流、错误检测、通知）
- **useScrollManager**：滚动管理（自动滚动、历史加载、上拉加载更多）
- **useMessageWindow**：消息分页（按用户输入数分页，显示最近 N 个对话轮）
- **useIPC**：Electron IPC 通信（事件订阅/发送、一次性/持久订阅）
- **useAuth/useAuthStore/useAuthStatusStore**：认证状态管理
- **useSettingsStore**：设置管理
- **useThinkingStore**：thinking block 内容管理
- **useToolExecutionStore**：工具执行状态跟踪
- **其他**：useTheme, useLanguage, useRouter, useKeyboardShortcuts, useAutoTitle, useOAuth 等

## Flow

```
Electron IPC 事件流入
    ↓
useIPC (onServerEvent subscriber)
    ↓
useEventQueue (分类 + 可见性感知)
    ├→ 高优先级：立即调用 onSingleProcess
    │    ↓
    │  useSessionEvents.onEvent()
    │    ├→ handleServerEvent (AppStore)
    │    ├→ handlePartialMessages (stream_event 节流)
    │    └→ 通知检查 (桌面通知)
    │
    └→ 低优先级：50ms 批处理
         ↓
       useSessionEvents.onBatchEvent()
         ↓
       handleServerEventBatch (AppStore)

部分消息处理（useSessionEvents）：
  stream_event → content_block_start/delta/stop
    ├→ 检查是否 thinking block（由 ThinkingBlock 渲染）
    ├→ rAF 节流 setPartialMessage（确保最终状态不丢失）
    ├→ content_block_stop 时错误规范化
    └→ 自动滚动

工具进度节流（useSessionEvents）：
  tool_progress → 500ms 间隔节流
    ├→ shouldProcess 检查是否需要处理
    └→ flushFinal 确保最终状态不丢失

滚动管理（useScrollManager）：
  新消息来临 → isAtBottom 检查
    ├→ true → 自动滚动到底部 (smooth/auto)
    ├→ false → setHasNewMessages = true
    ├→ 上拉加载更多 → IntersectionObserver + loadMoreMessages
    └→ ResizeObserver 修正代码块/图片加载导致的滚动位移

消息分页（useMessageWindow）：
  总消息列表 → 按用户输入（user_prompt）分页
    ├→ 显示最近 N 个对话轮（3 个）
    ├→ 上滑加载更多 → loadMoreMessages
    └→ 会话切换 → 重置到最新

IPC 通信（useIPC）：
  window.electron.onServerEvent() → 订阅事件流
  window.electron.sendClientEvent() → 发送单向命令
  window.electron.dispatchClientEvent() → 发送双向请求（等待 ACK）
```

### 关键优化策略

**1. rAF 节流（partial message）**
- 流式消息频率高（每 ~20ms）
- rAF 聚合多个更新到一帧
- content_block_stop 时跳过节流，确保最终内容立即刷新

**2. 间隔节流（tool_progress）**
- 固定 500ms 间隔检查
- 使用 pendingTimer 确保最终状态被处理（flushFinal）
- 避免频繁更新 toolStore（getExecution 成本）

**3. 批处理（stream.message）**
- 事件队列按 50ms 聚合低优先级事件
- handleServerEventBatch 单次 zustand.set 调用
- tool_progress 过滤、stream_event 聚合、system 消息提取

**4. 可见性感知**
- document.visibilitychange 监听后台切换
- 后台时仅缓存事件（不处理）
- 回前台时分批处理（BACKGROUND_BATCH_SIZE = 100）

**5. 滚动管理**
- ResizeObserver 监听内容高度变化
- rAF 去抖避免流式期间过频繁的同步 layout read+write
- 历史加载 → 维持滚动位置（scrollHeightBefore 差量补偿）

## Integration

### 依赖
- React Hooks: useState, useRef, useCallback, useEffect, useMemo
- zustand: useAppStore, useAuthStore, useSettingsStore, useToolExecutionStore, useThinkingStore
- 类型: ../types (ServerEvent, StreamMessage, SessionStatus)
- 工具库: normalizeChatErrorText, scrollContainerToBottom, isNearBottom, SCROLL_THRESHOLD
- i18n: useTranslation

### 被依赖
- **ChatView**：useSessionEvents (事件处理), useScrollManager (滚动), useMessageWindow (分页)
- **App**：useIPC (全局事件订阅), useAuth (认证检查), useSettingsStore (主题/语言)
- **PromptInput**：useKeyboardShortcuts (快捷键)
- **LoginModal/RechargeModal**：useSessionEvents 返回的 showLoginModal/showRechargeModal
- **各子页面**：useLanguage, useTheme, useRouter, useRemoteConfig, useModels 等

### 关键接口

**useEventQueue** 返回：
```typescript
{
  enqueueEvent: (event: ServerEvent) => void
  // 内部自动分类：
  // - 高优先级 → 立即 onSingleProcess
  // - 低优先级 → 入队，50ms 后 onBatchProcess
}
```

**useSessionEvents** 返回：
```typescript
{
  partialMessage: string           // 流式预览文本
  showPartialMessage: boolean      // 是否显示预览
  showRechargeModal: boolean       // 余额不足提示
  showLoginModal: boolean          // 认证失败提示
  setShowRechargeModal: (bool) => void
  setShowLoginModal: (bool) => void
  onEvent: (event: ServerEvent) => void      // 单事件处理
  onBatchEvent: (events[]) => void           // 批事件处理
}
```

**useScrollManager** 返回：
```typescript
{
  messagesEndRef: React.RefObject<HTMLDivElement>
  scrollContainerRef: React.RefObject<HTMLDivElement>
  topSentinelRef: React.RefObject<HTMLDivElement>    // 用于上拉检测
  contentRootRef: React.RefObject<HTMLDivElement>    // 用于 ResizeObserver
  shouldAutoScrollRef: React.MutableRefObject<boolean>

  shouldAutoScroll: boolean        // 当前是否自动滚动
  hasNewMessages: boolean          // 新消息提示标志
  scrollToBottom: () => void       // 手动滚动到底
  handleScroll: () => void         // scroll 事件处理
  resetScrollState: () => void     // 重置滚动状态（会话切换）
  setHasNewMessages: (bool) => void
}
```

**useMessageWindow** 返回：
```typescript
{
  visibleMessages: IndexedMessage[]  // 当前可见消息（带原始索引）
  hasMoreHistory: boolean            // 是否有更多历史
  isLoadingHistory: boolean
  isAtBeginning: boolean
  loadMoreMessages: () => void
  resetToLatest: () => void
  totalMessages: number
  totalUserInputs: number
  visibleUserInputs: number          // 当前显示的用户输入数
}
```

**useIPC** 返回：
```typescript
{
  connected: boolean
  sendEvent: (event: ClientEvent) => void
  dispatchEvent: (event: ClientEvent) => Promise<{ success, error? }>
}
```

### 性能指标

- 事件队列批处理间隔：**50ms**
- 后台批处理大小：**100** 事件/批
- 工具进度节流：**500ms**
- 消息分页窗口：**3** 个用户输入轮
- IntersectionObserver margin：**100px**（上拉加载提前触发）
- Idle callback 超时：**100ms**（降级到 setTimeout）

### 已知问题 & 修复

- **stream.user_prompt 高优先级**（0.2.10）：确保用户输入消息立即响应，提升 pendingStart 防护
- **部分消息最终状态不丢失**：rAF 节流 + content_block_stop 跳过节流 + 500ms 延迟清空
- **工具进度最终状态**：flushFinal 使用 setTimeout，保证最后一次更新被处理
- **滚动位置修正**：ResizeObserver rAF 去抖 + scrollHeightBefore 差量补偿，避免历史加载导致抖动
