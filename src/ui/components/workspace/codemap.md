# src/ui/components/workspace/

## Responsibility
提供工作区（工作目录）文件浏览和管理界面，包括文件树展示、搜索、隐藏文件过滤等功能。

## Design
- **文件树数据结构**：`FileNode` 表示文件或目录，递归包含 children、expanded、loaded 等状态
- **隐藏文件过滤**：黑名单 (.DS_Store、Thumbs.db、desktop.ini) + 通配符 (以 . 或 ~ 开头)
- **递归搜索过滤**：命中父节点或任意子节点都保留，自动展开匹配分支
- **UI 交互**：可折叠侧边栏、浮动模式、自定义宽度、文件选择回调

## Flow
```
FileExplorer 挂载
  → 从 useAppStore 读取当前工作目录
  → IPC: workspace:listdir() 获取文件树
  → filterHiddenNodes() 过滤系统文件

用户搜索
  → 触发 filterNodesByQuery()
  → 递归遍历：自身匹配 OR 任意子节点匹配
  → 自动展开匹配分支 (expanded: true)

用户点击文件
  → onFileSelect(path) 回调
  → 通常导入到聊天框或编辑器
```

## Integration
- **依赖**：React、useAppStore、useTranslation、Dropdown、Toast、icons
- **被依赖**：Sidebar、ChatView 文件上下文菜单
- **关键接口**：
  - `FileExplorer` Props：
    - `collapsed?: boolean` → 初始折叠状态
    - `floating?: boolean` → 浮动面板模式
    - `width?: number` → 面板宽度
    - `onFileSelect?: (path) => void` → 文件选择回调
    - `onCollapsedChange?: (collapsed) => void` → 折叠状态变化回调
