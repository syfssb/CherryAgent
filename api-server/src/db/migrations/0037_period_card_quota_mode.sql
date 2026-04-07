-- ============================================================
-- 0037_period_card_quota_mode.sql
-- 期卡双模式：每日重置 (daily) + 总量池 (total)
-- ============================================================

-- period_card_plans: 新增 quota_mode, total_credits
ALTER TABLE period_card_plans
  ADD COLUMN IF NOT EXISTS quota_mode VARCHAR(10) NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS total_credits DECIMAL(12,2) NOT NULL DEFAULT 0;

-- user_period_cards: 新增 quota_mode, total_credits, total_remaining
ALTER TABLE user_period_cards
  ADD COLUMN IF NOT EXISTS quota_mode VARCHAR(10) NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS total_credits DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_remaining DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 约束（用 DO 块安全添加，避免重复执行报错）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_plans_quota_mode') THEN
    ALTER TABLE period_card_plans ADD CONSTRAINT chk_plans_quota_mode CHECK (quota_mode IN ('daily', 'total'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cards_quota_mode') THEN
    ALTER TABLE user_period_cards ADD CONSTRAINT chk_cards_quota_mode CHECK (quota_mode IN ('daily', 'total'));
  END IF;
END $$;
