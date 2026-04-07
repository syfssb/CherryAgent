-- 折扣码表
CREATE TABLE IF NOT EXISTS discount_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',  -- percentage, fixed_amount, bonus_credits
    discount_value DECIMAL(10,2) NOT NULL,  -- 百分比(如10表示10%)或固定金额(分)或赠送积分数
    min_amount INTEGER DEFAULT 0,  -- 最低消费金额(分)
    max_discount INTEGER,  -- 最大折扣金额(分)，NULL 无上限
    usage_limit INTEGER,  -- 总使用次数限制，NULL 无限制
    per_user_limit INTEGER DEFAULT 1,  -- 每用户使用次数限制
    used_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    applicable_packages UUID[],  -- 适用的充值套餐，NULL 表示全部适用
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_discount_codes_active ON discount_codes(is_active);

-- 折扣码使用记录表
CREATE TABLE IF NOT EXISTS discount_code_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discount_code_id UUID NOT NULL REFERENCES discount_codes(id),
    user_id UUID NOT NULL REFERENCES users(id),
    order_id UUID,  -- 关联的充值订单
    original_amount INTEGER NOT NULL,  -- 原始金额(分)
    discount_amount INTEGER NOT NULL,  -- 折扣金额(分)
    final_amount INTEGER NOT NULL,  -- 最终金额(分)
    bonus_credits DECIMAL(10,2) DEFAULT 0,  -- 赠送积分
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_usages_code ON discount_code_usages(discount_code_id);
CREATE INDEX IF NOT EXISTS idx_discount_usages_user ON discount_code_usages(user_id);
