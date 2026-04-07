-- 允许多张 active 期卡并行（额度叠加，不叠加时长）
-- 1. 移除每用户仅一张 active 卡的唯一约束
-- 2. 新增 active+expires 复合条件索引（支持按到期时间升序取多卡）
-- 3. pre_charge_id 从唯一索引改为普通索引（一次 preCharge 会写多条期卡日志）
-- 4. usage_logs 新增 quota_used 列（记录每次请求实际使用的期卡额度）

-- 移除"每用户仅一张 active 卡"的唯一索引
DROP INDEX IF EXISTS user_period_cards_one_active_per_user;

-- 新增 active + expires_at 复合条件索引，支持"按到期时间升序取多卡"
CREATE INDEX IF NOT EXISTS user_period_cards_active_expires_idx
  ON user_period_cards (user_id, expires_at ASC) WHERE status = 'active';

-- 取消 pre_charge_id 唯一约束（一次 preCharge 会写多条期卡日志）
DROP INDEX IF EXISTS period_card_usage_logs_pre_charge_id_uidx;

-- 保留按 preCharge 查询性能（普通索引）
CREATE INDEX IF NOT EXISTS period_card_usage_logs_pre_charge_id_idx
  ON period_card_usage_logs (pre_charge_id);

-- usage_logs 新增 quota_used 列，记录每次请求实际使用的期卡额度
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS quota_used DECIMAL(12,2) NOT NULL DEFAULT 0;
