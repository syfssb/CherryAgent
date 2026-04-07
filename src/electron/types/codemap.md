# src/electron/types/

## Responsibility
Electron 主进程的类型定义集合，涵盖 IPC 事件、会话、计费、使用统计、本地数据库模型等，作为 Electron 层与 UI 层的类型契约。

## Design
- **IPC 契约**：ClientEvent（UI → Main）与 ServerEvent（Main → UI）的完整类型定义，支持类型安全的事件分发
- **消息扩展**：ExtendedStreamMessage 在 SDK 消息基础上增加 usage / createdAt 元数据，支持费用展示
- **权限模式枚举**：PermissionMode 控制工具调用授权策略（自动批准 / 仅编辑 / 全部确认）
- **计费类型**：与 API 服务器返回格式对齐，支持充值、使用统计、交易记录查询
- **本地数据库模型**：扩展会话、标签、技能、消息等实体的类型，支持 SQLite 操作的类型检查

## Flow

### 1. types.ts（核心 IPC 与会话类型）

**图片内容**：
```typescript
type ImageContent = {
  data: string;  // Base64 编码
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}
```

**消息使用量信息**：
```typescript
type MessageUsageInfo = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cost: number;
  costBreakdown?: { inputCost; outputCost };
  latencyMs: number;
  firstTokenLatencyMs?: number | null;
  model: string;
  provider: string;
  channelId?: string;
  requestId?: string;
}
```

**扩展消息类型**：
```typescript
type ExtendedStreamMessage = (SDKMessage | UserPromptMessage | ToolProgressMessage) & {
  _usage?: MessageUsageInfo;
  _createdAt?: number;
}
```

**会话状态与信息**：
```typescript
type SessionStatus = "idle" | "running" | "completed" | "error";

type SessionInfo = {
  id: string;
  title: string;
  status: SessionStatus;
  claudeSessionId?: string;
  provider?: "claude" | "codex";
  modelId?: string;
  providerThreadId?: string;
  runtime?: string;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
  activeSkillIds?: string[];
  skillMode?: "manual" | "auto";
  isPinned?: boolean;
  isArchived?: boolean;
  permissionMode?: PermissionMode;
  tags?: Array<{ id; name; color; createdAt }>;
}
```

**权限模式**：
```typescript
type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'default';
// bypassPermissions: 自动批准所有操作
// acceptEdits: 只自动批准文件操作 (Read, Write, Edit, Glob, Grep)
// default: 全部需要用户确认
```

### 2. 服务器事件（Main → UI）

```typescript
type ServerEvent =
  | { type: "stream.message"; payload: { sessionId; message: StreamMessage } }
  | { type: "stream.user_prompt"; payload: { sessionId; prompt; timestamp?; images? } }
  | { type: "session.status"; payload: { sessionId; status; title?; cwd?; modelId?; permissionMode?; skillMode?; activeSkillIds?; provider?; error?; metadata? } }
  | { type: "session.compacting"; payload: { sessionId; isCompacting } }
  | { type: "session.compact"; payload: { sessionId; trigger: "manual" | "auto"; preTokens } }
  | { type: "session.list"; payload: { sessions: SessionInfo[] } }
  | { type: "session.history"; payload: { sessionId; status; messages; modelId? } }
  | { type: "session.deleted"; payload: { sessionId } }
  | { type: "session.titleUpdated"; payload: { sessionId; title; isGenerating? } }
  | { type: "permission.request"; payload: { sessionId; toolUseId; toolName; input } }
  | { type: "runner.error"; payload: { sessionId?; message } };
```

### 3. 客户端事件（UI → Main）

```typescript
type ClientEvent =
  | { type: "session.start"; payload: { title; prompt; cwd?; allowedTools?; activeSkillIds?; skillMode?; permissionMode?; images?; modelId?; provider?; thinkingEffort? } }
  | { type: "session.continue"; payload: { sessionId; prompt; permissionMode?; images?; modelId?; provider?; thinkingEffort? } }
  | { type: "session.stop"; payload: { sessionId } }
  | { type: "session.delete"; payload: { sessionId } }
  | { type: "session.list" }
  | { type: "session.history"; payload: { sessionId } }
  | { type: "session.generateTitle"; payload: { sessionId } }
  | { type: "session.updateTitle"; payload: { sessionId; title } }
  | { type: "permission.response"; payload: { sessionId; toolUseId; result: PermissionResult } };
```

### 4. billing.ts（计费类型）

**计费相关对象**：
```typescript
interface BillingBalance {
  balance: string;
  currency: string;
  totalDeposited: string;
  totalSpent: string;
}

interface RechargeResult {
  orderId: string;
  method: 'stripe' | 'xunhupay';
  url: string;
  qrcodeUrl?: string;
}

type RechargeStatus = 'pending' | 'processing' | 'succeeded' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded' | 'needs_review';

interface UsageRecord {
  id: string;
  timestamp?: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  status: string;
  latencyMs: number | null;
  createdAt: string | Date;
  currency?: string;
}

interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: string;
  currency: string;
  byModel: Record<string, { requests; tokens; cost }>;
  byProvider: Record<string, { requests; tokens; cost }>;
  period: { start: string; end: string };
}

interface TransactionRecord {
  id: string;
  type: string;
  timestamp?: number;
  amount: number;
  balanceBefore: string;
  balanceAfter: number;
  description: string | null;
  createdAt: string | Date;
  currency?: string;
}
```

### 5. local-db.ts（本地数据库模型）

**标签系统**：
```typescript
interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

interface SessionTag {
  sessionId: string;
  tagId: string;
  createdAt: number;
}
```

**会话扩展**：
```typescript
interface ExtendedSession {
  id: string;
  title: string;
  claudeSessionId?: string;
  status: SessionStatus;
  cwd?: string;
  allowedTools?: string;
  activeSkillIds?: string[];
  skillMode?: "manual" | "auto";
  lastPrompt?: string;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SessionWithTags extends ExtendedSession {
  tags: Tag[];
}
```

**记忆系统**：
```typescript
interface MemoryBlock {
  id: string;
  label: string;
  description: string;
  value: string;
  charLimit: number;
  createdAt: number;
  updatedAt: number;
}

interface ArchivalMemory {
  id: string;
  content: string;
  embedding?: Float32Array | null;
  sourceSessionId?: string;
  tags: string[];
  createdAt: number;
}
```

**技能模型**：
```typescript
interface SkillCreateInput {
  name: string;
  description?: string;
  category?: string;
  enabled?: boolean;
  content: string;
}

interface SkillUpdateInput {
  name?: string;
  description?: string;
  category?: string;
  enabled?: boolean;
  content?: string;
}
```

**迁移系统**：
```typescript
interface Migration {
  version: number;
  name: string;
  up(db: Database): void;
  down(db: Database): void;
}

interface MigrationRecord {
  version: number;
  name: string;
  appliedAt: number;
}
```

## Integration
- **依赖**：
  - `@anthropic-ai/claude-agent-sdk`：SDKMessage / SDKResultMessage / SDKUserMessage / PermissionResult
  - 其他 types.ts 互相引用

- **被依赖**：
  - `main.ts`：ClientEvent / ServerEvent 处理
  - `ipc-handlers.ts`：事件类型检查与转换
  - `preload.cts`：IPC API 类型签名
  - `libs/**/*.ts`：业务逻辑类型检查
  - 渲染进程（通过 IPC 接收 ServerEvent 与发送 ClientEvent）
  - 数据库操作（SQLite 模型 CRUD）

- **关键接口**：
  - ClientEvent：UI 与主进程通信的请求事件
  - ServerEvent：主进程与 UI 通信的响应/推送事件
  - SessionInfo：会话元数据（标题、状态、工作目录、标签等）
  - MessageUsageInfo：消息费用展示数据（token / cost / latency）
  - PermissionMode：工具调用授权策略
  - BillingBalance / UsageStats / TransactionRecord：计费数据模型
