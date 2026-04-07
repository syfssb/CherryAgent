# src/electron/

## Responsibility
Electron 主进程层的核心启动、窗口管理、IPC 通道注册和事件分发中心。负责应用全生命周期管理（初始化、崩溃恢复、清理）、主渲染窗口及 OAuth 子窗口管理、IPC 通道路由及权限验证。其中 `ipc-handlers.ts` 仅作为兼容导出入口，具体 handler 已按业务域拆分到 `ipc/` 目录。

## Design
- **两层 IPC 设计**：`client-event`（单向发送）和 `client-event-dispatch`（双向 Invoke）
- **IPC 按域拆分**：`ipc/core.ts` 负责会话初始化、事件流转与共享状态；`ipc/*-handlers.ts` 按 auth / session / workspace / skill / sync / billing 等业务域注册通道
- **分层初始化**：Layer 1（关键路径 - auth/session/workspace）→ Layer 2（非阻塞 - tag/skill/billing）→ Layer 3（后台任务 - skill 安装、内容轮询）
- **安全恢复**：渲染进程启动时通过 preload 向主进程读取 secure-storage 中的认证凭据，不再依赖 renderer localStorage 持久化 token
- **会话独占机制**：`session.continue` 在新会话初始化完成前被拦截（`pendingStart`），避免消息乱序
- **OAuth 流程**：主进程追踪子窗口，在 `did-navigate` 时拦截回调 URL，自动关闭窗口（渲染进程通过轮询 API 获取结果）
- **GPU 崩溃自愈**：检测 GPU 进程崩溃 → 标记 fallback flag → 重启应用禁用 GPU → 稳定运行 3 次后清除 flag
- **环境变量加载**：支持 `.env.local` > `.env` 多级搜索，来自 appPath/resourcesPath/cwd
- **深度链接**：单实例锁 + `open-url`（macOS）/ `second-instance`（Windows）处理 OAuth 回调

## Flow
1. **App Startup**：
   - 加载环境变量 → 应用运行时配置 (`applyRuntimeEnvDefaults`)
   - 注入 Windows CA 证书库（HTTPS MITM 防护）
   - 设置协议客户端（Deep Link）& 单实例锁
   - 强制软渲染模式（可选 GPU fallback）

2. **App Ready（主进程初始化）**：
   - Layer 1：注册 auth / session / workspace / proxy / bootstrap handlers
   - queueMicrotask：Layer 2（tag/memory/skill/data/sync/billing/notification/update）
   - setImmediate：Layer 3（preset skills 安装、用户 skill 同步、agent browser 确保、内容轮询延迟启动）
   - 设置崩溃处理器（uncaughtException / unhandledRejection / render-process-gone / child-process-gone）
   - GPU fallback 恢复检测（30s 后若无新崩溃则计数稳定运行）

3. **BrowserWindow 创建**：
   - 隐藏展示（避免白闪）→ ready-to-show 后展示（兜底 8s 强制展示）
   - OAuth 子窗口拦截：setWindowOpenHandler → 拒绝创建（系统浏览器打开）
   - 追踪子窗口：did-create-window → 监听 will-navigate / did-navigate / did-finish-load
   - OAuth 回调检测：关闭子窗口（延迟 500ms 保证后端完成交换）
   - 渲染进程热重载：dev 环境监听 did-fail-load（-102/-6 重试）

4. **IPC 路由**：
   - `client-event`：单向发送，直接调用 `handleClientEvent`
   - `client-event-dispatch`：双向 Invoke，返回 `{ success, error }`
   - `session.continue` 额外检查：拦截未就绪会话（running 且无 resumeId）→ `SESSION_NOT_READY`
   - 权限验证：`validateEventFrame` 检查发送者帧有效性

5. **会话管理**：
   - 标题生成：同步调用 `generateSessionTitle`
   - Provider 推导：从 modelId / payload provider / 会话 provider 逐级推导
   - 会话继续：自动注入历史记录、技能、记忆上下文（通过 `contextInjection`）

6. **清理流程**（app quit / will-quit / SIGTERM 等）：
   - 停止 TaskManager（后台任务）
   - 停止 ContentPoller（资源轮询）
   - 注销全局快捷键
   - 清理所有会话（停止运行的 runner）
   - 杀死 Vite dev server（dev 环境）

## Integration
- **依赖**：
  - `ipc-handlers.js`：IPC 兼容导出层（主进程继续从原路径导入）
  - `ipc/core.js`：会话初始化、`handleClientEvent`、共享状态与事件广播
  - `ipc/*-handlers.js`：各业务域的 IPC 注册实现（auth / workspace / skill / sync / billing / bootstrap / proxy / task）
  - `libs/runner.js`：Claude Agent SDK 包装，会话执行入口
  - `libs/session-store.js`：会话持久化存储与内存索引
  - `libs/auth-service.js`：认证状态 & token 管理
  - `libs/auto-updater.js`：更新检查与安装（macOS / Windows 读取 feed 后打开安装包，其他平台 fallback 到 electron-updater）
  - `libs/skill-*.js`：Skill 文件系统 & 安装器
  - `libs/agent-browser-installer.js`：Playwright 浏览器下载
  - `libs/content-poller.js`：定期获取资源配置（billing/settings 等）
  - `preload.cts`：上下文隔离的 IPC 桥接（electronAPI 暴露给渲染进程；auth 相关桥接支持 secure-storage 恢复）
  - `util.js`：`ipcMainHandle` 包装（自动处理 invoke 异常）
  - `pathResolver.js`：`getPreloadPath / getUIPath / getIconPath`
  - `test.js`：`getStaticData / pollResources`（dev 调试用）
  - `types.ts`：ClientEvent / ServerEvent / StreamMessage 定义

- **被依赖**：
  - 渲染进程（preload 通过 context bridge 访问所有 IPC）
  - 后台任务（TaskManager 在主进程线程执行）
  - 深度链接处理（OAuth 回调 URL 路由）

- **关键接口**：
  - IPC Channels：`client-event` / `client-event-dispatch` / 100+ 业务 handlers
  - Events：`server-event` / `workspace-event` / `update:status` / `update:progress` / `notification:click` / `auth:callback`
  - Global Shortcuts：`Cmd+Q`（退出）/ `Cmd+Shift+Space`（唤起窗口）/ `Cmd+Shift+I`（DevTools，dev only）
  - Deep Links：`cherry-agent://oauth/callback?code=...&state=...`（OAuth2）
  - File Paths：`getAppPath()` / `app.getPath('userData')` / `process.resourcesPath`

## IPC Modules
- `ipc/core.ts`：保留原巨石文件中的核心会话流，包括 `initializeSessions()`、`handleClientEvent()`、`emit()`、runner 事件映射与清理逻辑
- `ipc/auth-handlers.ts`：鉴权 IPC、OAuth PKCE 流程、深链回调处理
- `ipc/session-operation-handlers.ts`：会话标签、置顶/归档、搜索、标题更新
- `ipc/workspace-handlers.ts`：工作区监听、最近目录、文件复制/粘贴/删除、shell 打开
- `ipc/skill-handlers.ts` / `ipc/memory-handlers.ts`：技能与记忆系统管理
- `ipc/data-handlers.ts` / `ipc/sync-handlers.ts` / `ipc/billing-handlers.ts`：数据导入导出、云同步、计费能力
- `ipc/bootstrap-handlers.ts` / `ipc/notification-handlers.ts` / `ipc/proxy-handlers.ts` / `ipc/task-manager-handlers.ts`：启动引导、通知、代理服务、后台任务队列
