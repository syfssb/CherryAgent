# src/ui/components/search/

## Responsibility
提供全局搜索功能，支持跨会话和消息内容的模糊搜索，包括结果展示、导航等。

## Design
- **SearchBar**：模态式搜索界面（Dialog 包装）
  - 实时搜索输入框（自动聚焦）
  - 动态结果列表（session + message 混合）
  - 键盘导航（上下箭头选择、Enter 确认、Esc 关闭）

- **搜索结果类型**：
  - `type: "session"` → 会话标题命中
  - `type: "message"` → 消息内容命中（带 snippet 片段）

- **本地化**：locale 自动从 i18n 读取，支持多语言排序和展示

## Flow
```
按 Cmd+K (Mac) / Ctrl+K 打开搜索
  → SearchBar Dialog 显示
  → inputRef 自动聚焦

输入查询词
  → 200ms debounce 防抖（可配）
  → IPC: search:query { query, limit }
  → 后端返回结果数组 (SearchResult[])
  → setResults + setIsSearching

键盘导航
  → ↑/↓ 切换 selectedIndex
  → Enter 导航到会话 + 跳转消息
  → Esc 关闭 + 重置状态
```

## Integration
- **依赖**：React、useAppStore (setActiveSessionId)、useTranslation、Radix Dialog、Input、icons
- **被依赖**：Sidebar、PromptInput（快捷键触发）、App.tsx 顶层
- **关键接口**：
  - `SearchBar` Props：
    - `open: boolean` → 对话框打开状态
    - `onOpenChange: (open) => void` → 状态变化回调
  - IPC: `search:query { query, limit }` → 后端搜索处理程序
  - 返回：`SearchResult[]` 数组（会话 + 消息混合）
