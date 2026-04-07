# src/ui/components/sync/

## Responsibility
提供数据同步冲突解决界面，在本地和远端数据发生冲突时展示和处理。

## Design
- **ConflictList**：冲突项目列表展示
  - 显示冲突的资源（会话、消息、技能等）
  - 支持对比本地版本 vs 远端版本
  - 提供解决操作（使用本地 / 使用远端 / 合并）

- **冲突数据结构**：记录资源类型、ID、时间���、两端版本内容

## Flow
```
Sync 进程检测冲突
  → UI 显示 ConflictList 模态框
  → 用户查看本地 vs 远端版本对比

用户选择解决方案
  → onClick handler 触发
  → IPC: sync:resolveConflict { resourceId, strategy }
  → 后端应用解决方案 (keep-local / keep-remote / merge)
  → 更新 UI 列表 / 刷新数据
```

## Integration
- **依赖**：React、useAppStore、useTranslation、UI 组件库、react-diff-viewer (可选)
- **被依赖**：Sync Manager、App 顶层、工作区状态同步流程
- **关键接口**：
  - `ConflictList` Props：
    - `conflicts: ConflictItem[]` → 冲突数组
    - `onResolve?: (resourceId, strategy) => void` → 解决回调
    - `onClose?: () => void` → 关闭回调
  - IPC: `sync:resolveConflict { resourceId, strategy }` → 后端冲突处理
