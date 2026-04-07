# Cherry Agent 双栈 SDK 全量评估（Codex + Claude）

更新时间：2026-02-26
评估范围：`/Users/sunyunfeng/Desktop/project/chuangye/id7`

## 1. 结论摘要

- 结论：**可以同时支持 `@openai/codex-sdk` 与 `@anthropic-ai/claude-agent-sdk`**。
- 但当前状态不是“平滑适配”，而是“**中高改造量的双栈重构**”。
- 主要原因：Claude SDK 不是单点依赖，而是已扩散到运行时协议、权限流、消息渲染、会话存储、构建发布和测试链路。

建议按两阶段推进：

1. Phase A（解耦）：先抽象 Runner 与统一消息模型，Claude 行为不变。
2. Phase B（接入）：再落地 Codex Runner、技能目录同步、权限策略映射与回归测试。

---

## 2. 量化结果（本次扫描）

- 直接引用 `@anthropic-ai/claude-agent-sdk`：**17 个文件**
- `claudeSessionId / claude_session_id` 相关耦合：**16 个文件**
- 权限模式/审批事件/`AskUserQuestion` 相关：**21 个文件**
- UI 文案与品牌中 `Claude/Anthropic` 文本：**46 个文件**
- 测试中 Anthropic/Claude 相关依赖：**16 个文件**

说明：以上为静态扫描结果，未包含运行时动态行为差异带来的隐藏工作量。

---

## 3. 高耦合区域（必须改）

## 3.1 运行时主链路（P0）

当前主链路直接绑定 Claude SDK 的 `query()`、插件参数、工具审批回调：

- `src/electron/libs/runner.ts:1`
- `src/electron/libs/runner.ts:517`
- `src/electron/libs/runner.ts:526`
- `src/electron/libs/runner.ts:530`
- `src/electron/ipc-handlers.ts:314`
- `src/electron/ipc-handlers.ts:387`

影响：

- 无法在不改主链路的前提下直接切入 Codex SDK。
- 现有“细粒度工具审批 + AskUserQuestion”的实现位于该链路核心。

## 3.2 消息协议与前端渲染（P0）

UI 当前使用 Claude SDK 消息类型做渲染和类型推导：

- `src/ui/types.ts:1`
- `src/electron/types.ts:1`
- `src/ui/components/chat/MessageAdapter.tsx:15`
- `src/ui/components/EventCard.tsx:4`
- `src/ui/store/session-event-handlers.ts:17`

影响：

- Codex 事件模型不能直接复用现有渲染代码。
- 需要先定义本地统一消息协议（AgentMessage），再做双向适配。

## 3.3 权限与交互审批（P0）

当前权限系统依赖 Claude SDK 的 `canUseTool` 回调语义：

- `src/electron/libs/runner.ts:530`
- `src/ui/components/DecisionPanel.tsx:1`
- `src/ui/components/chat/UserQuestionDialog.tsx:1`
- `src/ui/components/chat/PermissionDialog.tsx:1`

影响：

- Codex 侧主要是策略级审批（approval policy），不是同构的逐工具拦截模型。
- 需要做“策略映射 + 体验降级说明 + UI 条件分支”。

## 3.4 Skills 机制（P0）

当前技能目录与 manifest 管理是 Claude 插件结构：

- `packages/core/src/skills/files.ts:298`

影响：

- `SKILL.md` 内容可复用，但目录发现机制不同，需新增同步层（例如镜像到 Codex 目录约定）。

## 3.5 辅助能力（标题/记忆）使用 Claude SDK（P1）

- `src/electron/libs/title-generator.ts:5`
- `src/electron/libs/memory-extractor.ts:10`
- `src/electron/libs/util.ts:1`

影响：

- 即使主聊天链路切换，标题生成与记忆提取仍会卡在 Claude SDK。

## 3.6 会话数据模型命名绑定（P1）

- `src/electron/libs/session-store.ts:111`
- `src/electron/libs/data-export.ts:319`
- `src/electron/libs/data-import.ts:566`
- `packages/core/src/sync/service.ts:493`

影响：

- `claude_session_id` 语义偏向单 Provider。
- 双栈后建议改为中性字段（如 `provider_thread_id` + `provider`），并做兼容迁移。

## 3.7 构建与发布绑定（P1）

- `package.json:48`
- `package.json:122`
- `electron-builder.json:24`
- `electron-builder.optimized.json:10`

影响：

- 当前打包显式包含 Claude SDK 二进制路径与 patch。
- 引入 Codex 后，构建链路需要并存规则和平台验证。

---

## 4. 可复用资产（可降低改造成本）

- 后端 Proxy Provider 已具备多适配器框架：
  - `api-server/src/routes/proxy/registry.ts:1`
  - `api-server/src/routes/proxy/adapters/openai-compat.ts:1`
  - `api-server/src/routes/proxy/adapters/anthropic.ts:1`
- 渠道层已支持 `openai/anthropic`：
  - `api-server/src/services/channel.ts:30`

说明：后端多 Provider 能力是优势，但桌面端运行时仍是 Claude 协议主导，不能直接等同“前端已双栈”。

---

## 5. 风险分级

### P0（必须先解决，否则双栈不可用）

1. Runner 接口抽象（脱离 `runClaude()` 单实现）
2. 统一消息协议（脱离 SDKMessage 直传）
3. 权限模型映射（`canUseTool` 与 Codex 审批策略差异）
4. Skills 目录发现兼容层

### P1（可并行推进，影响完整度）

1. 标题/记忆能力迁移到抽象层
2. `claudeSessionId` 数据模型中性化与迁移
3. 构建发布链路双 SDK 并存

### P2（上线前收尾）

1. UI 文案与品牌中性化（Claude 专有提示）
2. 测试重构与回归覆盖
3. 文档更新（开发与运维）

---

## 6. 推荐实施路径

## Phase A：先解耦，不改行为（建议 2-3 周）

目标：不改变现网功能，仅建立可扩展架构。

1. 引入 `IAgentRunner` 抽象
2. 将现有 `runClaude` 封装为 `ClaudeAgentRunner`
3. 定义统一 `AgentMessage`（替代 UI 直接依赖 SDK 类型）
4. IPC 与前端改为消费统一事件

验收标准：

- Claude 路径功能零回归
- 现有权限/skills/会话恢复保持不变

## Phase B：接入 Codex（建议 2-3 周）

目标：新增可用的 Codex Provider，不破坏 Claude 路径。

1. 新增 `CodexAgentRunner`（优先流式事件适配）
2. 新增技能目录同步机制（复用现有 `SKILL.md`）
3. 权限模式映射与 UI 策略分流
4. 逐步替换 `claudeSessionId` 为中性字段（保留兼容读取）

验收标准：

- 能在同一应用中切换 Claude / Codex 执行
- 会话创建、继续、中断、费用显示、基础工具调用可用

---

## 7. 工作量预估

- 最小双栈可用版本：**4-6 周（1 名熟悉代码库的工程师）**
- 近等价体验（权限/技能/可观测/回归测试齐全）：**6-8 周**

说明：如果中途要做“零体验差”权限行为对齐，工期会进一步增加。

---

## 8. 关键设计决策（建议尽快定）

1. 是否接受 Codex 路径在首版权限体验上“策略级近似”，而非逐工具完全等价？
2. 会话 ID 字段是否在本次改造里一次性中性化，还是先兼容后迁移？
3. Skills 目录同步采用“实时镜像”还是“启动时同步”？
4. 首版上线策略：灰度开关（仅内部/白名单）还是全量开放？

---

## 9. 附：核心证据文件清单

- 主运行时：`src/electron/libs/runner.ts`
- 主进程调度：`src/electron/ipc-handlers.ts`
- 类型定义：`src/electron/types.ts`、`src/ui/types.ts`
- 消息渲染：`src/ui/components/chat/MessageAdapter.tsx`、`src/ui/components/EventCard.tsx`
- 权限弹窗：`src/ui/components/DecisionPanel.tsx`、`src/ui/components/chat/PermissionDialog.tsx`
- 技能目录：`packages/core/src/skills/files.ts`
- 会话存储：`src/electron/libs/session-store.ts`
- 导入导出：`src/electron/libs/data-export.ts`、`src/electron/libs/data-import.ts`
- 同步服务：`packages/core/src/sync/service.ts`
- 构建配置：`package.json`、`electron-builder.json`、`electron-builder.optimized.json`

