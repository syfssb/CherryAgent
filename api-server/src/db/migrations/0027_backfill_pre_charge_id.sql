-- ============================================================
-- 回填 period_card_usage_logs.pre_charge_id
-- ============================================================
-- 背景：0026_period_card_usage_logs_pre_charge_id.sql 新增了 pre_charge_id 字段，
--       但历史记录的 pre_charge_id 为 NULL，需要从 balance_transactions 中回填。
--
-- 匹配逻辑：
--   1. balance_transactions 中 type='precharge' 且 metadata->>'periodCardId' IS NOT NULL
--      的记录包含 preChargeId（存在 metadata->>'preChargeId'）
--   2. 通过 user_id + user_period_card_id(= metadata->>'periodCardId') 关联
--   3. 时间窗口：usage_log.created_at 与 balance_transaction.created_at 差值在 5 秒内
--      （preCharge 和 usage_log 在同一个事务中写入，时间差极小）
--   4. 使用 ROW_NUMBER 按时间差排序，只取最近的一条，避免一对多歧义
--   5. 额外校验：quota_used 金额一致（balance_transactions.metadata->>'quotaUsed' = usage_log.quota_used）
--      进一步确保匹配精确性
--   6. 排除已被其他 usage_log 占用的 preChargeId（pre_charge_id 有唯一索引）
--
-- 幂等性：只更新 pre_charge_id IS NULL 的行，重复执行安全。
-- ============================================================

BEGIN;

WITH candidate_matches AS (
  -- 从 balance_transactions 中找出所有 precharge 类型、且关联了期卡的记录
  SELECT
    bt.user_id,
    bt.metadata->>'preChargeId'   AS pre_charge_id,
    bt.metadata->>'periodCardId'  AS period_card_id,
    -- quotaUsed 在 metadata 中是数字类型，转为 text 再转 numeric 用于比较
    (bt.metadata->>'quotaUsed')::numeric AS quota_used_from_bt,
    bt.created_at                 AS bt_created_at
  FROM balance_transactions bt
  WHERE bt.type = 'precharge'
    AND bt.metadata->>'preChargeId'  IS NOT NULL
    AND bt.metadata->>'periodCardId' IS NOT NULL
    -- 排除已经被回填过的 preChargeId（唯一索引保护）
    AND NOT EXISTS (
      SELECT 1 FROM period_card_usage_logs existing
      WHERE existing.pre_charge_id = bt.metadata->>'preChargeId'
    )
),
ranked AS (
  -- 将 usage_log 与 candidate 按 user_id + period_card_id 关联，
  -- 并按时间差排序，取最近的一条
  SELECT
    ul.id                          AS usage_log_id,
    cm.pre_charge_id,
    ROW_NUMBER() OVER (
      PARTITION BY ul.id
      ORDER BY ABS(EXTRACT(EPOCH FROM (ul.created_at - cm.bt_created_at)))
    ) AS rn_by_log,
    ROW_NUMBER() OVER (
      PARTITION BY cm.pre_charge_id
      ORDER BY ABS(EXTRACT(EPOCH FROM (ul.created_at - cm.bt_created_at)))
    ) AS rn_by_bt
  FROM period_card_usage_logs ul
  JOIN candidate_matches cm
    ON  cm.user_id        = ul.user_id
    AND cm.period_card_id = ul.user_period_card_id::text
    -- 时间窗口：5 秒内（同一事务写入，通常 < 1 秒）
    AND ABS(EXTRACT(EPOCH FROM (ul.created_at - cm.bt_created_at))) <= 5
    -- 金额校验：quota_used 必须一致
    AND cm.quota_used_from_bt = ul.quota_used
  WHERE ul.pre_charge_id IS NULL
),
unique_matches AS (
  -- 双向去重：每条 usage_log 只匹配一条 preChargeId，每条 preChargeId 也只匹配一条 usage_log
  SELECT usage_log_id, pre_charge_id
  FROM ranked
  WHERE rn_by_log = 1 AND rn_by_bt = 1
),
updated AS (
  UPDATE period_card_usage_logs ul
  SET pre_charge_id = um.pre_charge_id
  FROM unique_matches um
  WHERE ul.id = um.usage_log_id
    AND ul.pre_charge_id IS NULL
  RETURNING ul.id
)
SELECT COUNT(*) AS backfilled_count FROM updated;

COMMIT;
