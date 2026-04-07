# Cherry Agent 上下文优化计划

> 基于 Claude Code 源码调研（`docs/claude-code-insights.md`），结合 Cherry Agent SDK 约束制定
> 创建日期：2026-04-02

---

## 背景

Cherry Agent 每次首条对话携带 ~12,000–20,000 tokens 上下文，其中用户实际输入可能仅几十 tokens。
根本原因是应用层无条件全量注入（Widget 指南、Skill 摘要）+ SDK 黑箱全量注入（system prompt、17 个工具 schema）。

本计划从 Claude Code 源码中提炼 12 项可落地优化，按实施难度和收益分为三个阶段。

---

## 阶段一：立即可做（第 1-2 周）

### 1. Widget 指南条件注入

- **问题**：`core.ts:705` 将 ~3,800 tokens 的 Widget 渲染指南无条件拼入每条消息的 `customSystemPrompt`，即使用户只是简单聊天
- **参考**：Claude Code 按需加载——工具/能力描述不全量注入，需要时才拉取
- **方案**：
  - 新增 `session.widgetEnabled` 开关（默认 true，用户可在设置中关闭）
  - Haiku 模型自动跳过（无法生成 widget）
  - 仅在 `widgetEnabled && model >= sonnet` 时注入 `widgetCapability`
- **改动文件**：`src/electron/ipc/core.ts` — `getContextInjection()` 内 `combinedPrompt` 拼接逻辑
- **收益**：简单对话场景每条消息省 ~3,800 tokens（按 $3/M input，100 条省 $1.14）
- **难度**：低（改 1 处条件判断）

### 2. MicroCompact — 工具结果截断

- **问题**：Read/Grep/WebSearch 等工具可能返回 50KB+ 结果，全量存入 SQLite history，下次恢复时全量注入
- **参考**：Claude Code `microCompact.ts` — 合并/截断同一条消息中的多个工具结果（零成本，无需 API 调用）
- **方案**：
  - 在 `runner.ts` 的 `for await (const message of q)` 循环中，拦截工具返回事件
  - 工具结果 > 30KB → 保留头 5KB + 尾 2KB + 中间 `[...truncated N chars...]`
  - 截断后再写入 `messages` 表
  - 白名单工具（Read/Grep/Bash/WebSearch/WebFetch）适用，Edit/Write 不截断
- **改动文件**：`src/electron/libs/runner.ts` — 新增 `truncateToolResult()` 函数
- **收益**：长对话场景 token 节约 30~50%
- **难度**：低

### 3. Effort/Ultrathink 暴露给用户

- **问题**：`runner.ts:898-908` 已有 `thinkingTokensMap`（off/low/medium/high），但前端没有直观控制
- **参考**：Claude Code `/effort` 命令 — 用户控制思考深度（low → medium → high → ultrathink）
- **方案**：
  - PromptInput 高级设置面板新增"思考深度"下拉选择
  - 选项：关闭（0）/ 快速（2K）/ 平衡（10K，默认）/ 深度（32K）
  - 映射到 `thinkingEffort` 参数
  - 持久化到 session 设置
- **改动文件**：
  - `src/ui/components/PromptInput.tsx` — UI 控件
  - `src/electron/ipc/core.ts` — 传递 thinkingEffort
- **收益**：简单问答用 `low` 可省 ~80% thinking output tokens（$15/M）
- **难度**：低

### 4. Skill 加载策略优化

- **问题**：`auto` mode 下无条件注入最多 30 个 skill 摘要（~2,000 tokens），大部分对话用不到
- **参考**：Claude Code Skill 系统 — frontmatter-only 加载 + Token 预估 + 按需拉取全文
- **方案**：
  - 方案 A：默认 `skillMode` 从 `auto` 改为 `manual`（用户主动选 skill）
  - 方案 B（推荐）：分级注入——常用 Top 5 保留完整摘要，其余只注入名称（省 ~60% skill tokens）
  - 在 `skill-store.ts:getSkillContextSummary()` 中加入 `usageCount` 排序逻辑
- **改动文件**：`src/electron/libs/skill-store.ts`
- **收益**：每条消息省 ~800–1,500 tokens
- **难度**：低–中

---

## 阶段二：中期优化（第 3-5 周）

### 5. 记忆系统 v1 — 对话结束后自动提取

- **问题**：Cherry Agent 仅有用户手动输入的全局记忆，无法自动学习用户偏好
- **参考**：Claude Code `extractMemories.ts` — Layer 2 Auto Extract，对话结束后 forked agent 分析对话并写入记忆
- **方案**：
  - 对话结束（`session.status = completed`）时触发，但需通过**三重门控**：
    1. **轮数门控**：对话轮数 >= 3（太短的对话没有可提取内容）
    2. **时间门控**：距上次提取 > 1 小时（防止频繁调用）
    3. **内容门控**：对话含实质性内容（纯闲聊/单轮问答跳过，可用消息总字符数 > 500 作简易判断）
  - 三重门控全部通过后，直接调 Haiku API（不走 SDK）分析本次对话
  - **互斥控制**：如果用户在对话中已手动写入记忆，跳过自动提取（避免冲突）
  - **增量处理**：cursor-based，仅处理上次提取后的新消息（避免重复提取）
  - **去重**：提取前先读已有记忆，避免写入语义重复的内容
  - 提取 4 类记忆：user（角色偏好）/ feedback（工作方式）/ project（进行中工作）/ reference（外部资源）
  - 写入 `~/.cherry-agent/memory/` 目录（frontmatter 格式）
  - `MEMORY.md` 做索引（200 行上限）
  - 下次 `getContextInjection()` 时自动读取并注入 `memoryContext`
- **改动文件**：
  - 新增 `src/electron/libs/memory-extractor.ts` — 提取逻辑
  - 修改 `src/electron/libs/simple-memory-store.ts` — 支持文件系统记忆
  - 修改 `src/electron/ipc/core.ts` — 注入记忆
  - 修改 `src/electron/libs/runner.ts` — onComplete 触发提取
- **收益**：用户不需要重复说明偏好，AI "记住"上下文
- **难度**：中

### 6. 长对话历史摘要（AutoCompact 简化版）

- **问题**：长对话恢复时 `historyContext` 全量注入所有历史消息，可能达数万 tokens
- **参考**：Claude Code `autoCompact.ts` — Layer 4，context 占用 ~80% 时用侧链 agent 总结历史
- **方案**：
  - 对话消息 > 20 轮时触发摘要
  - 用 Haiku 对前 N-5 轮做 summary（~500 tokens）
  - 保留最近 5 轮原文
  - `historyContext` = summary + 近 5 轮原文
  - 摘要缓存到 SQLite（`session_summaries` 表），避免重复计算
  - 断路器：连续摘要失败 3 次后停止（防无限重试）
- **改动文件**：
  - 新增 `src/electron/libs/history-compactor.ts` — 摘要逻辑
  - 修改 `src/electron/ipc/core.ts` — `getFormattedHistory()` 加阈值判断
- **收益**：长对话恢复时 token 减少 50~70%
- **难度**：中

### 7. Hook 生命周期增强

- **问题**：`runner.ts:1319-1359` 已注册基础 hook（日志记录），但未充分利用 SDK 的 hook 能力
- **参考**：Claude Code `src/hooks/`（87 个文件）— Stop hook 触发记忆提取、PostToolUse 自动格式化
- **方案**：
  - `Stop` hook → 触发记忆提取（对接 #5）
  - `PostToolUse(Write/Edit)` → 统计文件变更，记录到 session 摘要
  - `PostToolUseFailure` → 工具连续失败 2 次触发自动诊断建议
  - `PreToolUse(Bash)` → 敏感命令（rm -rf、drop table）记录审计日志
- **改动文件**：`src/electron/libs/runner.ts` — hooks 配置区域
- **收益**：自动化运维 + 安全审计
- **难度**：低–中

### 8. 多 Session 协调（Agent Teams 简化版）

- **问题**：每个 session 独立工作，无法并行处理复杂任务
- **参考**：Claude Code `coordinatorMode.ts` + `TeamCreateTool` + `InProcessTeammateTask` — Coordinator 分配任务，Worker 独立执行
- **方案**：
  - 主 session（Coordinator）拆分任务 → 创建 N 个 worker session
  - 利用现有 IPC 事件机制实现 session 间通信
  - Worker session 完成后结果汇聚到主 session
  - UI 侧边栏显示 worker 状态和进度
  - 上限：最多 5 个并行 worker
- **改动文件**：
  - 新增 `src/electron/libs/session-coordinator.ts` — 协调逻辑
  - 修改 `src/electron/ipc/core.ts` — 新增 IPC handler
  - 修改 `src/ui/components/Sidebar.tsx` — worker 状态展示
- **收益**：复杂任务处理速度提升 2-3x
- **难度**：高

---

## 阶段三：长期方向（第 6-12 周）

### 9. 工具延迟注册（ToolSearch 模式）

- **问题**：SDK 将 17 个工具的完整 JSON Schema（~5,000 tokens）每次全量注入，无法延迟加载
- **参考**：Claude Code `ToolSearchTool` — system prompt 只列工具名称，AI 需要时才调 ToolSearch 拉取 schema
- **约束**：**需要脱离 SDK 黑箱**，自己控制工具定义注入
- **方案**：
  - 短期：无法优化（SDK 控制）
  - 长期：自建 Agent 循环，直接调 Anthropic API，自己管理 tool 注册
  - 或等待 SDK 支持 deferred tool registration
- **收益**：每条消息省 ~3,000-5,000 tokens
- **难度**：极高（架构级重构）

### 10. Forked Agent + Prompt Cache 共享

- **问题**：记忆提取、摘要生成等辅助任务需要单独 API 调用，无法复用主对话的 prompt cache
- **参考**：Claude Code `forkedAgent.ts` — 子 agent 的请求前缀与父 agent 完全相同，cache 命中率极高
- **约束**：SDK 管理 API 调用，无法控制 cache key 前缀
- **方案**：
  - 中期（变通）：辅助任务用 Haiku 直接调 API（成本低，不需要 cache）
  - 长期：自建 Agent 循环后，实现 CacheSafeParams 模式
- **收益**：辅助任务成本降低 80%+
- **难度**：高

### 11. 自动权限分类器

- **问题**：`permissionMode` 是三档静态开关（bypassPermissions / acceptEdits / default），粒度太粗
- **参考**：Claude Code `auto` 模式 — 独立分类器评估每次工具调用的安全性（范围升级/不信任基础设施/提示注入）
- **方案**：
  - 在 `canUseTool` 回调（`runner.ts:1010`）中增加智能分类
  - 按工具类型 + 命令模式分级：
    - 只读（Read/Glob/Grep）→ 自动批准
    - 文件写入（Write/Edit）→ 按路径判断（项目内自动批准，项目外需确认）
    - 破坏性 Bash（rm/drop/kill）→ 必须确认
  - 否认追踪：成功率 < 50% + 操作 > 10 次 → 回退到全确认
- **改动文件**：`src/electron/libs/runner.ts` — `canUseTool` 回调增强
- **收益**：用户体验提升，减少不必要的确认弹窗
- **难度**：中–高

### 12. 流式工具并发执行

- **问题**：SDK 内部工具执行策略不可控（串行/并行由 SDK 决定）
- **参考**：Claude Code `StreamingToolExecutor` — 只读工具并行执行，写操作独占，失败立即中止兄弟进程
- **约束**：**完全受限于 SDK**，当前无法干预
- **方案**：
  - 等待 SDK 暴露并发控制参数
  - 或长期自建 Agent 循环后自己实现
- **收益**：多工具调用场景速度提升 2-3x
- **难度**：极高（依赖 SDK 演进或架构重构）

---

## 优先级总览

| # | 功能 | 阶段 | 难度 | Token 节约 | 用户体验 | 依赖 SDK 脱离 |
|---|------|------|------|-----------|---------|-------------|
| 1 | Widget 条件注入 | 立即 | 低 | ~3,800/msg | - | 否 |
| 2 | MicroCompact 截断 | 立即 | 低 | 30~50% | - | 否 |
| 3 | Effort 控制 UI | 立即 | 低 | 可变 | 高 | 否 |
| 4 | Skill 分级注入 | 立即 | 低–中 | ~1,000/msg | - | 否 |
| 5 | 记忆系统 v1 | 中期 | 中 | - | 极高 | 否 |
| 6 | 历史摘要 | 中期 | 中 | 50~70% | 高 | 否 |
| 7 | Hook 增强 | 中期 | 低–中 | - | 中 | 否 |
| 8 | 多 Session 协调 | 中期 | 高 | - | 极高 | 否 |
| 9 | 工具延迟注册 | 长期 | 极高 | ~5,000/msg | - | **是** |
| 10 | Forked Agent Cache | 长期 | 高 | 辅助成本-80% | - | **是** |
| 11 | 智能权限分类 | 长期 | 中–高 | - | 高 | 部分 |
| 12 | 工具并发执行 | 长期 | 极高 | - | 高 | **是** |

---

## 关键度量

优化前（首条消息）：
- 应用层注入：~4,200–8,200 tokens
- SDK 黑箱注入：~8,000–12,000 tokens
- **合计：~12,000–20,000 tokens**

优化后（阶段一完成，首条简单对话）：
- 应用层注入：~500（身份+交互+CWD）+ 0（Widget 跳过）+ 0（Skill manual 空）= ~500 tokens
- SDK 黑箱注入：~8,000–12,000 tokens（不可控）
- **合计：~8,500–12,500 tokens**
- **应用层节约：~85%**

---

## 相关文件索引

| 文件 | 与本计划的关系 |
|------|-------------|
| `src/electron/ipc/core.ts` | #1 #4 #5 #6 — 上下文注入入口 |
| `src/electron/libs/runner.ts` | #2 #3 #7 #11 — SDK 调用层 |
| `src/electron/libs/skill-store.ts` | #4 — Skill 加载策略 |
| `src/electron/libs/simple-memory-store.ts` | #5 — 记忆存储 |
| `src/ui/components/PromptInput.tsx` | #3 — Effort UI |
| `docs/claude-code-insights.md` | 本计划的调研来源 |
