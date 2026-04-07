# 期卡系统增强：防叠加 + 兑换码支持期卡 + Admin 期卡管理增强（可执行版）

## Context

目标需求：
1. **防叠加**：用户有有效期卡时禁止再次“购买新卡”，仅允许走升级。
2. **兑换码支持期卡**：兑换码从“仅积分”扩展到“积分/期卡”两种类型。
3. **Admin 期卡增强**：新增手动赠送、延期能力。

当前已知现状（基于代码）：
- 购买接口 `POST /purchase-period-card` 目前无 active 卡拦截。
- Stripe/迅虎 `period_card_purchase` 分支仍会覆盖旧 active 卡（`UPDATE ... status='upgraded'`）。
- `periodCardService.activatePeriodCard` 现签名是 `paymentId: string`，与文档里的 `null` 调用不兼容。

---

## M1：购买防叠加（接口 + 回调 + 补单一致）

### 1.1 购买接口拦截（下单前）
**文件**: `api-server/src/routes/billing.ts`

在 `POST /purchase-period-card` 中，查询套餐后、创建订单前增加拦截：
```sql
SELECT id
FROM user_period_cards
WHERE user_id = $1
  AND status = 'active'
  AND expires_at > NOW()
LIMIT 1
```

命中则返回 400：
`您已有生效中的期卡，到期后可购买新套餐。如需更高套餐请使用升级功能。`

### 1.2 支付回调与补单：禁止“购买覆盖旧卡”
**文件**: `api-server/src/services/stripe.ts`、`api-server/src/services/xunhupay.ts`

对 `period_card_purchase`（含补单分支）统一改造：
1. 若用户已有 active 卡：**不激活新卡，不覆盖旧卡**。
2. 删除购买分支里的 `UPDATE user_period_cards SET status='upgraded' WHERE user_id=... AND status='active'`。
3. 订单状态处理必须有闭环，避免“钱扣了但没发卡”：
   - 推荐：将支付单标记为 `needs_review` 并记录原因（`active_card_exists`），进入人工/自动退款流程。
   - 或在同事务内直接触发退款并记录审计日志。
4. 升级分支 `period_card_upgrade` 保持现有逻辑，不受此变更影响。

### 1.3 并发与幂等兜底
- 保留并依赖 DB 约束 `user_period_cards_one_active_per_user`（唯一 active 卡）。
- 回调侧若遇到唯一约束冲突（竞态），按 `needs_review + 退款/人工处理` 兜底，避免静默失败。

---

## M2：兑换码支持期卡

### 2.1 数据库迁移
**新文件**: `api-server/src/db/migrations/0028_redeem_code_period_card.sql`

```sql
ALTER TABLE redeem_codes
  ADD COLUMN redeem_type VARCHAR(20) NOT NULL DEFAULT 'credits';
-- redeem_type: credits | period_card

ALTER TABLE redeem_codes
  ADD COLUMN period_card_plan_id UUID REFERENCES period_card_plans(id) ON DELETE SET NULL;
```

补充要求：
- 在 `run_migrations.sql` 注册 `0028`。
- 历史数据兼容：已有记录默认 `redeem_type='credits'`，无额外回填负担。

### 2.2 服务层改造
**文件**: `api-server/src/services/period-card.ts`、`api-server/src/services/redeem-code.ts`

先处理阻断点（二选一，推荐 A）：
- **A（推荐）**：将 `activatePeriodCard(..., paymentId)` 签名改为 `paymentId: string | null`。
- B：新增专用方法 `grantPeriodCard(...)` 给兑换/赠送调用。

`redeemCode()` 改造：
1. 读取 `redeem_type`。
2. `credits`：保留现有逻辑。
3. `period_card`：
   - 检查用户是否已有 active 卡（有则拒绝）。
   - 校验 `period_card_plan_id` 存在且 `is_enabled = true`。
   - 在同事务内激活期卡（paymentId 置 `null` 或 `redeem:<code>`）。
   - 写 `redeem_code_usages`（`credits_awarded=0`）与 `balance_transactions` 审计记录。

`validateRedeemCode()` 返回扩展字段：
- `redeemType`
- `periodCardPlanName`（期卡类型时）

`batchCreate()` 支持 `redeemType`、`periodCardPlanId`。

### 2.3 Admin 兑换码管理
**文件**: `api-server/src/routes/admin/redeem-codes.ts`、`admin-web/src/pages/marketing/RedeemCodeList.tsx`、`admin-web/src/services/redeem-codes.ts`

后端 Schema 增加：
- `redeemType: 'credits' | 'period_card'`
- `periodCardPlanId?: string`

校验规则：
- `redeemType='period_card'` 时，`periodCardPlanId` 必填。
- `redeemType='period_card'` 时允许 `creditsAmount=0`。

前端：
- 新增“兑换类型”下拉。
- 选择期卡时展示套餐下拉（来源 `/admin/period-cards/plans`）。
- 列表展示类型标签。

### 2.4 客户端兼容
**文件**: 桌面端兑换码 IPC / store

兑换成功后按 `redeemType` 处理：
- `credits`：刷新余额。
- `period_card`：刷新当前期卡信息（不是只刷新余额）。

---

## M3：Admin 期卡管理增强（赠送 + 延期）

### 3.1 新增后端接口
**文件**: `api-server/src/routes/admin/period-cards.ts`

1) `POST /admin/period-cards/records/grant`
```ts
const grantSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
});
```
- 仅允许无 active 卡用户。
- 调用 `activatePeriodCard(..., paymentId=null)` 或 `grantPeriodCard(...)`。
- 记录审计日志。

2) `POST /admin/period-cards/records/:id/extend`
```ts
const extendSchema = z.object({
  days: z.number().int().min(1).max(365),
});
```
- 仅允许 `status='active'`。
- SQL 使用安全参数化（不要 `interval '$1 days'`）：
```sql
UPDATE user_period_cards
SET expires_at = expires_at + ($1 * INTERVAL '1 day'),
    updated_at = NOW()
WHERE id = $2
  AND status = 'active'
RETURNING id;
```
- 记录审计日志（含操作人、延期天数、原到期时间、新到期时间）。

### 3.2 Admin 前端
**文件**: `admin-web/src/pages/marketing/PeriodCardSubscriptions.tsx`、`admin-web/src/services/period-cards.ts`

- 列表 active 行显示“延期”按钮。
- 页面提供“赠送期卡”入口。
- service 增加 `grantRecord`、`extendRecord`。

---

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `api-server/src/routes/billing.ts` | M1: 购买接口 active 卡拦截 |
| `api-server/src/services/stripe.ts` | M1: 购买回调/补单防叠加 + 状态闭环 |
| `api-server/src/services/xunhupay.ts` | M1: 购买回调/补单防叠加 + 状态闭环 |
| `api-server/src/db/migrations/0028_redeem_code_period_card.sql` | M2: redeem_codes 新增类型字段 |
| `api-server/src/db/migrations/run_migrations.sql` | M2: 注册 0028 |
| `api-server/src/db/schema.ts` | M2: schema 同步新增字段 |
| `api-server/src/services/period-card.ts` | M2/M3: 激活方法支持非支付来源 |
| `api-server/src/services/redeem-code.ts` | M2: 积分/期卡双模式兑换 |
| `api-server/src/routes/admin/redeem-codes.ts` | M2: 创建/批量创建支持期卡 |
| `admin-web/src/pages/marketing/RedeemCodeList.tsx` | M2: 管理 UI 扩展 |
| `admin-web/src/services/redeem-codes.ts` | M2: 类型定义扩展 |
| `api-server/src/routes/admin/period-cards.ts` | M3: grant/extend 接口 |
| `admin-web/src/pages/marketing/PeriodCardSubscriptions.tsx` | M3: 赠送/延期交互 |
| `admin-web/src/services/period-cards.ts` | M3: API 客户端扩展 |

---

## 验证矩阵（必须通过）

1. **防叠加接口**：有 active 卡下单返回 400；无卡可下单。
2. **防叠加回调**：已支付但命中 active 卡时，订单进入 `needs_review`（或退款成功），不得覆盖旧卡。
3. **升级不受影响**：`/upgrade-period-card` 正常，旧卡 `upgraded`、新卡 `active`。
4. **兑换码-积分**：旧路径行为不变。
5. **兑换码-期卡**：无卡用户可兑换并激活；有卡用户拒绝。
6. **Admin 赠送**：无卡成功，有卡拒绝。
7. **Admin 延期**：active 卡到期时间按天增加，审计日志完整。
8. **并发测试**：同一用户并发购买/兑换仅允许 1 张 active 卡，其他请求被拒绝并有可追踪结果。
9. **幂等测试**：同一支付回调重复投递，不重复发卡/不重复扣费。
10. **补单测试**：补单路径与主回调行为一致。
