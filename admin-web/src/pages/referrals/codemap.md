# src/pages/referrals/

## Responsibility

分销管理模块，管理用户推荐和佣金系统。展示分销概览、推荐关系、佣金结算、分销配置等信息，支持运营团队进行分销业务分析和优化。

## Design

- **多页面结构**：
  - `ReferralOverview.tsx`：分销概览首页，展示关键指标和排行榜
  - `CommissionList.tsx`：佣金明细列表，支持搜索、筛选、提现申请审批
  - `ReferralConfig.tsx`：分销配置页面，设置佣金比例、有效期、提现规则

- **ReferralOverview 特性**：
  - 统计卡片：总推荐人数、总佣金、待提现金额、本期推荐数
  - 排行榜：TOP 推荐者、TOP 分销用户
  - 近期分销记录：最新的推荐关系列表

- **CommissionList 特性**：
  - 分页（PAGE_SIZE = 20）
  - 筛选：推荐人、被推荐人、佣金状态（待结算/已结算/已提现）、时间范围
  - 搜索：推荐人邮箱或被推荐人邮箱
  - 行操作：查看推荐链接、手动结算、提现申请、删除记录
  - 显示：推荐人、被推荐人、推荐时间、成交金额、佣金金额、状态

- **ReferralConfig 特性**：
  - 佣金配置：按比例（百分比）、按固定金额、按推荐人等级设置
  - 有效期设置：推荐成立后 N 天内消费才算
  - 提现规则：最小提现金额、提现周期（按月/按周）
  - 状态：启用/禁用分销系统

- **状态管理**：
  - useQuery 加载各类统计和列表数据
  - useMutation 处理佣金结算、提现申请、配置更新
  - ReferralOverview 用 useState + useEffect 加载数据（非 Query）
  - queryClient.invalidateQueries 同步列表

## Flow

**ReferralOverview 流程：**
1. 挂载 → 调用 referralService.getOverview()
2. 解析响应数据：stats（统计）、recentReferrals（最近）、topReferrers（排行）
3. 展示统计卡片：总推荐人数、总佣金、待提现、本期推荐
4. 展示两个排行榜：TOP 10 推荐者、TOP 10 被推荐用户
5. 展示最近推荐记录：推荐人 → 被推荐人 → 成交金额 → 佣金
6. 点击"刷新数据"按钮 → 重新调用 getOverview()

**CommissionList 流程：**
1. 挂载 → useQuery 加载佣金记录列表（分页、搜索、筛选）
2. 用户搜索推荐人或被推荐人 → 防抖 → 重新查询
3. 点击筛选（状态、时间范围） → 重置 page=1 → 刷新
4. 点击"结算佣金" → useMutation settleCommission(id) → 弹窗确认 → 更新状态为"已结算"
5. 点击"申请提现" → 弹窗输入提现金额 → useMutation requestWithdrawal() → 后台审批
6. 支持"批量结算"：勾选多行 → 点"批量结算"按钮 → 同时结算多条记录

**ReferralConfig 流程：**
1. 挂载 → useQuery 加载当前配置数据
2. 用户修改配置：
   - 选择佣金计算方式（比例/固定金额）
   - 输入具体比例或金额
   - 设置有效期天数
   - 设置最小提现金额
   - 切换启用/禁用分销系统
3. 修改完成 → 点"保存"按钮 → useMutation updateReferralConfig(data) → 成功提示

## Integration

- **Services**：
  - `referralService.getOverview()`：获取分销概览数据
  - `referralService.getCommissions(filters, page, limit)`：获取佣金列表
  - `referralService.settleCommission(commissionId)`：结算佣金
  - `referralService.requestWithdrawal(data)`：申请提现
  - `referralService.batchSettleCommissions(ids)`：批量结算
  - `referralService.getConfig()`：获取分销配置
  - `referralService.updateConfig(data)`：更新分销配置
  - `referralService.getReferralStats()`：获取详细统计

- **UI 组件**：
  - StatCard：展示关键指标（推荐人数、佣金、金额等）
  - Table + TableBody：佣金/推荐记录列表
  - Badge：佣金状态标签
  - Button：操作按钮（结算、提现、刷新）
  - Dialog/Modal：提现申请弹窗

- **统计指标**：
  - totalReferrals：总推荐人数
  - totalCommission：总佣金（积分）
  - pendingCommission：待结算佣金
  - monthReferrals：本月新推荐人数
  - topReferrers：TOP 推荐者名单
  - recentReferrals：最近推荐记录

- **佣金状态**：
  - 'pending'：待结算（已推荐成交，等待结算）
  - 'settled'：已结算（可申请提现）
  - 'withdrawn'：已提现（佣金已发放）

- **有效期计算**：
  - 推荐链接生成后，被推荐人在设定天数内（如 30 天）首次付款才算有效
  - 超过有效期的推荐自动失效

- **提现规则**：
  - 达到最小提现金额（如 50 元）才能申请
  - 按周期结算（如每月月末结算并提现）
  - 需要后台管理员审批
