# Repository Atlas: Cherry Agent v0.2.24

## Project Responsibility
Cherry Agent 是一款 Electron 桌面 AI 助手，将 Claude Agent SDK 和 Codex SDK 封装为本地客户端，支持多轮对话、工具调用、文件操作、流式思考链可视化、会话历史管理和积分计费。

## Technology Stack
- **Runtime**: Electron 36 + Node.js（主进程）/ React 18 + TypeScript（渲染进程）
- **AI SDKs**: `@anthropic-ai/claude-agent-sdk@0.2.6`（patched: spawn→fork）、`@openai/codex-sdk`
- **State**: Zustand（多 Store + persist）
- **Build**: Vite + electron-builder
- **DB**: better-sqlite3（SQLite，主进程）

## System Entry Points
| 文件 | 职责 |
|------|------|
| `src/electron/main.ts` | 主进程入口：窗口管理、IPC 注册、生命周期、GPU 崩溃自愈 |
| `src/electron/ipc-handlers.ts` | IPC 兼容导出入口：保留原有主进程 API，转发到 `src/electron/ipc/` |
| `src/electron/ipc/` | 按业务域拆分的 IPC 实现：core / auth / session / workspace / skill / sync / billing 等 |
| `src/electron/preload.cts` | 上下文隔离桥：暴露 `window.electron.*` API 给渲染进程 |
| `src/ui/index.tsx` | 渲染进程入口：React 18 + Router 挂载 |
| `src/ui/App.tsx` | 应用根组件：全局布局、路由、IPC 连接 |
| `package.json` | 依赖清单和脚本（dev/build/release） |
| `electron-builder.json` | 打包配置（asarUnpack、nsis、mac签名） |

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  渲染进程（Vite + React）              │
│  App.tsx → Router → ChatPage / SettingsPage / ...   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ UI Components│  │ Zustand Store │  │ React Hooks│ │
│  │ (chat/auth/ │  │ (useAppStore/ │  │(useEventQueue│
│  │  billing/..)│  │ useAuthStore) │  │useSessionEvents)│
│  └─────────────┘  └──────────────┘  └────────────┘ │
│              ↕ window.electron (preload bridge)      │
├─────────────────────────────────────────────────────┤
│                  主进程（Electron/Node.js）            │
│  main.ts → ipc-handlers.ts → ipc/*.ts → libs/       │
│  ┌──────────────────────────────────────────────┐   │
│  │                 libs/                         │   │
│  │  runner.ts → agent-runner/ (factory pattern) │   │
│  │  ├── claude-runner.ts → Claude Agent SDK     │   │
│  │  └── codex-runner.ts  → Codex SDK            │   │
│  │  session-store / auth-service / billing /    │   │
│  │  skill-store / cloud-sync / auto-updater     │   │
│  └──────────────────────────────────────────────┘   │
│              ↕ SQLite (better-sqlite3)               │
├─────────────────────────────────────────────────────┤
│              Claude Agent SDK / Codex SDK            │
│         （fork 子进程，stdin/stdout JSONL 通信）        │
└─────────────────────────────────────────────────────┘
```

## Event Flow（核心数据流）

```
用户输入 → PromptInput.handleSend()
  → IPC client-event "session.start/continue"
  → main.ts → runner.ts → AgentRunnerFactory → IAgentRunner.run()
  → SDK 子进程（Claude/Codex）
  → AgentRunnerEvent 流
  → IPC server-event（ServerEvent）
  → 渲染进程 useIPC → useEventQueue（高/低优先级分层）
      ├─ 高优先级（立即）→ useSessionEvents.onEvent → AppStore.handleServerEvent
      └─ 低优先级（50ms批）→ useSessionEvents.onBatchEvent → AppStore.handleServerEventBatch
  → ChatView 渲染（流式消息 / ThinkingBlock / ToolLogItem）
```

## Directory Map

### Electron 主进程层
| 目录 | 职责摘要 | 详细地图 |
|------|---------|---------|
| `src/electron/` | 应用入口、窗口管理、IPC 路由、OAuth、GPU 崩溃自愈、分层初始化 | [查看](src/electron/codemap.md) |
| `src/electron/ipc/` | IPC 处理器拆分目录：核心会话流 + 各业务域 handler 注册 | [查看](src/electron/ipc/codemap.md) |
| `src/electron/libs/` | 16+ 业务模块：runner、session、auth、billing、workspace、skill、sync、auto-updater | [查看](src/electron/libs/codemap.md) |
| `src/electron/libs/agent-runner/` | Agent 运行时抽象（工厂 + 双栈）：Claude SDK & Codex SDK 统一接口 | [查看](src/electron/libs/agent-runner/codemap.md) |
| `src/electron/libs/migrations/` | SQLite 版本控制（MigrationRunner，001-011 迁移） | [查看](src/electron/libs/migrations/codemap.md) |
| `src/electron/types/` | IPC 事件契约（ClientEvent / ServerEvent / StreamMessage 类型定义） | [查看](src/electron/types/codemap.md) |

### UI 状态管理层
| 目录 | 职责摘要 | 详细地图 |
|------|---------|---------|
| `src/ui/store/` | 多 Store（useAppStore / useAuthStore / useSettingsStore 等）+ 事件处理两层架构 | [查看](src/ui/store/codemap.md) |
| `src/ui/hooks/` | 10+ 专用 Hooks：事件队列、流式消息节流、滚动管理、消息分页、IPC 桥接 | [查看](src/ui/hooks/codemap.md) |

### UI 组件层
| 目录 | 职责摘要 | 详细地图 |
|------|---------|---------|
| `src/ui/components/chat/` | 聊天主视图（ChatView、MessageAdapter、ThinkingBlock、ToolLogItem、代码高亮） | [查看](src/ui/components/chat/codemap.md) |
| `src/ui/components/permissions/` | 权限确认 UI（ConfirmDialog + Promise 式 Hook） | [查看](src/ui/components/permissions/codemap.md) |
| `src/ui/components/auth/` | 登录、OAuth、token 管理、受保护路由 | [查看](src/ui/components/auth/codemap.md) |
| `src/ui/components/billing/` | 余额展示、充值、期卡、订单、支付集成 | [查看](src/ui/components/billing/codemap.md) |
| `src/ui/components/settings/` | 设置面板（模型、通知、云同步、数据导入导出） | [查看](src/ui/components/settings/codemap.md) |
| `src/ui/components/onboarding/` | 新用户引导（driver.js 导览，6 步流程，版本管理） | [查看](src/ui/components/onboarding/codemap.md) |
| `src/ui/components/workspace/` | 文件浏览器（文件树、搜索、隐藏过滤） | [查看](src/ui/components/workspace/codemap.md) |
| `src/ui/components/skills/` | 技能卡片、详情、编辑器 | [查看](src/ui/components/skills/codemap.md) |
| `src/ui/components/sessions/` | 会话管理（工作区选择、标签、状态显示） | [查看](src/ui/components/sessions/codemap.md) |
| `src/ui/components/search/` | 全局搜索（模态界面、键盘导航） | [查看](src/ui/components/search/codemap.md) |
| `src/ui/components/sync/` | 数据同步冲突处理 | [查看](src/ui/components/sync/codemap.md) |
| `src/ui/components/ui/` | 基础 UI 组件库（shadcn/ui 包装） | [查看](src/ui/components/ui/codemap.md) |

### UI 渲染与工具层
| 目录 | 职责摘要 | 详细地图 |
|------|---------|---------|
| `src/ui/render/` | Markdown 渲染（react-markdown + GFM + 语法高亮 + Suspense 懒加载） | [查看](src/ui/render/codemap.md) |
| `src/ui/utils/` | 工具函数（错误上报、平台检测、视口管理、聊天可见性恢复） | [查看](src/ui/utils/codemap.md) |
| `src/ui/lib/` | 核心库（HTTP 客户端、API 通信、时间格式化、语法高亮） | [查看](src/ui/lib/codemap.md) |
| `src/ui/i18n/` | 国际化（中/英/日/繁，自动检测，切换机制） | [查看](src/ui/i18n/codemap.md) |
| `src/ui/pages/` | 页面组件导出（聊天、消费、交易、技能市场、设置） | [查看](src/ui/pages/codemap.md) |
| `src/ui/data/` | 静态数据集（22 个使用案例，按分类组织） | [查看](src/ui/data/codemap.md) |

## Key Design Decisions
1. **spawn → fork 补丁**：Claude Agent SDK 子进程改为 Node.js fork，建立 IPC 通道，更适合 Electron 架构
2. **事件队列分层**：stream.message 等高频事件高优先级立即处理，避免 50ms 批处理延迟导致 UI 空白
3. **React.memo + 命令式 Store 读**：PromptInput 使用 `useAppStore.getState()` 读 prompt，切断 Zustand 订阅，消除打字卡顿
4. **三重防护防 ChatView 空白**：pendingStart → isSessionJustStarted → shouldShowWaitingIndicator 逐级兜底
5. **macOS 更新绕过 Squirrel.Mac**：自定义 fetch 拉取 yml，避免签名要求导致的静默失败
6. **Agent 运行时双栈**：工厂模式延迟加载，Claude SDK 和 Codex SDK 可运行时切换

## How to Update This Map
代码变更后运行：
```bash
python3 ~/.claude/skills/cartography/scripts/cartographer.py changes --root ./
# 查看影响的目录，再针对性更新对应 codemap.md
python3 ~/.claude/skills/cartography/scripts/cartographer.py update --root ./
```
