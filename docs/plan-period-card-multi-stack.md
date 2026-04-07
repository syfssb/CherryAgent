# 期卡系统增强：多卡叠加 + 消费标记 + 进度条 + 头像卡片（不含升级）

## Context

当前期卡系统限制每个用户只能有一张 `active` 期卡（数据库 partial unique index + 多处业务拦截）。用户反馈：买了一张期卡后当天额度不够用，想再买一张叠加额度但被拒绝。  
本次目标：允许多卡同时生效（仅额度叠加，不叠加时长），并补齐消费标记与前端展示。

---

## 目标与非目标

### 目标
- 支持同一用户多张 `active` 期卡并行扣费（先到期先扣）。
- 消费记录明确区分“期卡额度消耗”和“余额积分消耗”。
- 充值弹窗和头像菜单展示多张期卡状态。

### 非目标（本期明确不做）
- 不做“期卡升级”能力增强。
- 升级入口统一冻结：用户需要更高额度时直接再购买新期卡。

---

## 模块 A：允许多卡叠加（额度叠加，不叠加时长）

### A1. 数据库迁移

新建 `api-server/src/db/migrations/0029_allow_multiple_active_cards.sql`：
- `DROP INDEX IF EXISTS user_period_cards_one_active_per_user`  
  删除“每用户仅一张 active 卡”的唯一索引。
- `CREATE INDEX IF NOT EXISTS user_period_cards_active_expires_idx ON user_period_cards (user_id, expires_at ASC) WHERE status = 'active'`  
  支持“按到期时间升序取多卡”。
- `DROP INDEX IF EXISTS period_card_usage_logs_pre_charge_id_uidx`  
  取消 `pre_charge_id` 唯一约束（一次 preCharge 会写多条期卡日志）。
- `CREATE INDEX IF NOT EXISTS period_card_usage_logs_pre_charge_id_idx ON period_card_usage_logs (pre_charge_id)`  
  保留按 preCharge 查询性能。
- `ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS quota_used DECIMAL(12,2) NOT NULL DEFAULT 0`  
  记录每次请求实际使用的期卡额度。

同步变更：
- `api-server/src/db/migrations/run_migrations.sql` 增加 `0029` 执行步骤。
- `api-server/src/db/schema.ts` 同步三处定义：  
  `usageLogs.quotaUsed`、`periodCardUsageLogs.preChargeId` 非唯一索引、`userPeriodCards` 新增 active+expires 索引。

### A2. 移除防叠加拦截

移除“已有 active 卡则拒绝/needs_review”的拦截逻辑，共 7 处：

| # | 文件 | 说明 |
|---|------|------|
| 1 | `api-server/src/routes/billing.ts` | 虎皮椒购买接口 activeCardCheck |
| 2 | `api-server/src/routes/billing.ts` | Stripe 购买接口 activeCardCheck |
| 3 | `api-server/src/services/xunhupay.ts` | 虎皮椒回调 needs_review 拦截 |
| 4 | `api-server/src/services/xunhupay.ts` | 虎皮椒补单 needs_review 拦截 |
| 5 | `api-server/src/services/stripe.ts` | Stripe 回调 needs_review 拦截 |
| 6 | `api-server/src/services/redeem-code.ts` | 兑换码防叠加检查 |
| 7 | `api-server/src/routes/admin/period-cards.ts` | Admin 赠送防叠加检查 |

### A3. 扣费逻辑改为多卡（核心）

文件：`api-server/src/services/billing.ts`

#### preChargeCredits
1. 查询所有 active 且未过期的卡：去掉 `LIMIT 1`，按 `expires_at ASC`。
2. 在单事务 + 用户 advisory lock 内循环逐卡扣减：

```ts
remaining = estimatedCredits
for card in activeCards(order by expires_at asc):
  if remaining <= 0: break
  available = card.quota_reset_date != db_today ? card.daily_credits : card.daily_quota_remaining
  deduction = min(available, remaining)
  if deduction > 0:
    UPDATE user_period_cards ... -- 原子更新(含跨天重置)
    cardDeductions.push({ cardId: card.id, quotaUsed: deduction })
    INSERT period_card_usage_logs(...)
    remaining -= deduction
creditsUsed = remaining
```

3. `PreChargeResult` 新增：
   - `cardDeductions: Array<{ cardId: string; quotaUsed: number }>`
4. `balance_transactions.metadata` 新增 `cardDeductions`，保留 `quotaUsed`（总和）与 `creditsUsed` 方便兼容。

#### settleCredits
- 从 metadata 读取 `cardDeductions`。
- 发生退还时按“后扣先退”（逆序）退回每张卡额度，并按 `pre_charge_id` 修正对应 `period_card_usage_logs`。

#### refundPreCharge
- 同理按 `cardDeductions` 逐卡全额退还，并删除/修正该 preCharge 的期卡使用日志。

### A4. API 返回多卡

#### 后端 API
文件：`api-server/src/routes/billing.ts`
- `GET /period-card` 改为返回数组（`PeriodCard[]`），不再返回单对象/`null`。
- 查询 active 且未过期的所有卡，并按 `expires_at ASC` 返回。
- 增加 lazy reset 字段计算：`effective_quota_remaining`。

#### 服务层
文件：`api-server/src/services/period-card.ts`
- 新增 `getActiveCards(userId): Promise<UserPeriodCard[]>`。
- 保留 `getActiveCard` 仅作兼容包装（返回 `getActiveCards` 第一张）。

### A5. 升级能力冻结（本期策略）

用户已确认当前不需要升级流程，策略如下：
- `api-server/src/routes/billing.ts` 的升级接口直接返回业务错误：  
  “升级暂不支持，请直接购买新期卡”。
- `api-server/src/services/xunhupay.ts` / `api-server/src/services/stripe.ts`：  
  若收到 `period_card_upgrade` 订单，标记 `needs_review` 并写入明确原因，禁止激活新卡。
- 前端文案统一去掉“升级”表述（例如“前往充值中心购买或升级期卡”改为“前往充值中心购买期卡”）。

### A6. Electron IPC 与类型契约

文件：`src/electron/ipc-handlers.ts`
- `billing:getPeriodCard` 继续透传后端 `json.data`，但 `data` 语义从单对象改为数组。

文件：`src/ui/vite-env.d.ts`
- `BillingAPI.getPeriodCard` 返回类型改为 `PeriodCardInfo[]`。
- `PeriodCardInfo` 结构保持不变。

### A7. 前端 Store 与组件适配

文件：`src/ui/store/useBillingStore.ts`
- `periodCard: PeriodCard | null` 改为 `periodCards: PeriodCard[]`。
- `fetchPeriodCard` 改为 `fetchPeriodCards`。
- 为兼容旧调用，保留 selector/getter：`periodCard = periodCards[0] ?? null`。

组件改造：
- `src/ui/components/billing/RechargeModal.tsx`  
  去掉 `disabled={!!periodCard}` 和“已有期卡不可购买”提示；展示多卡摘要。
- `src/ui/components/billing/ActivePeriodCard.tsx`  
  单卡展示改为多卡列表展示。
- `src/ui/components/billing/BalanceDisplay.tsx`  
  compact 显示总剩余额度；完整模式展示多卡明细。
- `src/ui/components/auth/UserMenu.tsx`  
  增加期卡摘要区。
- `src/ui/components/billing/PeriodCardSection.tsx`  
  同步移除“已有卡禁购”逻辑（避免遗漏组件入口）。

---

## 模块 B：消费记录标记期卡消费

### B1. 后端传递 quotaUsed

文件：`api-server/src/middleware/balance-check.ts`
- `settleCreditsAfterRequest` 结算后拿到“实际期卡消耗”并传给 `recordUsage`。

文件：`api-server/src/services/billing.ts`
- `settleCredits` 返回值新增 `quotaUsed: number`（实际消耗值，已扣除退还）。
- `refundPreCharge` 返回值新增 `quotaUsed: number`（退款路径固定为 `0`）。
- `UsageData` 增加 `quotaUsed?: number`。
- `recordUsage` 写入 `usage_logs.quota_used`。
- `getUsageRecords` 返回 `quotaUsed` 字段。
- `UsageRecord` 接口补充 `quotaUsed`。

### B2. 前端展示

文件：`src/ui/pages/UsageHistory.tsx`
- 费用列拆分：
  - 有 `quotaUsed > 0`：展示“期卡额度 -X.XX”。
  - 有积分消耗：同时展示“积分 -Y.YY”。
  - 无 `quotaUsed`：保持原展示。

类型同步：
- `src/ui/vite-env.d.ts`
- `src/electron/types/billing.ts`
- `packages/shared/src/billing.ts`
- `packages/core/src/billing/handler.ts`

以上 `UsageRecord` 统一新增 `quotaUsed?: number`，并在 handler 中透传。

### B3. Admin 端展示

文件：`api-server/src/routes/admin/finance.ts`
- 消费记录 SQL 增加 `ul.quota_used`，映射为 `quotaUsed`。

文件：`admin-web/src/services/finance.ts`
- `UsageRecordDTO` 新增 `quotaUsed?: string | null`。

文件：`admin-web/src/pages/finance/UsageRecords.tsx`
- 表格新增“期卡消耗”列。

---

## 模块 C：充值界面期卡进度条 UI

文件：`src/ui/components/billing/RechargeModal.tsx`

在期卡 tab 顶部展示“生效期卡列表”：
- 每张卡：套餐名 + 状态。
- 进度条：`dailyQuotaRemaining / dailyCredits`。
- 到期时间 + 剩余天数。
- 卡片下方继续保留套餐购买列表（允许加购）。

---

## 模块 D：头像下拉展示期卡摘要

文件：`src/ui/components/auth/UserMenu.tsx`

在余额区下方插入期卡摘要（多行紧凑）：
- 每张卡一行：套餐名、今日剩余/总额度、迷你进度条、到期日期。
- 通过 `useBillingStore` 读取 `periodCards`。

---

## i18n 翻译更新

文件：
- `src/ui/i18n/locales/zh.json`
- `src/ui/i18n/locales/en.json`
- `src/ui/i18n/locales/zh-TW.json`
- `src/ui/i18n/locales/ja.json`

新增/修改 key：
- 删除 `periodCard.alreadyActive`（不再禁购）。
- 新增 `periodCard.activeCards`（生效期卡）。
- 新增 `periodCard.quota`（额度）。
- 新增 `usage.table.quotaUsed`（期卡消耗）。
- 新增 `usage.periodCardCost`（期卡额度）。
- 新增 `usage.creditsCost`（积分）。
- 更新文案：所有“购买或升级期卡”改为“购买期卡”。

---

## 涉及文件清单

### 后端（`api-server/src/`）
- `db/migrations/0029_allow_multiple_active_cards.sql`（新建）
- `db/migrations/run_migrations.sql`（注册 0029）
- `db/schema.ts`
- `services/billing.ts`
- `services/period-card.ts`
- `services/xunhupay.ts`
- `services/stripe.ts`
- `services/redeem-code.ts`
- `routes/billing.ts`
- `routes/admin/period-cards.ts`
- `routes/admin/finance.ts`
- `middleware/balance-check.ts`

### 前端（`src/ui/`）
- `store/useBillingStore.ts`
- `components/billing/RechargeModal.tsx`
- `components/billing/ActivePeriodCard.tsx`
- `components/billing/BalanceDisplay.tsx`
- `components/billing/PeriodCardSection.tsx`
- `components/auth/UserMenu.tsx`
- `pages/UsageHistory.tsx`
- `pages/UsagePage.tsx`
- `vite-env.d.ts`
- `i18n/locales/{zh,en,zh-TW,ja}.json`

### 类型/共享
- `src/electron/types/billing.ts`
- `packages/shared/src/billing.ts`
- `packages/core/src/billing/handler.ts`

### Admin
- `admin-web/src/services/finance.ts`
- `admin-web/src/pages/finance/UsageRecords.tsx`

### 测试
- `api-server/src/__tests__/period-card-billing.test.ts`
- `api-server/src/__tests__/period-card.test.ts`
- `api-server/src/__tests__/balance-check.test.ts`
- `api-server/src/__tests__/period-card-migration.test.ts`

---

## 执行顺序

1. 数据库迁移与 schema 对齐（A1）。
2. 升级能力冻结（A5），先止住歧义入口。
3. 后端多卡扣费与 API 改造（A2-A4）。
4. 消费记录 quotaUsed 全链路（B1-B3）。
5. 前端 Store/组件/UI（A6-A7, C, D）。
6. i18n 与文案统一。
7. 回归测试与灰度验证。

---

## 验证方案

1. 购买第一张期卡，激活成功。
2. 再购买第二张期卡，激活成功，不被拦截。
3. 调用升级接口，返回“暂不支持升级，请直接购买新期卡”。
4. 发起对话，扣费顺序为“先到期卡优先”，不足再扣下一张，最后扣积分。
5. 部分结算/退款时，期卡退还按“后扣先退”，对应 usage log 正确修正。
6. 使用记录显示“期卡额度 -X.XX / 积分 -Y.YY”拆分。
7. 充值界面期卡 tab 显示所有 active 卡及进度条，且仍可继续购买。
8. 头像下拉显示多卡摘要。
9. Admin 消费记录展示 `quotaUsed` 列。
10. 任一张卡过期后不再参与扣费，其余 active 卡正常工作。
