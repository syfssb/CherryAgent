-- 为期卡使用日志增加 pre_charge_id，用于按预扣单精确回滚与结算修正

ALTER TABLE period_card_usage_logs
  ADD COLUMN IF NOT EXISTS pre_charge_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS period_card_usage_logs_pre_charge_id_uidx
  ON period_card_usage_logs (pre_charge_id);
