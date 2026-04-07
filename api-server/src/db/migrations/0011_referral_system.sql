-- ==========================================
-- 分销系统数据库迁移
-- ==========================================

-- 分销配置
CREATE TABLE IF NOT EXISTS referral_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    commission_rate DECIMAL(5,2) DEFAULT 10.00,
    commission_type VARCHAR(20) DEFAULT 'percentage',
    fixed_amount DECIMAL(10,2) DEFAULT 0,
    min_withdrawal DECIMAL(10,2) DEFAULT 10.00,
    max_levels INTEGER DEFAULT 1,
    level2_rate DECIMAL(5,2) DEFAULT 5.00,
    is_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 邀请码
CREATE TABLE IF NOT EXISTS referral_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    code VARCHAR(20) NOT NULL UNIQUE,
    description VARCHAR(200),
    usage_count INTEGER DEFAULT 0,
    max_usage INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

-- 推荐关系
CREATE TABLE IF NOT EXISTS referral_relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES users(id),
    referred_id UUID NOT NULL REFERENCES users(id),
    referral_code_id UUID REFERENCES referral_codes(id),
    level INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_relations_referrer ON referral_relations(referrer_id);

-- 佣金记录
CREATE TABLE IF NOT EXISTS referral_commissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES users(id),
    referred_id UUID NOT NULL REFERENCES users(id),
    order_id UUID,
    order_amount DECIMAL(10,2) NOT NULL,
    commission_rate DECIMAL(5,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    level INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer ON referral_commissions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON referral_commissions(status);

-- 幂等性唯一索引：同一订单+推荐人+层级不重复生成佣金
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_commissions_order_referrer_level
    ON referral_commissions (order_id, referrer_id, level);

-- 提现记录
CREATE TABLE IF NOT EXISTS referral_withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_account VARCHAR(200),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_user ON referral_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_status ON referral_withdrawals(status);

-- 插入默认配置
INSERT INTO referral_config (commission_rate, commission_type, min_withdrawal, max_levels)
VALUES (10.00, 'percentage', 10.00, 1)
ON CONFLICT DO NOTHING;
