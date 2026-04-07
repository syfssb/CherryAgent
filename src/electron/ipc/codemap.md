# src/electron/ipc/

## Responsibility
负责承载 Electron 主进程的 IPC 具体实现，将原先集中在 `src/electron/ipc-handlers.ts` 中的超大文件拆成“核心流转 + 业务域注册器”的结构，同时保持对外导出接口不变。

## Design
- **兼容优先**：`src/electron/ipc-handlers.ts` 继续作为主进程入口导出，`main.ts` 无需改 import 路径
- **核心与业务分离**：`core.ts` 负责共享状态、会话初始化、`handleClientEvent()`、runner 事件映射和广播；其它模块仅注册各自的 IPC 通道
- **按业务域拆分**：认证、会话操作、工作区、记忆、技能、数据、同步、计费、启动引导、通知、代理、任务队列分别落到独立文件
- **低风险重构**：沿用原有实现代码和通道名，不改变渲染进程与主进程之间的契约

## File Map
- `core.ts`：共享单例状态、`initializeSessions()`、`handleClientEvent()`、`cleanupAllSessions()`、事件广播与 runner 事件适配
- `auth-handlers.ts`：`registerAuthHandlers()`、`handleAuthDeepLink()`
- `tag-handlers.ts`：标签相关 IPC 注册
- `session-operation-handlers.ts`：会话标签、置顶、归档、搜索、标题相关 IPC 注册
- `workspace-handlers.ts`：工作区监听、目录偏好、文件复制/粘贴/删除、shell 打开
- `memory-handlers.ts`：记忆读写与清空
- `skill-handlers.ts`：技能同步、增删改查、启用切换、导入导出与上下文获取
- `data-handlers.ts`：数据导出、导入、校验
- `sync-handlers.ts`：云同步推拉、冲突处理、配置读写
- `billing-handlers.ts`：余额、充值、用量、期卡与外链打开
- `bootstrap-handlers.ts`：应用启动聚合接口、Feature Flags
- `notification-handlers.ts`：系统通知检查与展示
- `proxy-handlers.ts`：代理余额、用户信息、健康检查、API Key 设置
- `task-manager-handlers.ts`：任务队列状态、取消、暂停、恢复与清理

## Integration
- **被依赖**：`src/electron/ipc-handlers.ts`、`src/electron/main.ts`
- **依赖**：`src/electron/libs/` 下的 session/auth/workspace/skill/sync/billing/runner 等模块
- **稳定契约**：IPC channel 名称、`ClientEvent` / `ServerEvent` 事件契约、主进程对渲染进程的广播行为
