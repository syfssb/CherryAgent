# src/ui/components/sessions/

## Responsibility
提供会话（工作区、标签、状态）管理相关组件，包括工作区选择、标签管理、会话状态展示等。

## Design
- **WorkspaceSelector**：选择或切换活跃工作区，展示最近访问、常用目录等
  - 数据类型：`RecentWorkspace`（最近）、`CommonDir`（常用）

- **WorkspaceStatus**：显示当前工作区的状态（同步中、错误、空闲等）
  - `WorkspaceStatusData` 包含状态类型、消息等信息

- **TagSelector**：为会话选择或创建标签，支持多选

- **TagManager**：管理全局标签列表（创建、删除、编辑）

## Flow
```
Sidebar
  → 显示 WorkspaceStatus (当前工作区状态)
  → 点击打开 WorkspaceSelector 模态框
  → 用户选择或切换工作区
  → IPC: workspace:activate 切换

会话编辑
  → TagSelector 弹出对话框
  → 用户勾选已有标签或创建新标签
  → 保存到 useSessionStore

标签管理
  → 点击"管理标签" → TagManager 模态框
  → 增删改标签 → 同步到数据库
```

## Integration
- **依赖**：React、useAppStore/useSessionStore、useTranslation、UI 组件库 (Dialog、Badge、Input等)、图标库
- **被依赖**：Sidebar、ChatView 头部（标签编辑）、设置页面（工作区管理）
- **关键接口**：
  - `WorkspaceSelector` Props：onSelect 回调
  - `WorkspaceStatus` Props：status: WorkspaceStatusData
  - `TagSelector` Props：selected: string[]、onConfirm
  - `TagManager` Props：onClose 回调
  - `WorkspaceStatusBadge` Props：简化版状态显示组件
