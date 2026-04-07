# src/pages/finance/

## Responsibility

财务管理模块，展示用户充值、消费、收入等财务数据。包括充值记录、消费统计、收入汇总、提现管理等功能。通过 USAGE.ts 定义数据查询字段、类型转换和 UI 映射规则。

## Design

- **多页面结构**：
  - `RechargeRecords.tsx`：用户充值历史列表
  - `UsageRecords.tsx`：用户消费记录列表
  - `Revenue.tsx`：平台收入统计
  - `WithdrawalList.tsx`：提现申请管理
  - `USAGE.ts`：通用工具函数和常量定义

- **USAGE.ts 职责**：
  - 定义支付方式、订单状态枚举
  - 格式化函数：getPaymentMethod、getOrderStatus、formatAmount
  - 数据转换：后端字段名到 UI 显示名的映射
  - 查询条件标准化

- **列表页特性**：
  - 分页（PAGE_SIZE = 20）
  - 日期范围筛选：开始日期、结束日期
  - 支付方式筛选：Stripe、支付宝、微信等
  - 状态筛选：成功、待处理、失败等

## Flow

**RechargeRecords 流程：**
1. 挂载 → useQuery 加载充值记录（分页、日期范围、支付方式筛选）
2. 用户选择日期范围或支付方式 → 重置 page=1 → 重新查询
3. 点击分页按钮 → 更新 page → 加载对应页数据
4. 表格显示：userId、支付方式、金额、状态、时间、操作

**UsageRecords 流程：**
1. 挂载 → useQuery 加载消费记录（分页、用户搜索、日期范围）
2. 输入用户邮箱或 ID → 防抖 → 重新查询
3. 选择日期范围 → 重置 page=1 → 刷新数据
4. 表格显示：用户、消费积分、模型、时间戳

**Revenue 流程：**
1. 挂载 → useQuery 加载平台收入汇总（按支付方式、时间周期分组）
2. 显示 KPI 卡片：总收入、平均订单值、成功率
3. 显示图表：收入趋势、支付方式分布
4. 点击"导出"按钮 → 调用导出接口生成 CSV

**WithdrawalList 流程：**
1. 挂载 → useQuery 加载提现申请列表
2. 筛选：状态（待审核、已批准、已拒绝）
3. 行操作：批准、拒绝、查看详情
4. 点击批准 → useMutation 提交 → 弹窗确认 → 刷新列表

## Integration

- **Services**：
  - `billingService.getRechargeRecords(filters, page, limit)`
  - `billingService.getUsageRecords(filters, page, limit)`
  - `billingService.getRevenue(filters)`
  - `billingService.getWithdrawals(filters, page, limit)`
  - `billingService.approveWithdrawal(withdrawalId)`
  - `billingService.rejectWithdrawal(withdrawalId, reason)`
  - `billingService.exportUsageAsCSV(filters)`

- **UI 组件**：
  - Table + TableBody：列表表格
  - Badge：支付方式、订单状态标签
  - Button：操作按钮
  - DatePicker/Input：日期筛选
  - ChartContainer + recharts：收入趋势图

- **USAGE.ts 导出**：
  - `PAYMENT_METHOD_OPTIONS`：支付方式枚举
  - `ORDER_STATUS_OPTIONS`：订单状态枚举
  - `getPaymentMethodLabel(method)`：支付方式标签
  - `getOrderStatusBadge(status)`：状态 Badge 配置
  - `formatAmount(amount, currency)`：金额格式化

- **支付方式映射**：
  - `xunhupay_wechat` → '虎皮椒微信'
  - `xunhupay_alipay` → '虎皮椒支付宝'
  - `stripe` → 'Stripe'
  - `wechat_h5` → '微信 H5'
  - `alipay_h5` → '支付宝 H5'

- **货币单位**：CNY 显示为"¥"，USD 显示为"$"
