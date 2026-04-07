# src/electron/libs/

## Responsibility
Electron 主进程核心库的集合，提供 Agent 运行时、会话管理、认证、计费、工作区、技能、同步等功能模块。这是 Electron 主进程的业务逻辑核心，分离了关注点并支持可测试的模块化架构。

## Design
- **运行时抽象**：`AgentRunnerFactory` + `IAgentRunner` 接口 → 支持 Claude SDK & Codex SDK 双栈
- **会话生命周期**：SessionStore 内存索引 + SQLite 持久化 + 权限请求队列（Map<toolUseId, Promise>）
- **认证分层**：auth-service（token 管理）→ oauth-flow（OAuth2 状态机）→ auth-handler（Deep Link & 通知）
- **本地代理隔离**：local-proxy 使用短期代理 secret 作为 localhost 入口凭据，真实上游 token / API key 仅由主进程注入
- **计费委托**：billing-handler 聚合 BillingService（@cherry-agent/core）+ Electron 平台适配器（Shell / Dialog / Auth）
- **工作区监听**：workspace-watcher (chokidar) 跟踪文件变化 → 通知渲染进程
- **技能系统**：skill-store（内存索引 + SQL 查询）+ skill-files（文件系统扫描）+ skill-validator（语法检查）
- **云同步**：CloudSyncService 调用 API 同步会话、消息、设置
- **特征标志**：feature-flags 控制 codex runner 启用状态（运行时切换）
- **内容轮询**：ContentPoller 定期同步计费、设置、技能等（避免主进程阻塞）

## Flow
1. **runner.ts**（CLI runner 包装）：
   - 从 Config/Env 读取 API 配置 → buildEnvForConfig
   - 创建 SDK 实例 → `query(...)`（Claude Agent SDK 的 fork）
   - 注入上下文：memoryContext + skillContext + customSystemPrompt + historyContext
   - 重写 /tmp 路径为 cwd 相对路径（Bash 空格转义）
   - 流式事件转换：SDK Message → ServerEvent（token usage、title hint、compact 等）
   - **重试检测**：`stderr` 回调解析 CLI 重试日志（含 "retry"/"529"/"502"/"overloaded" 等关键词）；8s 静默超时计时器（scheduleSilenceTimer）兜底；触发时向前端发送 `session.status: running, metadata: { isRetrying: true, retryAttempt: N }`；收到新消息时重置计时器并清除重试状态
   - **认证错误归一**：for-await 循环检测 `authentication_failed` 和 EXT_6002/login 模式（LOGIN_REQUIRED_PATTERNS_RUNNER）；`hasFatalAuthError` 标志位跟踪；会话终态若含认证错误则强制为 error，metadata 设 `needsAuth: true, errorType: 'UnauthenticatedError'`
   - **模型漂移诊断**：`lockedModel = config.model` 锁定用户选定模型；SDK init 消息中模型与 lockedModel 不一致时记录 console.warn 并发送 modelDrift 诊断事件

2. **session-store.ts**（会话缓存）：
   - 内存 Map<sessionId, Session>（包含 pendingPermissions、abortController）
   - SQLite 查询：listSessions / getSession / createSession / updateSession / deleteSession
   - 权限队列：pendingPermissions.set(toolUseId, { resolve, timeout })
   - 最近工作目录缓存：listRecentCwds(limit)

3. **auth-service.ts**（认证状态机）：
   - secure-storage 存储 access/refresh token
   - login / loginWithCode / logout / refresh 操作
   - getAuthStatus / getStoredCredentials / isAuthenticated / getUserInfo

4. **local-proxy.ts**（本地代理）：
   - 监听 `127.0.0.1` 随机端口，按 remoteBase 复用实例
   - 只接受主进程签发的代理 secret，不再信任任意 `Authorization` / `x-api-key`
   - 真实上游认证在主进程动态注入；401 时仅代理模式尝试刷新登录态并重试一次

5. **oauth-flow.ts**（OAuth2 协议）：
   - startOAuthFlow(config) 生成授权 URL + state（签名防护）
   - handleOAuthCallback(code, state) 校验 state + 交换 token
   - state 签名/校验（防重放）+ 自动过期（6h）+ PKCE 支持

6. **auth-handler.ts**（Deep Link & 通知）：
   - handleDeepLink(url) 解析 `cherry-agent://oauth/callback?code=...&state=...`
   - notifyAuthResult(sessionId, success/error) → 通知渲染进程
   - OAuth 成功 → 自动关闭子窗口（IPC `auth:closeOAuthWindows`）

7. **billing-handler.ts**（计费聚合）：
   - ElectronShellAdapter / ElectronDialogAdapter / ElectronAuthCredentialProvider
   - 委托给 BillingService：getBalance / recharge / getUsageHistory / exportUsage 等
   - Electron 特定逻辑：shell.openExternal(充值链接) / dialog.showSaveDialog(导出文件)

8. **workspace-watcher.ts**（文件监听）：
   - chokidar 监听工作目录变化（add/unlink/addDir/unlinkDir）
   - 发送 workspace-event（类型：file-changed / dir-added / dir-removed）
   - 最近工作区列表管理

9. **skill-store.ts**（技能索引）：
   - 内存索引：Map<skillId, SkillRecord>（name、description、category、enabled 等）
   - SQL 查询：getAll / get(id) / create / update / delete / toggle / search(options)
   - 自动完成：getContext(options) 返回 enabled skills 摘要供 Skill tool 使用

9. **skill-files.ts**（文件系统）：
   - ensureSkillsPluginManifest(pluginRoot) 生成 plugin.json（SDK 扫描）
   - syncManagedSkills(skillStore, pluginRoot) 写入每个 skill 的 SKILL.md
   - scanUserCreatedSkills(pluginRoot) 扫描用户添加的 skill 文件
   - listPresetSkills / removeManagedSkillFile

10. **preset-skills-installer.ts**（预设技能安装与审计）：
    - installPresetSkills / installRemoteSkill 安装技能到本地
    - `auditSkillDependencies(skillDir, skillContent)` 检测 SKILL.md 中引用的本地文件是否存在
    - `addDegradedModeNote(content, missingRefs)` 缺失引用时在 SKILL.md 顶部注入降级警告
    - `auditAllPresetSkills()` 导出的诊断函数，批量审计所有已安装预设技能

11. **cloud-sync.ts**（API 同步）：
    - syncSessions / syncMessages / syncSettings 调用远程 API
    - 冲突检测与解决（keep_local / keep_remote / manual_merge）
    - 初始化与增量同步

12. **feature-flags.ts**（特征开关）：
    - 内存存储：Map<path, value>（e.g., "desktop.enableCodexRunner" → boolean）
    - 持久化到 local-settings 表
    - isCodexEnabled() / getFeatureFlags() / setFeatureFlag / resetFeatureFlags

13. **proxy-adapter.ts**（代理适配）：
    - getProxyErrorMessage(error) 转换错误信息为用户友好文本
    - proxy-client.ts：proxyRequest(endpoint, method, body, options) 发送 HTTP 请求

14. **auto-updater.ts**（自动更新）：
    - registerUpdateHandlers(options) 监听 app.checkForUpdates()
    - macOS / Windows：checkFeedForUpdate() 直接读取 feed，避免 electron-updater 静默失败
    - 双 URL 支持：dmgUrl（COS）→ files[0].url（GitHub zip → 构造 DMG）
    - 其他平台保留 electron-updater fallback

15. **content-poller.ts**（内容轮询）：
    - start / stop 定期同步计费余额、设置、技能列表
    - 发送 content-polled 事件到渲染进程

16. **simple-memory-store.ts**（记忆存储）：
    - 简单 KV 存储（name → content）
    - SQL 持久化：memory 表（id / name / content / updatedAt）

17. **其他库**：
    - `util.ts`：generateSessionTitle、getEnhancedEnv
    - `title-generator.ts`：用 Claude 快速生成会话标题
    - `title-generation-policy.ts`：判断消息是否应收集用于标题生成
    - `cwd-resolver.ts`：resolveEffectiveCwd (workspace fallback to home)
    - `skill-validator.ts`：validateSyntax (YAML/JSON 验证)
    - `config-store.ts`：本地配置存储（legacy）
    - `secure-storage.ts`：系统钥匙链存储（认证凭据）
    - `recent-workspaces.ts`：最近工作区列表 + 常用目录
    - `local-proxy.ts`：本地代理服务器（多实例 Map，每个 remoteBase 独立端口；支持 Claude SDK 与 Codex SDK 并行使用不同 remoteBase 而不互相重启）
    - `data-export.ts`：导出会话数据为 JSON/CSV
    - `data-import.ts`：导入会话数据
    - `llm-service.ts`：LLM 调用（标题生成等）

## Integration
- **依赖**：
  - `@anthropic-ai/claude-agent-sdk`：query() 用于 Claude 会话
  - `@anthropic-ai/codex-sdk`（可选）：Codex runner 实现
  - `better-sqlite3`：SQLite 数据库（session/message/settings）
  - `chokidar`：文件系统监听
  - `electron`：shell / dialog / app 等 API
  - `@cherry-agent/core`：BillingService / AuthService 等（高级功能）
  - `@cherry-agent/shared`：共享类型定义

- **被依赖**：
  - `main.ts`：导入并调用所有 register 函数与工具函数
  - `ipc-handlers.ts`：依赖各库的具体实现（会话、认证、计费、工作区等）
  - agent-runner/*.ts：运行时实现

- **关键接口**：
  - SessionStore：Session 内存缓存与 SQL 操作
  - SkillStore：技能 CRUD + 搜索 + 启用状态管理
  - OAuth Flow：state 签名 + token 交换 + refresh
  - CloudSyncService：会话/消息同步 API
  - BillingService：计费操作委托
