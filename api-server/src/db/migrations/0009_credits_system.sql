-- ============================================================
-- 0009_credits_system.sql - 积分计费体系
-- 积分体系: 0.1 RMB = 1 积分 (1 RMB = 10 积分)
-- ============================================================

-- ============================================================
-- 1. models 表添加积分价格字段
-- 原有 input_price_per_mtok 等字段以美分为单位，保留兼容
-- 新增 credits 字段以积分为单位
-- ============================================================
ALTER TABLE models ADD COLUMN IF NOT EXISTS input_credits_per_mtok DECIMAL(10,4) DEFAULT 0;
ALTER TABLE models ADD COLUMN IF NOT EXISTS output_credits_per_mtok DECIMAL(10,4) DEFAULT 0;
ALTER TABLE models ADD COLUMN IF NOT EXISTS cache_read_credits_per_mtok DECIMAL(10,4) DEFAULT 0;
ALTER TABLE models ADD COLUMN IF NOT EXISTS cache_write_credits_per_mtok DECIMAL(10,4) DEFAULT 0;

COMMENT ON COLUMN models.input_credits_per_mtok IS '输入价格（积分/百万token）';
COMMENT ON COLUMN models.output_credits_per_mtok IS '输出价格（积分/百万token）';
COMMENT ON COLUMN models.cache_read_credits_per_mtok IS '缓存读取价格（积分/百万token）';
COMMENT ON COLUMN models.cache_write_credits_per_mtok IS '缓存写入价格（积分/百万token）';

-- ============================================================
-- 2. user_balances 添加积分字段
-- ============================================================
ALTER TABLE user_balances ADD COLUMN IF NOT EXISTS credits DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE user_balances ADD COLUMN IF NOT EXISTS total_credits_purchased DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE user_balances ADD COLUMN IF NOT EXISTS total_credits_consumed DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_balances.credits IS '当前可用积分';
COMMENT ON COLUMN user_balances.total_credits_purchased IS '累计购买积分';
COMMENT ON COLUMN user_balances.total_credits_consumed IS '累计消费积分';

-- 积分非负约束
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_balances_credits_non_negative'
    ) THEN
        ALTER TABLE user_balances ADD CONSTRAINT user_balances_credits_non_negative CHECK (credits >= 0);
    END IF;
END $$;

-- ============================================================
-- 3. usage_records / usage_logs 添加积分消耗字段
-- ============================================================
-- usage_logs 表（Drizzle schema 使用的表）
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS credits_consumed DECIMAL(10,4) DEFAULT 0;
COMMENT ON COLUMN usage_logs.credits_consumed IS '本次请求消耗的积分';

-- usage_records 表（SQL 迁移创建的表，如果存在）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage_records') THEN
        ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS credits_consumed DECIMAL(10,4) DEFAULT 0;
    END IF;
END $$;

-- ============================================================
-- 4. balance_transactions 添加积分变动字段
-- ============================================================
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS credits_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS credits_before DECIMAL(12,2) DEFAULT 0;
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS credits_after DECIMAL(12,2) DEFAULT 0;

COMMENT ON COLUMN balance_transactions.credits_amount IS '积分变动量（正数增加，负数减少）';
COMMENT ON COLUMN balance_transactions.credits_before IS '变动前积分余额';
COMMENT ON COLUMN balance_transactions.credits_after IS '变动后积分余额';

-- ============================================================
-- 5. 创建积分充值套餐表
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    credits DECIMAL(10,2) NOT NULL,
    price_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'CNY',
    bonus_credits DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT credit_packages_credits_positive CHECK (credits > 0),
    CONSTRAINT credit_packages_price_positive CHECK (price_cents > 0),
    CONSTRAINT credit_packages_bonus_non_negative CHECK (bonus_credits >= 0)
);

CREATE INDEX IF NOT EXISTS idx_credit_packages_is_enabled ON credit_packages(is_enabled);
CREATE INDEX IF NOT EXISTS idx_credit_packages_sort_order ON credit_packages(sort_order);

COMMENT ON TABLE credit_packages IS '积分充值套餐表';
COMMENT ON COLUMN credit_packages.id IS '套餐唯一标识符';
COMMENT ON COLUMN credit_packages.name IS '套餐名称';
COMMENT ON COLUMN credit_packages.description IS '套餐描述';
COMMENT ON COLUMN credit_packages.credits IS '包含积分数';
COMMENT ON COLUMN credit_packages.price_cents IS '价格（分）';
COMMENT ON COLUMN credit_packages.currency IS '货币代码';
COMMENT ON COLUMN credit_packages.bonus_credits IS '赠送积分数';
COMMENT ON COLUMN credit_packages.is_enabled IS '是否启用';
COMMENT ON COLUMN credit_packages.sort_order IS '排序顺序';

-- 触发器：自动更新 credit_packages.updated_at
CREATE OR REPLACE FUNCTION update_credit_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_credit_packages_updated_at ON credit_packages;
CREATE TRIGGER trigger_credit_packages_updated_at
    BEFORE UPDATE ON credit_packages
    FOR EACH ROW
    EXECUTE FUNCTION update_credit_packages_updated_at();

-- ============================================================
-- 6. 插入默认充值套餐
-- ============================================================
INSERT INTO credit_packages (name, description, credits, price_cents, currency, bonus_credits, sort_order)
VALUES
    ('体验包', '适合新用户体验', 10, 100, 'CNY', 0, 10),
    ('基础包', '日常使用推荐', 50, 500, 'CNY', 5, 20),
    ('标准包', '高频使用推荐', 100, 1000, 'CNY', 15, 30),
    ('专业包', '专业用户首选', 500, 5000, 'CNY', 100, 40),
    ('企业包', '团队协作推荐', 1000, 10000, 'CNY', 250, 50)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. 更新默认模型的积分价格
-- 积分价格 = 美分价格 / 100 * 汇率(7.2) * 10(积分/元) * 加价倍率(2)
-- 简化: 积分价格 ≈ 美分价格 * 1.44
-- 但为了简洁，直接设置合理的积分价格
-- ============================================================
UPDATE models SET
    input_credits_per_mtok = CASE id
        WHEN 'gpt-4o' THEN 2.5
        WHEN 'gpt-4o-mini' THEN 0.15
        WHEN 'gpt-4-turbo' THEN 10
        WHEN 'gpt-3.5-turbo' THEN 0.5
        WHEN 'claude-3-5-sonnet-20241022' THEN 3
        WHEN 'claude-3-5-haiku-20241022' THEN 0.8
        WHEN 'claude-3-opus-20240229' THEN 15
        WHEN 'gemini-1.5-pro' THEN 1.25
        WHEN 'gemini-1.5-flash' THEN 0.08
        WHEN 'deepseek-chat' THEN 0.14
        WHEN 'deepseek-coder' THEN 0.14
        ELSE 3
    END,
    output_credits_per_mtok = CASE id
        WHEN 'gpt-4o' THEN 10
        WHEN 'gpt-4o-mini' THEN 0.6
        WHEN 'gpt-4-turbo' THEN 30
        WHEN 'gpt-3.5-turbo' THEN 1.5
        WHEN 'claude-3-5-sonnet-20241022' THEN 15
        WHEN 'claude-3-5-haiku-20241022' THEN 4
        WHEN 'claude-3-opus-20240229' THEN 75
        WHEN 'gemini-1.5-pro' THEN 5
        WHEN 'gemini-1.5-flash' THEN 0.3
        WHEN 'deepseek-chat' THEN 0.28
        WHEN 'deepseek-coder' THEN 0.28
        ELSE 15
    END,
    cache_read_credits_per_mtok = CASE id
        WHEN 'gpt-4o' THEN 1.25
        WHEN 'gpt-4o-mini' THEN 0.08
        WHEN 'claude-3-5-sonnet-20241022' THEN 0.3
        WHEN 'claude-3-5-haiku-20241022' THEN 0.08
        WHEN 'claude-3-opus-20240229' THEN 1.5
        WHEN 'gemini-1.5-pro' THEN 0.31
        WHEN 'gemini-1.5-flash' THEN 0.02
        WHEN 'deepseek-chat' THEN 0.01
        WHEN 'deepseek-coder' THEN 0.01
        ELSE 0.3
    END,
    cache_write_credits_per_mtok = CASE id
        WHEN 'claude-3-5-sonnet-20241022' THEN 3.75
        WHEN 'claude-3-5-haiku-20241022' THEN 1
        WHEN 'claude-3-opus-20240229' THEN 18.75
        ELSE 0
    END
WHERE id IN (
    'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo',
    'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229',
    'gemini-1.5-pro', 'gemini-1.5-flash',
    'deepseek-chat', 'deepseek-coder'
);
