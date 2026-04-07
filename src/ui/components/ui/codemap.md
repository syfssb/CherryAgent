# src/ui/components/ui/

## Responsibility
提供应用的基础 UI 组件库，基于 shadcn/ui 和 Radix UI Primitives 构建，包括按钮、输入框、对话框、菜单、表格等。

## Design
- **shadcn/ui 包装**：将 Radix 原始组件与 Tailwind CSS 样式集成
- **组件列表**：
  - **表单**：Button、Input、Textarea、Label、Checkbox、Select
  - **对话框**：Dialog（Modal）、DropdownMenu、Tooltip
  - **布局**：Card、Tabs、Table、ScrollArea、Badge
  - **展示**：Avatar

- **统一导出模式**：单一 index.ts barrel export，便于 `import { Button, Input, Dialog } from "@/ui/components/ui"`

## Flow
```
组件使用
  → import { Button, Input, Dialog } from "@/ui/components/ui"
  → <Button>Click</Button>
  → 自动应用 Tailwind 样式 + Radix 交互逻辑
  → 支持 className 扩展自定义样式
```

## Integration
- **依赖**：Radix UI Primitives (@radix-ui/*)、Tailwind CSS、clsx (cn 工具函数)
- **被依赖**：整个应用的所有页面和组件（基础 UI 层）
- **关键接口**：
  - 所有组件都导出 Props 类型（如 `ButtonProps`, `InputProps`）
  - 样式通过 `className` 属性扩展
  - 部分组件支持 variants（如 `buttonVariants`）用于获取样式类名
  - `cn()` 工具函数用于条件组合 className
