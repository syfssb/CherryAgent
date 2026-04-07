-- ============================================================
-- 0028_redeem_code_period_card.sql
-- 兑换码支持期卡类型
-- ============================================================

-- 兑换类型: 'credits'（积分）| 'period_card'（期卡）
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS redeem_type VARCHAR(20) NOT NULL DEFAULT 'credits';

-- 关联的期卡套餐
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS period_card_plan_id UUID REFERENCES period_card_plans(id) ON DELETE SET NULL;
