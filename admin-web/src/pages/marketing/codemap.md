# src/pages/marketing/

## Responsibility

市场营销工具模块，包括折扣码、充值卡、订阅管理、推广配置等功能。用于运营团队进行用户促销、转化优化、客户留存。

## Design

- **多页面结构**：
  - `DiscountList.tsx`：折扣码管理，支持百分比、固定金额、赠送积分三种类型
  - `PeriodCardList.tsx`：充值卡产品列表，定义套餐名、金额、有效期
  - `PeriodCardSubscriptions.tsx`：充值卡订阅历史，用户购买和激活记录
  - `RedeemCodeList.tsx`：兑换码管理，支持批量生成、激活、过期管理

- **DiscountList 特性**：
  - 分页（PAGE_SIZE = 20）
  - 筛选：折扣类型（百分比/固定金额/赠送积分）、状态（启用/禁用/过期）
  - 行操作：编辑、停用、删除、复制折扣码、查看使用统计
  - 支持批量生成折扣��（生成 N 个随机码）
  - 有效期：起始日期、结束日期
  - 使用限制：最多使用次数、每用户最多使用次数

- **PeriodCardList 特性**：
  - 充值卡套餐定义：名称、金额、有效期（天数）
  - 启用/禁用套餐
  - 新增/编辑/删除卡产品

- **PeriodCardSubscriptions 特性**：
  - 展示用户购买的充值卡订阅历表
  - 激活状态：已激活、未激活、已过期
  - 支持手动激活或取消订阅

- **RedeemCodeList 特性**：
  - 批量生成兑换码
  - 状态：未使用、已使用、已过期
  - 操作：标记为已使用、删除、导出

- **状态管理**：
  - useQuery 加载各类列表数据
  - useMutation 处理新增、编辑、删除、批量生成
  - 弹窗表单用 useState 管理临时数据
  - queryClient.invalidateQueries 同步列表

## Flow

**DiscountList 流程：**
1. 挂载 → useQuery 加载折扣码列表（分页、类型筛选、状态筛选）
2. 用户搜索折扣码 → 防抖 → 重新查询
3. 点击筛选（类型、状态、日期范围） → 重置 page=1 → 刷新
4. 点击"新增折扣"按钮 → 打开编辑弹窗
   - 选择类型（百分比/固定金额/赠送积分）
   - 输入折扣值、有效期、使用限制
   - 生成折扣码或输入自定义码
5. 支持"批量生成"：输入生成数量 → 系统生成 N 个随机码 → 导出 CSV
6. 点击"查看统计" → 弹窗显示该折扣的使用数据：已使用次数、用户数、总优惠额
7. 点击"停用" → useMutation 更新状态 → 列表刷新

**PeriodCardList 流程：**
1. 挂载 → useQuery 加载充值卡产品列表
2. 点击"新增卡产品" → 打开编辑弹窗
   - 输入卡名、金额、有效天数
   - 选择启用/禁用
3. 编辑完成 → 点"保存" → useMutation createPeriodCard 或 updatePeriodCard
4. 列表显示：卡名、金额、有效期、订阅人数、最后更新时间

**RedeemCodeList 流程：**
1. 挂载 → useQuery 加载兑换码列表
2. 点击"批量生成" → 打开生成弹窗
   - 输入生成数量（如 100）
   - 系统自动生成随机码
   - 提供"复制"或"下载 CSV"选项
3. 表格显示：兑换码、状态、创建时间、过期时间、操作
4. 点击"标记已用" → useMutation updateRedeemCode(id, status: 'used')

## Integration

- **Services**：
  - `discountsService.getDiscounts(filters, page, limit)`
  - `discountsService.createDiscount(data)`
  - `discountsService.updateDiscount(id, data)`
  - `discountsService.deleteDiscount(id)`
  - `discountsService.toggleDiscount(id, active)`
  - `discountsService.batchCreateDiscounts(count, type, value)`
  - `discountsService.getDiscountStats(id)`
  - `periodCardService.getPeriodCards(filters, page, limit)`
  - `periodCardService.createPeriodCard(data)`
  - `periodCardService.updatePeriodCard(id, data)`
  - `periodCardService.getPeriodCardSubscriptions(filters, page, limit)`
  - `redeemCodeService.getRedeemCodes(filters, page, limit)`
  - `redeemCodeService.batchCreateRedeemCodes(count)`
  - `redeemCodeService.updateRedeemCode(id, status)`

- **UI 组件**：
  - Table + TableBody：列表表格
  - Badge：状态、类型标签
  - Button：操作按钮（编辑、删除、复制）
  - Dialog/Modal：新增/编辑/批量生成弹窗
  - Input：搜索、数值输入
  - DatePicker：日期范围选择

- **折扣类型**：
  - 'percentage'：百分比折扣（如 10% 优惠）
  - 'fixed_amount'：固定金额（如优惠 50 元）
  - 'bonus_credits'：赠送积分（如赠送 1000 积分）

- **折扣状态**：
  - 'active'：启用中（可使用）
  - 'inactive'：已禁用（不可用）
  - 'expired'：已过期（不可用）

- **充值卡有效期**：
  - 激活后 N 天内有效
  - 过期自动锁定，无法再充值

- **兑换码安全**：
  - 随机生成，唯一性保证
  - 单次使用（已使用后不可重复使用）
  - 支持批量导出（便于分发给用户）
