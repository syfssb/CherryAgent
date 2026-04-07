# 财务管理页面

本目录包含管理后台的三个财务管理页面组件。

## 📁 文件结构

```
finance/
├── RechargeRecords.tsx    # 充值记录页面
├── UsageRecords.tsx       # 消费明细页面
├── Revenue.tsx            # 收入统计页面
├── index.ts               # 导出索引
├── USAGE.ts              # 使用说明
└── README.md             # 本文档
```

## 🎯 功能概述

### 1. RechargeRecords.tsx - 充值记录

**核心功能：**
- ✅ 展示所有用户的充值记录
- ✅ 统计卡片：充值总额、总记录数、已完成、处理中
- ✅ 筛选功能：
  - 支付方式（支付宝、微信、银行转账、数字货币、手动充值）
  - 状态（处理中、已完成、失败、已取消、已退款）
  - 金额范围
  - 日期范围
- ✅ 搜索功能：用户邮箱、昵称、ID、交易单号
- ✅ 分页功能
- ✅ 导出CSV功能

**数据字段：**
- 充值ID、用户信息、充值金额、余额
- 支付方式、状态、交易单号
- 创建时间、完成时间

### 2. UsageRecords.tsx - 消费明细

**核心功能：**
- ✅ 展示所有API调用的消费记录
- ✅ 统计卡片：总消费、请求次数、总Tokens、平均耗时、成功率
- ✅ 筛选功能：
  - 模型类型（对话、补全、嵌入、图像、音频）
  - 状态（成功、失败、超时）
  - 费用范围
  - 日期范围
- ✅ 搜索功能：用户、模型、渠道
- ✅ 分页功能
- ✅ 导出CSV功能

**数据字段：**
- 消费ID、用户信息、模型信息、渠道信息
- 类型、输入/输出/总Tokens
- 输入/输出/总费用、耗时
- 状态、错误信息、创建时间

### 3. Revenue.tsx - 收入统计

**核心功能：**
- ✅ 核心指标卡片：总收入、总充值、总消费、净收入
- ✅ 收入趋势图（折线图）：
  - 充值、消费、净收入的时间趋势
  - 支持交互式Tooltip
- ✅ 支付方式分布（饼图）：
  - 各支付方式占比
  - 金额和百分比展示
- ✅ 模型消费排行（柱状图）：
  - Top模型消费金额
- ✅ Top用户排行榜：
  - 充值和消费金额最高的用户
  - 徽章标识（金牌/银牌/铜牌）
- ✅ 筛选功能：
  - 日期范围
  - 分组方式（按天/周/月）
- ✅ 导出CSV功能（支持各个图表单独导出）

**图表库：**
- 使用 `recharts` 库进行数据可视化
- 响应式设计，适配不同屏幕尺寸

## 🚀 使用方法

### 1. 导入组件

```tsx
import { RechargeRecords, UsageRecords, Revenue } from '@/pages/finance'
```

### 2. 路由配置

```tsx
import { Route } from 'react-router-dom'
import AdminLayout from '@/components/layout/AdminLayout'
import { RechargeRecords, UsageRecords, Revenue } from '@/pages/finance'

<Route path="/admin" element={<AdminLayout />}>
  <Route path="finance">
    <Route path="recharge-records" element={<RechargeRecords />} />
    <Route path="usage-records" element={<UsageRecords />} />
    <Route path="revenue" element={<Revenue />} />
  </Route>
</Route>
```

### 3. 侧边栏菜单

```tsx
import { DollarSign, Receipt, TrendingUp } from 'lucide-react'

const menuItems = [
  {
    title: '财务管理',
    icon: DollarSign,
    children: [
      { title: '充值记录', path: '/admin/finance/recharge-records', icon: Receipt },
      { title: '消费明细', path: '/admin/finance/usage-records', icon: Receipt },
      { title: '收入统计', path: '/admin/finance/revenue', icon: TrendingUp },
    ],
  },
]
```

## 🎨 UI/UX特性

### 设计风格
- 遵循项目统一的暗色主题设计
- 使用项目统一的UI组件库（Card, Button, Input, Badge, Table）
- 响应式布局，支持移动端和桌面端

### 交互特性
- 实时筛选和搜索
- 可折叠的高级筛选面板
- 加载状态提示
- 空状态提示
- 分页导航
- 悬停效果和状态反馈

### 颜色标识
- **成功/已完成**: 绿色 (success)
- **警告/处理中**: 黄色 (warning)
- **危险/失败**: 红色 (danger)
- **信息/手动**: 蓝色 (info)
- **中性**: 灰色 (neutral)

## 📊 数据类型

### 类型定义位置
`/src/types/index.ts`

新增类型：
- `RechargeRecord` - 充值记录
- `RechargeRecordFilters` - 充值记录筛选参数
- `UsageRecord` - 消费明细
- `UsageRecordFilters` - 消费明细筛选参数
- `RevenueStats` - 收入统计数据
- `RevenueStatsFilters` - 收入统计筛选参数

### 工具函数位置
`/src/lib/utils.ts`

新增函数：
- `getPaymentMethodLabel()` - 获取支付方式标签
- `getRechargeStatusLabel()` - 获取充值状态标签
- `getUsageStatusLabel()` - 获取消费记录状态标签
- `getModelTypeLabel()` - 获取模型类型标签
- `exportToCSV()` - 导出CSV文件

## 🔄 数据流

### 当前状态
- 使用模拟数据（mock data）进行展示
- 所有数据都在组件内定义

### 后续集成
需要替换为实际的API调用：

```tsx
// 示例：替换mock数据为API调用
import { useQuery } from '@tanstack/react-query'
import { fetchRechargeRecords } from '@/api/finance'

const { data, isLoading } = useQuery({
  queryKey: ['rechargeRecords', filters],
  queryFn: () => fetchRechargeRecords(filters),
})
```

## 🧪 测试建议

### 单元测试
- 测试筛选逻辑
- 测试分页计算
- 测试数据导出功能
- 测试统计计算

### 集成测试
- 测试API调用
- 测试状态管理
- 测试路由导航

### E2E测试
- 测试完整的用户流程
- 测试筛选和搜索
- 测试导出功能

## 📈 性能优化

已实现的优化：
- ✅ 使用 `useMemo` 缓存筛选后的数据
- ✅ 使用 `useMemo` 缓存分页数据
- ✅ 使用 `useMemo` 缓存统计计算
- ✅ 按需渲染（仅渲染当前页的数据）

建议的优化：
- 🔄 实现虚拟滚动（对于超长列表）
- 🔄 实现数据预加载
- 🔄 实现请求防抖
- 🔄 实现图表懒加载

## ♿ 可访问性

已实现：
- ✅ 语义化HTML标签
- ✅ 表单标签关联
- ✅ 按钮和链接的清晰文本
- ✅ 颜色对比度符合WCAG标准

待改进：
- 🔄 键盘导航支持
- 🔄 ARIA标签补充
- 🔄 屏幕阅读器支持

## 🔐 安全考虑

- 所有金额数据使用固定小数位显示
- 用户敏感信息（如邮箱）需要根据权限决定是否完整显示
- 导出功能应该添加权限检查
- API调用需要添加认证和授权

## 📝 后续开发建议

1. **API集成**
   - 替换mock数据为实际API调用
   - 实现数据缓存和刷新策略
   - 添加错误处理和重试机制

2. **权限控制**
   - 根据用户角色显示/隐藏功能
   - 限制敏感数据的访问

3. **高级功能**
   - 添加批量操作
   - 添加数据对比功能
   - 添加自定义报表
   - 添加数据预警

4. **用户体验**
   - 添加筛选条件保存
   - 添加视图切换（表格/卡片）
   - 添加数据刷新提示
   - 添加导出进度提示

## 🐛 已知问题

- TypeScript类型检查有一些node_modules的类型定义问题（与业务代码无关）
- 需要确保recharts库正确安装

## 📞 技术支持

如有问题，请查看：
1. 项目整体文档
2. UI组件库文档
3. React Router文档
4. Recharts文档

---

**创建时间**: 2024-01-30
**版本**: 1.0.0
**维护者**: Claude Agent
