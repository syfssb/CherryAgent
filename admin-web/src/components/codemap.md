# src/components/

## Responsibility
后台管理系统的 UI 组件库，包括布局容器（AdminLayout）、通用 UI 控件（button, input, dialog 等）、复杂业务组件。支持深色模式、响应式设计、可访问性。

## Design
**组件分层：**
- `layout/` — 页面容器（侧边栏、顶部栏、主内容区）
- `ui/` — 原子 UI 组件（shadcn/ui 风格，含 button, input, select, dialog, table, form 等）
- 其他文件 — 业务组件（如需要）

**样式系统：**
- Tailwind CSS + clsx + tailwind-merge（cn() 工具函数）
- CSS variables 支持深色模式（--background, --foreground, --primary 等）
- 响应式设计基于 Tailwind breakpoints（sm, md, lg, xl）

## Flow
组件使用链路：
1. 页面导入特定组件或 UI 库中的原子组件
2. 业务逻辑通过 hooks（useQuery, useAdminStore 等）与数据层通信
3. 通过 props drilling 或 Context 传递状态
4. Tailwind 样式动态应用

## Integration
- **依赖：** @radix-ui（底层交互原语）、lucide-react（图标）、Tailwind CSS、shadcn/ui 预置
- **被依赖：** 所有页面、App.tsx (AdminLayout)
- **关键接口：** AdminLayout（页面框架）、UI components（button, input, dialog, table 等）
