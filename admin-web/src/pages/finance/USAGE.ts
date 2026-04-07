/**
 * 财务管理路由配置示例
 *
 * 将以下路由配置添加到你的路由文件中（如 App.tsx 或 router.tsx）
 */

/*
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from '@/components/layout/AdminLayout'
import { RechargeRecords, UsageRecords, Revenue } from '@/pages/finance'

// 在你的路由配置中添加:
<Route path="/admin" element={<AdminLayout />}>
  <Route path="finance">
    <Route path="recharge-records" element={<RechargeRecords />} />
    <Route path="usage-records" element={<UsageRecords />} />
    <Route path="revenue" element={<Revenue />} />
  </Route>
</Route>
*/

/**
 * 侧边栏菜单配置示例
 *
 * 在你的侧边栏配置中添加财务管理菜单项
 */

/*
import { DollarSign, Receipt, TrendingUp } from 'lucide-react'

const sidebarMenuItems = [
  // ... 其他菜单项
  {
    title: '财务管理',
    icon: DollarSign,
    children: [
      {
        title: '充值记录',
        path: '/admin/finance/recharge-records',
        icon: Receipt,
      },
      {
        title: '消费明细',
        path: '/admin/finance/usage-records',
        icon: Receipt,
      },
      {
        title: '收入统计',
        path: '/admin/finance/revenue',
        icon: TrendingUp,
      },
    ],
  },
  // ... 其他菜单项
]
*/

/**
 * 页面功能说明
 *
 * 1. RechargeRecords.tsx - 充值记录页面
 *    - 显示所有用户的充值记录
 *    - 支持按支付方式、状态、金额范围、日期范围筛选
 *    - 支持搜索用户、ID、交易单号
 *    - 显示充值统计：总额、总数、已完成、处理中
 *    - 支持分页
 *    - 支持导出CSV
 *
 * 2. UsageRecords.tsx - 消费明细页面
 *    - 显示所有API调用的消费记录
 *    - 支持按模型类型、状态、费用范围、日期范围筛选
 *    - 支持搜索用户、模型、渠道
 *    - 显示消费统计：总消费、请求次数、总Tokens、平均耗时、成功率
 *    - 显示详细的Token使用情况（输入/输出）
 *    - 支持分页
 *    - 支持导出CSV
 *
 * 3. Revenue.tsx - 收入统计页面
 *    - 显示核心收入指标：总收入、总充值、总消费、净收入
 *    - 收入趋势折线图（充值、消费、净收入）
 *    - 支付方式分布饼图
 *    - 模型消费排行柱状图
 *    - Top用户排行榜
 *    - 支持按日期范围和分组方式（天/周/月）筛选
 *    - 各个图表和表格都支持单独导出CSV
 */

export {}
