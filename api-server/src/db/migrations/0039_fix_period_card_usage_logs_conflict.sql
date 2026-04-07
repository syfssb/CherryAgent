-- 修复 settleCredits ON CONFLICT 报错 (42P10)
-- billing.ts 使用 ON CONFLICT (user_period_card_id, pre_charge_id) 但数据库无对应唯一约束
-- 一次 preCharge 对每张期卡只写一条日志，(user_period_card_id, pre_charge_id) 天然唯一

-- 0. 合并重复数据（将同一 card+preCharge 的多行 quota_used 累加到保留行，再删除多余行）
--    保留每组 created_at DESC, id DESC 最新一条

-- 0a. 将保留行的 quota_used 更新为组内总和
WITH duplicates AS (
  SELECT user_period_card_id, pre_charge_id,
         SUM(quota_used) AS total_quota,
         (ARRAY_AGG(id ORDER BY created_at DESC, id DESC))[1] AS keep_id
  FROM period_card_usage_logs
  WHERE pre_charge_id IS NOT NULL
  GROUP BY user_period_card_id, pre_charge_id
  HAVING COUNT(*) > 1
)
UPDATE period_card_usage_logs l
SET quota_used = d.total_quota
FROM duplicates d
WHERE l.id = d.keep_id;

-- 0b. 删除同组中的非保留行
WITH duplicates AS (
  SELECT user_period_card_id, pre_charge_id,
         (ARRAY_AGG(id ORDER BY created_at DESC, id DESC))[1] AS keep_id
  FROM period_card_usage_logs
  WHERE pre_charge_id IS NOT NULL
  GROUP BY user_period_card_id, pre_charge_id
  HAVING COUNT(*) > 1
)
DELETE FROM period_card_usage_logs l
USING duplicates d
WHERE l.user_period_card_id = d.user_period_card_id
  AND l.pre_charge_id = d.pre_charge_id
  AND l.id != d.keep_id;

-- 1. 创建复合唯一 partial index
CREATE UNIQUE INDEX IF NOT EXISTS period_card_usage_logs_card_precharge_uidx
  ON period_card_usage_logs (user_period_card_id, pre_charge_id)
  WHERE pre_charge_id IS NOT NULL;

-- 2. 删除冗余的 pre_charge_id 单列普通索引
--    所有按 pre_charge_id 查询的地方都同时带 user_period_card_id 条件，
--    新复合索引完全覆盖（billing.ts:804, billing.ts:1180）
DROP INDEX IF EXISTS period_card_usage_logs_pre_charge_id_idx;
