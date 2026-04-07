-- ============================================================
-- 0016_spending_limits.sql - 积分消费限额
-- 为 user_balances 添加积分体系的每日/每月消费限额字段
-- 为 system_configs 添加默认积分限额配置
-- ============================================================

-- ============================================================
-- 1. user_balances 添加积分限额字段
-- ============================================================
ALTER TABLE user_balances ADD COLUMN IF NOT EXISTS daily_credits_limit DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE user_balances ADD COLUMN IF NOT EXISTS monthly_credits_limit DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_balances.daily_credits_limit IS '每日积分消费限额，0表示无限制';
COMMENT ON COLUMN user_balances.monthly_credits_limit IS '每月积分消费限额，0表示无限制';

-- 非负约束
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_balances_daily_credits_limit_non_negative'
    ) THEN
        ALTER TABLE user_balances ADD CONSTRAINT user_balances_daily_credits_limit_non_negative CHECK (daily_credits_limit >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_balances_monthly_credits_limit_non_negative'
    ) THEN
        ALTER TABLE user_balances ADD CONSTRAINT user_balances_monthly_credits_limit_non_negative CHECK (monthly_credits_limit >= 0);
    END IF;
END $$;

-- ============================================================
-- 2. system_configs 添加默认积分限额配置
-- ============================================================
INSERT INTO system_configs (key, value, description) VALUES
    ('default_daily_credits_limit', '0', '默认每日积分消费限额，0表示无限制'),
    ('default_monthly_credits_limit', '0', '默认每月积分消费限额，0表示无限制')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 3. 为 balance_transactions 添加索引优化消费聚合查询
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_type_created
    ON balance_transactions (user_id, type, created_at)
    WHERE type = 'usage';
