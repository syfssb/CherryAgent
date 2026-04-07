# src/examples/

## Responsibility
代码示例和参考文件，帮助开发者学习项目中关键功能的使用方式。包括组件使用示例、Hooks 用法、API 调用模式、表单处理等。

## Design
**示例类型：**
- `dashboard-usage-examples.tsx` — Dashboard 相关组件和 API 使用示例
  - React Query useQuery 数据获取
  - 表格渲染、分页、排序
  - 图表组件使用（如 Chart.js、Recharts）
  - 表单 FormField 使用示例
  - 错误边界、加载态处理

**示例风格：**
- 完整的组件代码（包含类型、导入）
- 注释说明关键步骤
- 可复制粘贴使用
- 遵循项目编码规范

## Flow
开发者参考流：
1. 遇到不确定的实现方式 → 查看 examples/
2. 找到相关示例 → 复制代码结构
3. 根据项目需求调整

## Integration
- **依赖：** 项目中的各类 components、hooks、services、types
- **被依赖：** 仅供开发参考，不在构建中使用
- **关键文件：** dashboard-usage-examples.tsx（Dashboard 相关的完整示例）
