# src/components/ui/

## Responsibility
通用 UI 原子组件库，遵循 shadcn/ui 设计风格，基于 Radix UI 和 Tailwind CSS，提供高度可定制、可访问的组件。支持暗黑模式、响应式设计、完整的表单支持。

## Design
**组件组织：**
- 基础控件：button, input, label, select, checkbox, radio, switch, textarea
- 容器组件：dialog, popover, dropdown-menu, sheet, drawer
- 数据展示：table, tabs, accordion, carousel, progress, skeleton
- 表单组件：form（基于 react-hook-form）、input、select、textarea、checkbox 等
- 反馈组件：toast（sonner）、alert、tooltip

**样式规范：**
- Tailwind CSS utility-first，通过 cn() 工具合并样式
- CSS variables 支持主题（--primary, --secondary, --destructive, --muted 等）
- 深色模式通过 dark: prefix 实现

**可访问性：**
- Radix UI 原语保证 ARIA 属性正确
- 键盘导航支持（Tab, Enter, Space, Esc）
- 屏幕阅读器友好

## Flow
组件使用流：
1. 页面导入所需 UI 组件（如 Button, Input, Table）
2. 通过 props 配置样式变体（size, variant）和交互（onClick 等）
3. cn() 合并自定义样式与预设样式
4. 渲染后自动应用主题和深色模式样式

## Integration
- **依赖：** @radix-ui/* (交互原语)、@hookform/resolvers、react-hook-form、sonner（toast）、Tailwind CSS、clsx + tailwind-merge
- **被依赖：** 所有页面、业务组件、AdminLayout
- **关键接口：** Button、Input、Table、Dialog、Form（通过 FormField + FormControl + FormMessage）、select、checkbox、switch
