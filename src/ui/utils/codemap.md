# src/ui/utils/

## Responsibility
提供跨模块共享的工具函数集，包括错误上报、平台检测、日期处理、滚动管理和国际化等基础设施功能。

## Design
- **错误上报管理**：`error-reporter.ts` 建立全局错误捕获层，去重机制防止重复上报，通过 IPC 送主进程记录
- **平台适配**：`platform.ts` 统一平台检测（macOS vs 其他），避免多处重复判断
- **视口管理**：`chat-visibility.ts` 提供聊天窗口前后台切换后的布局修复
- **其他工具**：`skillI18n.ts`（技能国际化）、`date.ts`（日期处理）、`scroll.ts`（滚动助手）

## Flow
```
window.onerror / onunhandledrejection
  → getErrorFingerprint() 去重
  → sendErrorToMain(entry)
  → IPC: electron.reportError()
  → 主进程日志记录

realignChatViewportForForeground()
  → clampScrollTop() 钳位
  → handleScroll() 更新状态
  → scrollContainerToBottom() 自动滚动
```

## Integration
- **依赖**：React (hooks, types)、electron (window.electron)、react-i18next (i18n)
- **被依赖**：ChatView、MessageAdapter、PromptInput、SkillEditor 等多个组件
- **关键接口**：
  - `setupGlobalErrorHandlers()` → 应在 main.tsx 启动时调用
  - `isMac()` / `getModKey()` → 平台相关快捷键生成
  - `realignChatViewportForForeground(target)` → Electron 前后台切换修复
