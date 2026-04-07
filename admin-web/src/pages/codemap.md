# src/pages/

## Responsibility

作为 admin-web 核心页面层，提供后台管理所有主要功能模块的用户界面。包含 14 个功能域，每个域负责特定的业务逻辑呈现与数据管理。

## Design

- **目录结构**：按功能域划分（dashboard、users、finance、channels 等），每个目录包含该域的所有页面组件
- **页面类型**：
  - 单文件页面：如 `dashboard/index.tsx`、`fraud/FraudList.tsx`
  - 多组件页面集群：如 `finance/` 包含 RechargeRecords、UsageRecords、Revenue
  - 复杂表单页面：如 `channels/ChannelForm.tsx`、`models/ModelForm.tsx`
- **状态管理**：
  - 列表页面用 React Query (useQuery + useMutation) 处理数据获取、缓存、分页
  - 表单页面用 useState 局部管理，成功后调用 queryClient.invalidateQueries 更新
  - 详情页通过导航传参，路由状态与服务同步

## Flow

**典型列表页操作流程：**
1. 组件挂载 → useQuery 获取首页数据（分页、筛选、排序）
2. 用户输入搜索词/筛选条件 → 防抖延迟 → 调用 service 接口
3. useQuery 返回 { data, isLoading, error } → 更新 UI（表格、分页、骨架屏）
4. 用户点击编辑/删除 → useMutation 提交操作 → queryClient.invalidateQueries 刷新列表
5. 错误处理：Toast 提示用户，保留输入内容便于重试

**典型表单页（新增/编辑）：**
1. 打开弹窗 → 读取现有数据（编辑模式）或设置默认值（新增模式）
2. 用户填表 → 实时校验（必填、格式、业务规则）
3. 点击保存 → useMutation 提交 → 成功后关闭弹窗 + 刷新列表
4. I18n 字段（如 Skills、Announcements）用 I18nEditor 多语言编辑

## Integration

- **核心依赖**：
  - react-router-dom：页面导航、参数传递
  - @tanstack/react-query：数据获取、缓存、同步
  - lucide-react：图标库
  - recharts：仪表板图表

- **关键 Services**：
  - `dashboardService`：仪表板数据汇总
  - `usersService`、`channelsService`、`modelsService` 等：CRUD 操作
  - 所有 service 返回统一格式：`{ success: boolean, data?: T, error?: string }`

- **UI 组件库**：
  - Card、Button、Input、Badge：基础组件
  - Table、TableHeader、TableBody 等：表格
  - I18nEditor：多语言编辑（Skills、Announcements）
  - MarkdownPreview：Markdown 预览（Announcements）

- **通用工具**：
  - `formatDateTime`, `formatCurrency`, `formatNumber`：数据格式化
  - `cn()` (classnames)：条件样式合并
  - 分页常量：`PAGE_SIZE = 20`

- **API 约定**：
  - 列表端点：GET `/api/admin/{resource}?page=X&limit=20&filters=...`
  - 新增/编辑：POST/PUT `/api/admin/{resource}`
  - 删除：DELETE `/api/admin/{resource}/{id}`
  - 详情：GET `/api/admin/{resource}/{id}`
