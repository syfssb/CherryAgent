# src/ui/pages/

## Responsibility
集中导出应用的全页面组件（路由级别），提供统一的页面导入接口，支持消费记录、交易记录、记忆编辑、技能市场、设置、聊天等核心业务页面。

## Design
- **页面分类**：
  - **金融相关**：UsageHistory (消费)、TransactionHistory (交易)
  - **编辑器**：MemoryEditor (记忆编辑)
  - **市场**：SkillMarket (技能市场)
  - **配置**：SettingsPage / Settings (应用设置)
  - **核心**：ChatPage (聊天)
  - **测试**：StreamingTestPage (流测试，仅开发用)
  - **参考**：UsagePage / PricingPage / ReferralPage (营销相关)

- **Barrel Export 模式**：单一 index.ts 暴露所有页面和类型
- **Props 类型导出**：每个页面同时导出 Props 接口便于使用者理解

## Flow
```
路由器 (Router)
  → index.ts barrel export 导入页面组件
  → 挂载对应页面到路由

页面组件
  → 调用 useAppStore、useSessionStore 等获取状态
  → 若需要 API 调用 → 导入 lib/api-client 或特定 API 库
  → 渲染内容 + 处理用户交互
```

## Integration
- **依赖**：React、zustand store (useAppStore, useSessionStore)、react-i18next、UI 组件库
- **被依赖**：应用路由器 (App.tsx)、动态页面导入
- **关键接口**：
  - `ChatPage` → 主聊天应用
  - `UsageHistory` → 查看消费记录
  - `TransactionHistory` → 查看交易历史
  - `SkillMarket` → 浏览和管理技能
  - `MemoryEditor` → 编辑 Agent 记忆
  - `SettingsPage` → 应用配置
