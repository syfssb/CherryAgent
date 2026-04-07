# Claude Code 源码调研报告：对 Cherry Agent 的借鉴价值

> 调研日期：2026-03-31
> 源码来源：Claude Code npm source map 泄露（instructkr/claude-code）
> 规模：约 1900 文件、51万行 TypeScript、运行时 Bun + React Ink（终端 UI）
> 调研方式：8 个并行 agent 深度分析

---

## 目录

- [一、核心架构差异](#一核心架构差异)
- [二、P0 — 立即可移植，回报最高](#二p0--立即可移植回报最高)
  - [1. 三层记忆系统](#1-三层记忆系统)
  - [2. 五层上下文压缩](#2-五层上下文压缩)
  - [3. Forked Agent 模式](#3-forked-agent-模式)
- [三、P1 — 高价值，需要适配](#三p1--高价值需要适配)
  - [4. 工具系统架构](#4-工具系统架构)
  - [5. 增强的 Skill 系统](#5-增强的-skill-系统)
  - [6. 多 Agent 协调](#6-多-agent-协调)
  - [7. 流式工具并发执行](#7-流式工具并发执行)
  - [8. Hook 生命周期系统](#8-hook-生命周期系统)
- [四、P2 — 长期方向参考](#四p2--长期方向参考)
  - [9. IDE Bridge 架构](#9-ide-bridge-架构)
  - [10. Feature Flag 系统](#10-feature-flag-系统)
  - [11. 自动权限分类器](#11-自动权限分类器)
  - [12. Companion Sprite（Buddy）](#12-companion-spritebuddy)
  - [13. 远程会话系统](#13-远程会话系统)
  - [14. 快捷键系统](#14-快捷键系统)
  - [15. Dream Task（投机执行）](#15-dream-task投机执行)
- [五、Claude Code 2-3 月新功能（产品层面）](#五claude-code-2-3-月新功能产品层面)
- [六、Cherry Agent 的独特优势](#六cherry-agent-的独特优势)
- [七、推荐实施路线图](#七推荐实施路线图)
- [八、关键源码文件索引](#八关键源码文件索引)

---

## 一、核心架构差异

| 维度 | Claude Code | Cherry Agent |
|------|------------|-------------|
| **Agent 循环** | 自己实现完整 QueryEngine + 45 工具 | 依赖 Claude Agent SDK 黑箱 |
| **UI** | 终端 Ink（CLI only） | React 18 + Tailwind + Electron |
| **运行时** | Bun | Node.js (Electron) |
| **状态管理** | 自定义 Store（观察者模式） | Zustand 多 Store |
| **AI SDK** | 直接调用 Anthropic API | Claude Agent SDK + Codex SDK |
| **代码规模** | 51 万行、1900 文件 | 约 200+ 文件 |

根本差异：**Claude Code 自己控制 Agent 循环的每一步**（消息构建、工具调度、上下文压缩、重试策略），而 Cherry Agent 把这些交给了 SDK。这意味着 Claude Code 能做很多 SDK 层做不到的优化。

---

## 二、P0 — 立即可移植，回报最高

### 1. 三层记忆系统

Cherry Agent **当前没有记忆系统**。Claude Code 有三层自动记忆：

#### 架构

```
Layer 1: Session Memory（对话中实时记忆）
  └─ 每 N 轮对话用 forked agent 提取关键信息到临时文件
  └─ 文件：services/SessionMemory/sessionMemory.ts

Layer 2: Auto Extract（对话结束后持久化记忆）
  └─ Stop hook 触发 → fork 子 agent → 分析对话 → 写入 ~/.claude/projects/{slug}/memory/
  └─ 文件：services/extractMemories/extractMemories.ts

Layer 3: Auto Dream（定期记忆整合）
  └─ 24h + 5 次新会话后触发 → 后台整理/合并/修剪记忆
  └─ 文件：services/autoDream/autoDream.ts
```

#### 记忆存储设计

```
~/.claude/projects/{slug}/memory/
  ├── MEMORY.md           # 索引文件（200 行 / 25KB 上限）
  ├── user_role.md         # 具体记忆文件
  ├── feedback_testing.md
  └── project_deadline.md
```

MEMORY.md 是索引，每条记忆一行指针：
```markdown
- [用户角色](user_role.md) — 高级前端工程师，熟悉 React
- [测试偏好](feedback_testing.md) — 集成测试用真实数据库，不用 mock
```

#### 记忆文件格式

```markdown
---
name: 测试偏好
description: 用户偏好集成测试使用真实数据库
type: feedback
---

集成测试必须用真实数据库，不用 mock。
**Why:** 上季度 mock 测试全过但生产迁移失败。
**How to apply:** 写测试时默认连接测试数据库。
```

四种记忆类型：
- `user` — 用户角色、偏好、知识水平
- `feedback` — 工作方式指导（做什么/不做什么）
- `project` — 进行中的工作、目标、截止日期
- `reference` — 外部系统指针（Linear 项目、Slack 频道等）

#### 关键实现细节

- **截断保护**：`MAX_ENTRYPOINT_LINES=200`，`MAX_ENTRYPOINT_BYTES=25_000`
- **Auto Extract 用 forked agent**：共享父会话的 prompt cache（省钱），独立上下文不影响主对话
- **Dream 调度三关**：时间门控（24h）→ 会话数门控（5 个新会话）→ 锁检查（防并发）
- **互斥控制**：如果主 Agent 已写入记忆文件，跳过 fork（避免冲突）
- **增量处理**：cursor-based，仅处理上次提取后的新消息

#### Cherry Agent 移植方案

```
Phase 1（1 周）：
  - runner.ts onComplete 回调 → 用 Haiku 分析对话 → 提取记忆
  - 写入 ~/.cherry-agent/memory/ 目录
  - 下次对话时 runner.ts 的 memoryContext 从该目录读取

Phase 2（2 周）：
  - Session Memory：对话中每 10 轮用 Haiku 更新会话摘要
  - Auto Dream：后台定时整理（参考 autoDream.ts 的双门控）
```

---

### 2. 五层上下文压缩

Cherry Agent 完全依赖 SDK 内部压缩，无法控制。Claude Code 有**五层**渐进式压缩：

| 层级 | 名称 | 成本 | 触发条件 | 说明 |
|------|------|------|---------|------|
| 1 | **Snip** | 零 | 上下文偏大 | 按边界移除历史消息，保护末尾 N 条 |
| 2 | **MicroCompact** | 零/极低 | 单消息多工具结果 | 合并同一条 assistant 消息中的多个工具结果 |
| 3 | **ContextCollapse** | 低 | 需要 API 调用 | 上下文折叠存储（feature flag 控制） |
| 4 | **AutoCompact** | 中 | context 占用 ~80% | 侧链 agent 总结历史对话 |
| 5 | **手动 /compact** | 中 | 用户触发 | 完全用户控制 |

#### 关键配置

```typescript
// autoCompact.ts
MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20_000  // 压缩摘要 token 上限
有效上下文 = getContextWindowForModel(model) - MAX_OUTPUT_TOKENS_FOR_SUMMARY

// 断路器
consecutiveFailures >= 3 → 停止自动压缩（防止无限重试）

// 可覆盖
CLAUDE_CODE_AUTO_COMPACT_WINDOW 环境变量可设置自定义上下文窗口大小
```

#### AutoCompact 流程

```
检测 token 使用量 > 阈值（context - 13K）
  ↓
executePreCompactHooks()
  ↓
compactConversation()：
  1. 收集 compact 边界后的所有消息
  2. 构建摘要 prompt
  3. runForkedAgent() 生成摘要（共享 prompt cache）
  4. 插入 SystemCompactBoundaryMessage
  5. 保留未压缩的近期消息
  ↓
runPostCompactCleanup()
  ↓
notifyCompaction() → prompt cache 重建
```

#### Cherry Agent 可做的

```
Phase 1（低成本）：
  - 实现 MicroCompact：对 SDK 返回的 tool_result 事件做截断/摘要后再存入 SQLite
  - 对超长工具输出（>30KB）自动截断，保留头尾 + 摘要

Phase 2（中成本）：
  - 长对话场景下，用 Haiku 对旧消息做 summarize 后注入 historyContext
  - 参考 autoCompact 的阈值检测逻辑
```

---

### 3. Forked Agent 模式

Claude Code 的核心基础设施——**记忆提取、上下文压缩、质量评估**都复用同一个模式。

#### 核心概念

```typescript
// CacheSafeParams（与父 agent 共享，命中 prompt cache）
{
  systemPrompt,       // 系统提示
  userContext,         // 用户上下文
  systemContext,       // 系统上下文
  toolUseContext,      // 工具、模型、选项
  forkContextMessages  // 缓存共享用的消息前缀
}

// ForkedAgentParams（子 agent 独有）
{
  promptMessages,      // 独立的消息流
  maxOutputTokens,     // 输出限制
  maxTurns,            // 最大轮数
  skipTranscript,      // 不记录到磁盘
  skipCacheWrite,      // 不创建新缓存 entry
  onMessage,           // 流式消息回调
}
```

#### 为什么省钱

子 agent 的请求前缀与父 agent **完全相同**（systemPrompt + userContext + systemContext + tools），所以 Anthropic API 的 prompt cache 命中率极高。只有最后的 `promptMessages`（几百 token）不同。

#### Fork 执行规则

- **不可递归 fork**（检测 `FORK_BOILERPLATE_TAG`）
- 工具操作直接执行，中间不输出文本
- 修改文件后需要提交，包含 commit hash

#### Cherry Agent 应用场景

| 场景 | 模型 | 说明 |
|------|------|------|
| 记忆提取 | Haiku | 对话结束后分析并写入记忆 |
| 标题生成 | Haiku/gpt-4o-mini | 已在做，但可优化 |
| 上下文摘要 | Haiku | 长对话压缩 |
| 质量评估 | Haiku | 评估 AI 回复质量并自动改进 |

---

## 三、P1 — 高价值，需要适配

### 4. 工具系统架构

Claude Code 的工具系统用 `buildTool()` 模式构建，fail-closed 默认值极其优雅。

#### buildTool 模式

```typescript
// 安全默认值（Tool.ts 第 757-792 行）
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: () => false,   // 默认假设不安全
  isReadOnly: () => false,           // 默认假设有写操作
  isDestructive: () => false,
  checkPermissions: () => ({ behavior: 'allow' }),
  toAutoClassifierInput: () => '',
}

// 工具只需 override 关心的字段
export const MyTool = buildTool({
  name: 'my-tool',
  inputSchema: z.object({ path: z.string() }),
  async call(args, context, canUseTool, parentMessage, onProgress) {
    // 实现...
  },
  isReadOnly: () => true,  // 覆盖默认值
})
```

#### 三层工具池

```
Layer 1: getAllBaseTools()
  └─ 所有内置工具（~60+），feature flag 过滤

Layer 2: getTools(permissionContext)
  └─ 应用权限拒绝规则过滤
  └─ 简单模式：仅 [Bash, Read, Edit]
  └─ 完整模式：全部工具

Layer 3: assembleToolPool(permissionContext, mcpTools)
  └─ 合并内置 + MCP 工具
  └─ uniqBy('name') 去重（内置优先）
  └─ 稳定排序（prompt cache 友好）
```

#### 工具行为声明

每个工具声明自己的行为特征，系统据此做调度优化：

```typescript
interface Tool {
  isConcurrencySafe(input): boolean   // 能否并行执行？
  isReadOnly(input): boolean          // 是否只读？
  isDestructive(input): boolean       // 是否破坏性操作？
  isSearchOrReadCommand(input): { isSearch, isRead, isList }  // UI 折叠判断
  interruptBehavior(): 'cancel' | 'block'   // 中断时的行为
  maxResultSizeChars: number          // 超过此大小持久化到磁盘
}
```

#### Cherry Agent 借鉴点

当 Cherry Agent 需要添加自定义工具（数据库查询、CI/CD、API 调用等）时：
- 采用 `buildTool()` + 默认值模式，减少样板代码
- 行为声明驱动调度（并发安全 → 并行执行，只读 → 跳过权限确认）
- 工具结果超大时持久化到磁盘（`maxResultSizeChars`）

---

### 5. 增强的 Skill 系统

Claude Code 的 Skill frontmatter 比 Cherry Agent 丰富得多：

#### 完整 Frontmatter 格式

```yaml
---
name: skill-name
description: 一行描述
when_to_use: "Use when... Examples: 'command1', 'command2'"
allowed-tools:                    # 限制工具范围（安全边界）
  - Bash(gh:*)
  - Read
  - Write
context: inline | fork           # 执行模式
model: claude-opus               # 指定模型（当前 Cherry Agent 无此能力）
arguments:                       # 参数列表
  - arg_name
argument-hint: "[参数占位符]"
---
```

#### Skill 加载来源（6 种）

| 来源 | 路径 | 说明 |
|------|------|------|
| `bundled` | 编译到 CLI | 内置技能（/remember, /skillify, /verify 等） |
| `skills` | `~/.claude/skills/` 或 `.claude/skills/` | 用户创建 |
| `plugin` | 插件目录 | 插件提供的技能 |
| `managed` | 策略管理路径 | 组织策略控制 |
| `mcp` | MCP 服务器 | MCP 动态提供 |
| `commands_DEPRECATED` | `~/.claude/commands/` | 旧版兼容 |

#### Skillify 功能

Claude Code 有一个 `/skillify` 内置 skill，能把一次成功的对话**自动转换为可复用的 skill**：
1. 分析会话中的工具使用、输入参数、权限需求
2. 4 轮面试用户（确认名称/步骤/参数/触发条件）
3. 自动生成 SKILL.md 文件

#### Cherry Agent 可增强的

- 新增 `model` 字段：让 skill 指定用 Opus（复杂推理）还是 Sonnet（快速编码）
- 新增 `allowed-tools` 字段：限制 skill 的工具范围（安全边界）
- 新增 `context: fork`：skill 在隔离环境中运行，不影响主对话
- Token 预估：加载时只解析 frontmatter 估算 token 成本，按需加载完整内容

---

### 6. 多 Agent 协调

Claude Code 有三种多 Agent 模式：

#### 6a. Coordinator Mode（协调器模式）

```
主 Agent（Coordinator）
  ├─ 只能用 Agent、TaskStop、SendMessage 工具
  ├─ 负责规划和分配工作
  └─ 聚合 Worker 结果

Worker Agents（异步工作线程）
  ├─ 用实际编码工具（Bash、Read、Edit）
  ├─ 通过 AgentTool 生成
  └─ 独立 token 预算
```

环境变量 `CLAUDE_CODE_COORDINATOR_MODE=1` 启用。

#### 6b. InProcessTeammateTask（同进程团队）

不 fork 进程，在主 Agent 内直接运行多个 teammate：
- 邮箱系统（`teammateMailbox.ts`）实现 agent 间消息通信
- 每个 teammate 有独立的 `permissionMode`
- UI 消息上限 50 条（防内存膨胀）
- 支持 `awaitingPlanApproval`（计划模式）

#### 6c. TeamCreate/TeamDelete

动态创建和销毁 agent 团队：
```typescript
TeamCreateTool → 创建多个 Worker agent
TeamDeleteTool → 销毁指定 agent
SendMessageTool → 向 agent 发送消息
```

#### Cherry Agent 简化版方案

利用现有多 session 能力：
- 一个 "Coordinator session" 指挥多个 "Worker sessions"
- 通过 IPC 实现 session 间通信
- Worker session 完成后把结果发回 Coordinator

---

### 7. 流式工具并发执行

Claude Code 的 `StreamingToolExecutor` 不是串行执行工具：

```
AI 回复包含多个 tool_use 块
  ↓
StreamingToolExecutor 分析每个工具
  ↓
并发安全工具（Read、Glob、Grep）→ 并行执行
非并发安全工具（Bash、Write、Edit）→ 独占执行
  ↓
Bash 执行失败 → 立即中止兄弟进程（siblingAbortController）
```

#### 并发规则

| 工具 | `isConcurrencySafe` | 说明 |
|------|---------------------|------|
| Read | true | 只读，安全并行 |
| Glob | true | 只读，安全并行 |
| Grep | true | 只读，安全并行 |
| Bash | false（部分 true） | 只读命令可并行 |
| Write | false | 写操作，独占 |
| Edit | false | 写操作，独占 |

Cherry Agent 当前工具执行交给 SDK，但如果未来自定义工具，这套并发模型可以直接用。

---

### 8. Hook 生命周期系统

Claude Code 有完整的 hook 系统（`src/hooks/`，87 个文件）：

#### Hook 类型

| Hook | 触发时机 | 用途 |
|------|---------|------|
| `SessionStart` | 会话开始 | 初始化 |
| `Setup` | 设置阶段 | 权限、环境检查 |
| `PreToolUse` | 工具执行前 | 验证/修改参数 |
| `PostToolUse` | 工具执行后 | 副作用（自动格式化、日志） |
| `PostToolUseFailure` | 工具失败 | 错误处理 |
| `Stop` | 模型停止 | 记忆提取、验证 |
| `SessionEnd` | 会话结束 | 清理 |
| `PreCompact` / `PostCompact` | 压缩前后 | 压缩相关处理 |
| `CwdChanged` / `FileChanged` | 文件系统变化 | 监控 |

#### Hook 输出格式

```typescript
type HookJSONOutput = {
  decision?: 'allow' | 'block' | 'skip'  // 允许/阻止/跳过
  message?: string                        // 用户提示
  blockingError?: string                   // 阻止错误
  additionalContexts?: string[]            // 注入额外上下文
  updatedInput?: unknown                   // 修改工具输入
}
```

#### Cherry Agent 应用

SDK 已支持 hook，但应用层没有充分利用。可以增加：
- **PostToolUse**：文件修改后自动格式化
- **Stop**：会话结束时自动提取记忆
- **PreToolUse**：敏感操作前记录审计日志

---

## 四、P2 — 长期方向参考

### 9. IDE Bridge 架构

`src/bridge/`（30+ 文件）实现了与 VS Code / JetBrains 的双向通信：

```
IDE Extension ←→ Bridge (WebSocket/SSE) ←→ Claude Code CLI
                    ↕
              Authentication (JWT)
              Permission callbacks
              Session management
              MCP config injection
```

核心文件：
- `bridgeMain.ts`（3,651 行）：桥接主循环
- `replBridge.ts`（3,146 行）：REPL 会话桥接
- `jwtUtils.ts`：JWT 认证

部署模式：
- `single-session`：一个会话/cwd，Bridge 随之关闭
- `worktree`：持久服务器，每个会话隔离 git worktree
- `same-dir`：持久服务器，共享 cwd

如果 Cherry Agent 要做 VS Code 插件，这套架构是完美参考。

---

### 10. Feature Flag 系统

```typescript
// 编译时死代码消除（Bun 特有）
import { feature } from 'bun:bundle'

const SleepTool = feature('PROACTIVE')
  ? require('./tools/SleepTool/SleepTool.js').SleepTool
  : null  // 编译后完全移除

// 运行时 Feature Flag（GrowthBook）
const isEnabled = getFeatureValue_CACHED_MAY_BE_STALE('tengu_bramble_lintel', false)
```

已知的 Feature Flags：
- `PROACTIVE` — 主动模式
- `KAIROS` — 助手模式
- `COORDINATOR_MODE` — 多 agent 协调
- `VOICE_MODE` — 语音输入
- `BRIDGE_MODE` — IDE 桥接
- `AGENT_TRIGGERS` — 定时任务
- `HISTORY_SNIP` — 历史消息裁剪
- `REACTIVE_COMPACT` — 响应式压缩
- `WEB_BROWSER_TOOL` — 浏览器工具
- `TERMINAL_PANEL` — 终端面板

Cherry Agent 可用简单的 config-based flag 起步，无需 GrowthBook。

---

### 11. 自动权限分类器

Claude Code 的 `auto` 权限模式使用分类器自动判断：

```
工具调用 → 自动分类器评估安全性
  ├─ Bash 分类器：解析命令，按风险分级
  ├─ Transcript 分类器：分析完整上下文
  └─ Yolo 分类器：简化操作模式

结果：
  ├─ 低风险（ls、cat、grep）→ 自动批准
  ├─ 中风险（文件编辑）→ 按规则判断
  └─ 高风险（rm、sudo）→ 必须用户确认
```

否认追踪（DenialTrackingState）：
- 跟踪否认次数和成功次数
- 50% 成功率 + 10 次操作 → 回退到提示
- 防止过度自信的自动分类

Cherry Agent 的 `permissionMode` 目前是三档静态开关，可以借鉴做更智能的分类。

---

### 12. Companion Sprite（Buddy）

`src/buddy/`（512KB+ React 组件）：
- 帧动画系统：`IDLE_SEQUENCE: [0,0,0,0,1,0,0,0,-1,0,0,2,0,0,0]`
- 闲置序列、互动反应
- 语音泡泡：动态换行、渐隐效果

Cherry Agent 的图形 UI 做类似的吉祥物/助手动画会比 CLI 更有效果，可以增强产品辨识度。

---

### 13. 远程会话系统

`src/remote/`（WebSocket 会话）：

```typescript
// 会话订阅协议
1. 连接：wss://api.anthropic.com/v1/sessions/ws/{sessionId}/subscribe
2. 认证：{ type: 'auth', credential: { type: 'oauth', token: '...' } }
3. 消息流：SDKMessage | SDKControlRequest | SDKControlResponse
```

特点：
- 自动重连（最多 5 次，2s 延迟）
- Ping/Pong 保活（30s 间隔）
- 支持 Remote Task Types：remote-agent / ultraplan / ultrareview / autofix-pr / background-pr

---

### 14. 快捷键系统

`src/keybindings/`（15 个文件）：
- **和弦支持**：`pendingChord: ParsedKeystroke[]`（类似 VS Code 的 Ctrl+K, Ctrl+C）
- **上下文敏感**：不同状态下同一快捷键执行不同操作
- **处理器注册**：`Map<string, Set<HandlerRegistration>>`

Cherry Agent 可以增强键盘体验，特别是对开发者用户。

---

### 15. Dream Task（投机执行）

`tasks/DreamTask/DreamTask.ts` 不只是记忆整合：
- 后台预测用户可能的下一步操作
- 预热模型缓存
- 阶段：`starting` → `updating`（Edit/Write 工具出现时转换）

---

## 五、Claude Code 2-3 月新功能（产品层面）

> 来源：Claude Code 官方更新日志，2026 年 2-3 月（3 月共 17 个版本，平均 1.76 天一更）

### 功能总览

| 功能 | 日期 | 说明 | Cherry Agent 借鉴 |
|------|------|------|-------------------|
| **Agent Teams（代理团队）** | 2月6日 | 多 Claude Code 会话协作，团队领导 + 队友各自独立上下文窗口和 Git worktree，可直接互通消息 | **P1** — 对应 Coordinator Mode，可用多 session 实现 |
| **Remote Control（远程控制）** | 2月25日 | 终端启动任务后，通过手机/浏览器继续控制，Claude 本地运行不上传云端，Max 用户研究预览 | **P2** — Cherry Agent 已有云同步，可扩展为远程控制 |
| **Voice Mode（语音模式）** | 3月初 | `/voice` 开启，按住空格说话，实时转录，支持 20 种语言，语音+打字混合输入 | **P1** — Electron 可直接调用 Web Speech API |
| **Computer Use（计算机使用）** | 3月23日 | Claude 可操控屏幕 — 打开文件、点击、导航，目前仅 macOS，研究预览 | **P2** — 需要屏幕截图+鼠标控制能力 |
| **Auto Mode（自动模式）** | 3月24日 | 新权限模式，独立分类器审查每次工具调用（范围升级/不受信任基础设施/提示注入），无需逐个确认 | **P1** — 增强 permissionMode 为智能分类 |
| **Channels（频道）** | 3月20日 | 通过 Telegram/Discord/iMessage 直接向运行中的 Claude Code 发消息，权限审批可转发到手机 | **P2** — 可通过 webhook 实现消息通道 |
| **/loop 定时任务** | 3月 | 将 Claude Code 变成定期监控系统，支持 cron 表达式，最多 50 个并行任务 | **P1** — 对应 CronCreateTool，定时执行 |
| **MCP Elicitation** | 3月14日 | MCP 服务器可在任务执行中请求结构化输入，从"发射后不管"变成对话式协议 | **P2** — MCP 协议扩展 |
| **命名子代理** | 3月 | 子代理可出现在 @ 提及及自动补全中 | **P1** — Agent 团队可视化管理 |
| **--bare 标志** | 3月 | 脚本化调用跳过 hooks/LSP/插件/skill 遍历 | **P2** — 轻量模式 |
| **无闪烁渲染** | 3月 | `CLAUDE_CODE_NO_FLICKER=1` 启用 alt-screen 渲染 | N/A — Cherry Agent 是 GUI 不需要 |
| **插件市场** | 3月 | 官方市场 834+ 插件，启动时自动可用 | **P1** — Cherry Agent 已有 skill 市场基础 |
| **Effort/Ultrathink** | 2-3月 | `/effort` 命令设置思考深度，"ultrathink" 触发 31,999 token 完整思考预算 | **P0** — 可直接暴露为用户设置 |

### 按优先级对 Cherry Agent 的价值分析

#### P0 — 可立即实现

**Effort/Ultrathink（思考深度控制）**

Claude Code 的 `/effort` 命令让用户控制 AI 的思考深度：
- `low` — 快速回复，最少思考
- `medium` — 平衡模式（默认）
- `high` — 深度思考
- `ultrathink` — 触发 31,999 token 的完整思考预算（extended thinking 最大值）

Cherry Agent 移植方案：
- SDK 已支持 `thinkingEffort` 参数
- 在 PromptInput 的高级设置面板中新增"思考深度"滑块
- 映射到 runner.ts 的 SDK 调用参数

#### P1 — 高价值需求

**Voice Mode（语音模式）**

Cherry Agent 作为 Electron 桌面端，可以利用：
- Web Speech API（`SpeechRecognition`）做实时语音转文字
- 或集成 Whisper API 做更精准的转录
- 按住快捷键说话 → 实时转录到输入框 → 松开发送

实现成本低，用户体验提升大。

**Auto Mode（智能权限分类）**

当前 Cherry Agent 的 permissionMode 是三档静态开关（bypassPermissions / acceptEdits / default）。

Claude Code 的 Auto Mode 用独立分类器判断每次工具调用的风险：
- 检测范围升级（tool 试图访问授权范围外的资源）
- 检测不受信任基础设施（写入公共路径、调用外部 API）
- 检测提示注入（tool 输入中的恶意 prompt）

Cherry Agent 可以实现简化版：按工具类型 + 命令模式自动分类。

**/loop 定时任务**

将 AI 助手变成后台监控系统：
```
/loop 5m "检查 API 健康状态并报告异常"
/loop "0 9 * * *" "生成今日代码审查报告"
```

Cherry Agent 可以用 `setInterval` + session 调度实现，最多支持 N 个并行定时任务。

**Agent Teams（代理团队）**

源码中对应 `TeamCreateTool` + `InProcessTeammateTask`。产品层面：
- 一个"团队领导"分配任务给多个"队友"
- 每个队友有独立 Git worktree（防止代码冲突）
- 队友之间可以互发消息

Cherry Agent 可用多 session + IPC 通信模拟。

**插件市场**

Claude Code 已有 834+ 插件的官方市场。Cherry Agent 的 skill 市场是类似方向，可以参考其插件发现/安装/启用的 UX 流程。

#### P2 — 长期方向

**Remote Control（远程控制）**

终端启动长任务后，通过手机 Web 界面继续监控和操控。Cherry Agent 已有云同步基础，可以扩展为：
- 启动任务后生成分享链接
- 手机浏览器打开后实时查看进度
- 支持远程批准权限请求

**Channels（多渠道通知）**

通过 Telegram/Discord/iMessage 发消息给正在运行的 Cherry Agent：
- 权限审批推送到手机
- 远程发送追加指令
- 任务完成通知

可通过 webhook + 消息队列实现。

**Computer Use（计算机使用）**

Claude 操控桌面屏幕（截图 → 分析 → 模拟点击/键入）。需要：
- 屏幕截图能力（Electron `desktopCapturer`）
- 鼠标/键盘模拟（`robotjs` 或 `nut.js`）
- 目前仅 macOS 可用，研究预览阶段

---

## 六、Cherry Agent 的独特优势

以下是 Cherry Agent 有而 Claude Code **没有**的：

| 特性 | Cherry Agent | Claude Code |
|------|-------------|-------------|
| **图形化 UI** | React 18 + Tailwind + Anthropic 设计系统 | 终端 Ink |
| **生成式 Widget** | show-widget → ECharts/SVG/HTML iframe 渲染 | 无 |
| **双栈 AI** | Claude + Codex 运行时切换 | 仅 Claude |
| **计费系统** | 完整的积分/充值/订阅/分销系统 | 依赖 Anthropic 账号 |
| **云同步** | 会话/设置跨设备同步 | 无 |
| **文件浏览器** | 侧边栏文件树 + 搜索 | 无（CLI 用 ls/find） |
| **事件分层处理** | 高优先级(0ms) + 低优先级(50ms 批) | 无（CLI 不需要） |
| **消息写缓冲** | 100ms/20 条 SQLite 批量写 | 无（JSONL 追加） |
| **GPU 崩溃自愈** | 3 次稳定运行后恢复 | N/A |
| **新用户引导** | driver.js 6 步导览 | 无 |
| **Thinking 可视化** | 实时流式展示 AI 思考过程 | 终端文本 |
| **工具执行追踪** | useToolExecutionStore + 实时状态 | 简单文本输出 |

这些是 Cherry Agent 的产品差异化优势，应该继续深化。

---

## 七、推荐实施路线图

### 第 1 周：Memory System v1 + Effort 控制
```
- 参考 memdir.ts + extractMemories.ts
- runner.ts onComplete → Haiku 提取记忆
- ~/.cherry-agent/memory/ 持久化
- 下次对话自动注入 memoryContext
- 记忆文件格式：frontmatter（name/description/type）+ 内容
- 新增"思考深度"设置（映射 SDK thinkingEffort 参数）
```

### 第 2-3 周：Context Optimization
```
- 参考 microCompact.ts
- 工具结果截断/摘要（应用层，>30KB 自动截断）
- 长对话历史 summarize（用 Haiku）
- 优化 historyContext 注入
```

### 第 4-5 周：Skill System Enhancement + Voice Mode
```
- 参考 loadSkillsDir.ts frontmatter
- 新增 model / allowed-tools / context 字段
- Skill 执行环境隔离（fork 模式）
- Token 预估：frontmatter-only 加载
- Voice Mode：Web Speech API 语音输入 → 实时转录 → 发送
```

### 第 6-8 周：Auto Dream + Session Memory + Auto Mode
```
- 参考 autoDream.ts 调度逻辑
- 24h + N 次会话双门控
- 后台 Haiku 整理记忆
- Session Memory：对话中每 10 轮更新摘要
- Auto Mode：按工具类型+命令模式自动分类权限
```

### 第 9-12 周：Agent Teams + /loop 定时任务
```
- 参考 coordinatorMode.ts + TeamCreateTool
- 主 session → 多 worker session
- IPC 实现 session 间通信
- InProcessTeammate 邮箱模式
- /loop 定时任务：setInterval + cron 表达式 + session 调度
```

### 长期：Remote Control + Channels + Computer Use
```
- Remote Control：生成分享链接，手机浏览器远程监控
- Channels：webhook → Telegram/Discord 消息推送
- Computer Use：屏幕截图 + 鼠标模拟（robotjs/nut.js）
```

---

## 八、关键源码文件索引

所有文件位于 `/Users/sunyunfeng/Desktop/project/claude-code/instructkr-claude-code/src/`

### Agent 循环核心

| 文件 | 行数 | 说明 |
|------|------|------|
| `QueryEngine.ts` | 1,295 | LLM 查询引擎核心，管理 tool-call loop |
| `query.ts` | 2,310 | 主查询循环，7 个 continue 点 |
| `Tool.ts` | 792 | 工具基类和 buildTool 模式 |
| `tools.ts` | 390 | 三层工具池化 |
| `context.ts` | 189 | 系统/用户上下文收集 |
| `commands.ts` | 754 | 命令注册和加载 |

### 记忆系统

| 文件 | 说明 |
|------|------|
| `memdir/memdir.ts` | MEMORY.md 索引 + 截断保护 |
| `memdir/memoryTypes.ts` | 4 种记忆类型定义 |
| `memdir/memoryScan.ts` | 扫描现有记忆文件 |
| `memdir/findRelevantMemories.ts` | 相关记忆检索 |
| `services/extractMemories/extractMemories.ts` | forked agent 自动提取 |
| `services/extractMemories/prompts.ts` | 提取 prompt 模板 |
| `services/autoDream/autoDream.ts` | 定期记忆整合调度 |
| `services/autoDream/consolidationPrompt.ts` | 整合 prompt 模板 |
| `services/autoDream/consolidationLock.ts` | 并发锁 |
| `services/SessionMemory/sessionMemory.ts` | 对话中实时记忆 |

### 上下文压缩

| 文件 | 说明 |
|------|------|
| `services/compact/compact.ts` | 完整压缩流程 |
| `services/compact/autoCompact.ts` | 自动触发逻辑 + 断路器 |
| `services/compact/microCompact.ts` | 轻量工具结果压缩 |
| `services/compact/grouping.ts` | 消息分组逻辑 |
| `services/compact/prompt.ts` | 压缩 prompt 模板 |
| `services/compact/postCompactCleanup.ts` | 压缩后清理 |
| `services/compact/sessionMemoryCompact.ts` | 会话记忆压缩 |

### 工具实现

| 文件 | 说明 |
|------|------|
| `tools/BashTool/BashTool.tsx` | Shell 执行 + 权限匹配 |
| `tools/AgentTool/AgentTool.tsx` | 子 agent 生成 |
| `tools/AgentTool/forkSubagent.ts` | fork 执行规则 |
| `tools/AgentTool/loadAgentsDir.ts` | agent 定义加载 |
| `tools/SkillTool/SkillTool.tsx` | skill 执行 |
| `tools/ToolSearchTool/` | 延迟工具发现 |
| `tools/TeamCreateTool/` | 团队管理 |
| `tools/SendMessageTool/` | agent 间消息 |

### 多 Agent 协调

| 文件 | 说明 |
|------|------|
| `coordinator/coordinatorMode.ts` | 协调器模式 |
| `tasks/LocalAgentTask/` | 本地子 agent 任务 |
| `tasks/InProcessTeammateTask/` | 同进程团队 |
| `tasks/RemoteAgentTask/` | 远程 agent 任务 |
| `tasks/DreamTask/DreamTask.ts` | 投机执行 |
| `tasks/LocalShellTask/` | 本地 Bash 任务 |
| `utils/forkedAgent.ts` | fork agent 基础设施 |

### Skill/Plugin 系统

| 文件 | 说明 |
|------|------|
| `skills/loadSkillsDir.ts` | skill 文件加载 + frontmatter 解析 |
| `skills/bundledSkills.ts` | 内置 skill 注册 |
| `skills/mcpSkillBuilders.ts` | MCP skill 构建 |
| `plugins/bundled/` | 内置插件 |

### IDE Bridge

| 文件 | 行数 | 说明 |
|------|------|------|
| `bridge/bridgeMain.ts` | 3,651 | 桥接主循环 |
| `bridge/replBridge.ts` | 3,146 | REPL 会话桥接 |
| `bridge/sessionRunner.ts` | — | 会话执行管理 |
| `bridge/jwtUtils.ts` | — | JWT 认证 |
| `bridge/bridgeMessaging.ts` | — | 消息协议 |

### 权限系统

| 文件 | 说明 |
|------|------|
| `hooks/useCanUseTool.tsx` | 权限检查主逻辑（40KB） |
| `hooks/toolPermission/PermissionContext.ts` | 权限上下文 |
| `utils/permissions/permissions.ts` | 规则匹配 |
| `utils/permissions/denialTracking.ts` | 否认追踪 |

### 服务层

| 文件 | 说明 |
|------|------|
| `services/api/claude.ts` | Anthropic API 封装 |
| `services/api/withRetry.ts` | 重试机制（三重防线） |
| `services/mcp/client.ts` | MCP 客户端（2,596 行） |
| `services/analytics/growthbook.ts` | Feature Flags |
| `services/tokenEstimation.ts` | Token 估算 |

### 状态与 UI

| 文件 | 说明 |
|------|------|
| `state/AppState.tsx` | 应用状态定义 |
| `state/store.ts` | 自定义 Store 实现 |
| `buddy/CompanionSprite.tsx` | 动画精灵 |
| `remote/SessionsWebSocket.ts` | 远程会话 |
| `keybindings/KeybindingContext.tsx` | 快捷键系统 |
