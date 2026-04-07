# Cherry Agent — AI 工作指南

> 本文件是给 AI 助手（Claude Code）的元信息，不是给人类开发者的文档。
> 人类开发者请阅读：[DEVELOPMENT.md](DEVELOPMENT.md)、[CONTRIBUTING.md](CONTRIBUTING.md)

## 代码地图（必读）

修改代码前**务必先查阅**分层代码地图：

1. 根目录 `codemap.md` — 定位相关模块
2. 对应子目录 `codemap.md` — 了解设计细节
3. 最后才读具体源文件

## 权限模式

| 模式 | 值 | 说明 |
|------|-----|------|
| 自动批准 | `bypassPermissions` | 跳过所有权限检查，完全自动化 |
| 仅批准编辑 | `acceptEdits` | 自动批准文件操作，Bash 等需确认 |
| 全部确认 | `default` | 所有工具操作都需要确认 |

## 项目边界

- **主进程**（`src/electron/`）不得引用渲染进程模块（`src/ui/`）
- **渲染进程**不得直接调用 Electron/Node.js API，必须通过 IPC（`src/electron/preload.cts`）
- **SDK Skills** 扫描 `{plugin-root}/skills/` 子目录，不是根目录本身

## 关键文件索引

| 功能 | 文件 |
|------|------|
| Electron 入口 | `src/electron/main.ts` |
| IPC 注册中心 | `src/electron/ipc/core.ts` |
| AI 运行时 | `src/electron/libs/runner.ts` |
| 进程启动适配器 | `src/electron/libs/claude-process-spawner.ts` |
| 自动更新 | `src/electron/libs/auto-updater.ts` |
| Widget 渲染 | `src/ui/components/chat/WidgetRenderer.tsx` |
| Skill 文件管理 | `src/electron/libs/skill-files.ts` |

## 开发日志

SDK 日志（仅 `NODE_ENV=development`）写入 `/tmp/cherry-agent-sdk.log`：

```bash
tail -f /tmp/cherry-agent-sdk.log
```

| 前缀 | 含义 |
|------|------|
| `[RUNNER] 🔗 session` | SDK session 初始化 |
| `[RUNNER] ▶ ToolName` | AI 调用工具（PreToolUse） |
| `[RUNNER] ✓ ToolName` | 工具执行完成（含耗时） |
| `[RUNNER] ✗ ToolName` | 工具执行失败 |
| `[RUNNER] ✓ result:success` | 任务完成（含 token 用量） |
