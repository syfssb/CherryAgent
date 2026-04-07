-- ============================================================
-- 0002_billing.sql - 余额与计费
-- 创建用户余额、充值记录、使用记录、余额流水表
-- ============================================================

-- ============================================================
-- 支付状态枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 余额交易类型枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE balance_transaction_type AS ENUM (
        'recharge',           -- 充值
        'welcome_bonus',      -- 新用户奖励
        'consumption',        -- API 消费
        'refund',             -- 退款
        'adjustment',         -- 管理员调整
        'freeze',             -- 冻结
        'unfreeze'            -- 解冻
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 使用记录状态枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE usage_status AS ENUM ('success', 'failed', 'timeout', 'rate_limited');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- user_balances 表 - 用户余额
-- ============================================================
CREATE TABLE IF NOT EXISTS user_balances (
    -- 主键（使用 user_id 作为主键，一对一关系）
    user_id UUID PRIMARY KEY,

    -- 余额信息（以分为单位，避免浮点数精度问题）
    balance_cents BIGINT NOT NULL DEFAULT 0,           -- 可用余额
    frozen_cents BIGINT NOT NULL DEFAULT 0,            -- 冻结余额
    total_charged_cents BIGINT NOT NULL DEFAULT 0,     -- 累计充值
    total_consumed_cents BIGINT NOT NULL DEFAULT 0,    -- 累计消费

    -- 限额设置（0 表示无限制）
    daily_limit_cents BIGINT NOT NULL DEFAULT 0,       -- 每日消费限额
    monthly_limit_cents BIGINT NOT NULL DEFAULT 0,     -- 每月消费限额

    -- 乐观锁版本号
    version INTEGER NOT NULL DEFAULT 0,

    -- 时间戳
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 外键约束
    CONSTRAINT fk_user_balances_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    -- 余额非负约束
    CONSTRAINT user_balances_balance_non_negative CHECK (balance_cents >= 0),
    CONSTRAINT user_balances_frozen_non_negative CHECK (frozen_cents >= 0),
    CONSTRAINT user_balances_total_charged_non_negative CHECK (total_charged_cents >= 0),
    CONSTRAINT user_balances_total_consumed_non_negative CHECK (total_consumed_cents >= 0)
);

-- user_balances 表索引
CREATE INDEX IF NOT EXISTS idx_user_balances_balance ON user_balances(balance_cents);
CREATE INDEX IF NOT EXISTS idx_user_balances_updated_at ON user_balances(updated_at);

-- user_balances 表注释
COMMENT ON TABLE user_balances IS '用户余额表';
COMMENT ON COLUMN user_balances.user_id IS '用户ID（主键）';
COMMENT ON COLUMN user_balances.balance_cents IS '可用余额（分）';
COMMENT ON COLUMN user_balances.frozen_cents IS '冻结余额（分）';
COMMENT ON COLUMN user_balances.total_charged_cents IS '累计充值金额（分）';
COMMENT ON COLUMN user_balances.total_consumed_cents IS '累计消费金额（分）';
COMMENT ON COLUMN user_balances.daily_limit_cents IS '每日消费限额（分），0表示无限制';
COMMENT ON COLUMN user_balances.monthly_limit_cents IS '每月消费限额（分），0表示无限制';
COMMENT ON COLUMN user_balances.version IS '乐观锁版本号，用于并发控制';
COMMENT ON COLUMN user_balances.updated_at IS '更新时间';

-- ============================================================
-- recharge_records 表 - 充值记录
-- ============================================================
CREATE TABLE IF NOT EXISTS recharge_records (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 关联用户
    user_id UUID NOT NULL,

    -- 金额信息
    amount_cents BIGINT NOT NULL,                      -- 充值金额（分）
    currency VARCHAR(3) NOT NULL DEFAULT 'CNY',        -- 货币代码

    -- 支付渠道
    payment_channel VARCHAR(50) NOT NULL,              -- stripe, xunhupay, manual
    payment_status payment_status NOT NULL DEFAULT 'pending',

    -- 外部订单号
    external_order_id VARCHAR(100),                    -- 内部订单号
    stripe_session_id VARCHAR(200),                    -- Stripe Checkout Session ID
    xunhupay_order_id VARCHAR(100),                    -- 虎皮椒订单号

    -- 附加信息
    metadata JSONB DEFAULT '{}'::jsonb,                -- 附加元数据

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,                          -- 完成时间

    -- 外键约束
    CONSTRAINT fk_recharge_records_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    -- 金额正数约束
    CONSTRAINT recharge_records_amount_positive CHECK (amount_cents > 0)
);

-- recharge_records 表索引
CREATE INDEX IF NOT EXISTS idx_recharge_records_user_id ON recharge_records(user_id);
CREATE INDEX IF NOT EXISTS idx_recharge_records_payment_status ON recharge_records(payment_status);
CREATE INDEX IF NOT EXISTS idx_recharge_records_payment_channel ON recharge_records(payment_channel);
CREATE INDEX IF NOT EXISTS idx_recharge_records_created_at ON recharge_records(created_at);
CREATE INDEX IF NOT EXISTS idx_recharge_records_external_order_id ON recharge_records(external_order_id) WHERE external_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recharge_records_stripe_session_id ON recharge_records(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recharge_records_xunhupay_order_id ON recharge_records(xunhupay_order_id) WHERE xunhupay_order_id IS NOT NULL;

-- recharge_records 表注释
COMMENT ON TABLE recharge_records IS '充值记录表';
COMMENT ON COLUMN recharge_records.id IS '记录唯一标识符';
COMMENT ON COLUMN recharge_records.user_id IS '用户ID';
COMMENT ON COLUMN recharge_records.amount_cents IS '充值金额（分）';
COMMENT ON COLUMN recharge_records.currency IS '货币代码（ISO 4217）';
COMMENT ON COLUMN recharge_records.payment_channel IS '支付渠道：stripe, xunhupay, manual';
COMMENT ON COLUMN recharge_records.payment_status IS '支付状态';
COMMENT ON COLUMN recharge_records.external_order_id IS '内部订单号';
COMMENT ON COLUMN recharge_records.stripe_session_id IS 'Stripe Checkout Session ID';
COMMENT ON COLUMN recharge_records.xunhupay_order_id IS '虎皮椒订单号';
COMMENT ON COLUMN recharge_records.metadata IS '附加元数据（JSON格式）';
COMMENT ON COLUMN recharge_records.created_at IS '创建时间';
COMMENT ON COLUMN recharge_records.completed_at IS '完成时间';

-- ============================================================
-- usage_records 表 - API 使用记录
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_records (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 关联信息
    user_id UUID NOT NULL,
    api_key_id UUID,                                   -- 使用的 API 密钥
    request_id VARCHAR(100),                           -- 请求追踪 ID

    -- 模型信息
    model VARCHAR(100) NOT NULL,                       -- 模型标识符

    -- Token 使用量
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,  -- 缓存创建 token
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,      -- 缓存读取 token

    -- 费用（以分为单位）
    input_cost_cents BIGINT NOT NULL DEFAULT 0,
    output_cost_cents BIGINT NOT NULL DEFAULT 0,
    total_cost_cents BIGINT NOT NULL DEFAULT 0,

    -- 渠道信息
    channel_id UUID,                                   -- 使用的渠道
    upstream_latency_ms INTEGER,                       -- 上游响应延迟（毫秒）

    -- 状态
    status usage_status NOT NULL DEFAULT 'success',
    error_message TEXT,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 外键约束
    CONSTRAINT fk_usage_records_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_usage_records_api_key
        FOREIGN KEY (api_key_id)
        REFERENCES user_api_keys(id)
        ON DELETE SET NULL
);

-- usage_records 表索引（针对高频查询优化）
CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_api_key_id ON usage_records(api_key_id) WHERE api_key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_records_model ON usage_records(model);
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_records_status ON usage_records(status);
CREATE INDEX IF NOT EXISTS idx_usage_records_channel_id ON usage_records(channel_id) WHERE channel_id IS NOT NULL;

-- 复合索引：用于用户账单查询
CREATE INDEX IF NOT EXISTS idx_usage_records_user_created ON usage_records(user_id, created_at DESC);
-- 复合索引：用于模型使用统计
CREATE INDEX IF NOT EXISTS idx_usage_records_model_created ON usage_records(model, created_at DESC);

-- usage_records 表注释
COMMENT ON TABLE usage_records IS 'API 使用记录表';
COMMENT ON COLUMN usage_records.id IS '记录唯一标识符';
COMMENT ON COLUMN usage_records.user_id IS '用户ID';
COMMENT ON COLUMN usage_records.api_key_id IS '使用的 API 密钥ID';
COMMENT ON COLUMN usage_records.request_id IS '请求追踪ID';
COMMENT ON COLUMN usage_records.model IS '使用的模型标识符';
COMMENT ON COLUMN usage_records.input_tokens IS '输入 token 数量';
COMMENT ON COLUMN usage_records.output_tokens IS '输出 token 数量';
COMMENT ON COLUMN usage_records.cache_creation_tokens IS '缓存创建 token 数量';
COMMENT ON COLUMN usage_records.cache_read_tokens IS '缓存读取 token 数量';
COMMENT ON COLUMN usage_records.input_cost_cents IS '输入费用（分）';
COMMENT ON COLUMN usage_records.output_cost_cents IS '输出费用（分）';
COMMENT ON COLUMN usage_records.total_cost_cents IS '总费用（分）';
COMMENT ON COLUMN usage_records.channel_id IS '使用的渠道ID';
COMMENT ON COLUMN usage_records.upstream_latency_ms IS '上游响应延迟（毫秒）';
COMMENT ON COLUMN usage_records.status IS '请求状态';
COMMENT ON COLUMN usage_records.error_message IS '错误信息';
COMMENT ON COLUMN usage_records.created_at IS '创建时间';

-- ============================================================
-- balance_transactions 表 - 余额流水
-- ============================================================
CREATE TABLE IF NOT EXISTS balance_transactions (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 关联用户
    user_id UUID NOT NULL,

    -- 交易信息
    type balance_transaction_type NOT NULL,
    amount_cents BIGINT NOT NULL,                      -- 变动金额（可正可负）
    balance_before_cents BIGINT NOT NULL,              -- 变动前余额
    balance_after_cents BIGINT NOT NULL,               -- 变动后余额

    -- 关联记录
    reference_type VARCHAR(50),                        -- 关联类型：recharge, usage, refund 等
    reference_id UUID,                                 -- 关联记录ID

    -- 描述
    description TEXT,

    -- 操作人（管理员调整时使用）
    operator_id UUID,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 外键约束
    CONSTRAINT fk_balance_transactions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- balance_transactions 表索引
CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_id ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_type ON balance_transactions(type);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_created_at ON balance_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_reference ON balance_transactions(reference_type, reference_id)
    WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

-- 复合索引：用于用户账单查询
CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_created ON balance_transactions(user_id, created_at DESC);

-- balance_transactions 表注释
COMMENT ON TABLE balance_transactions IS '余额流水表';
COMMENT ON COLUMN balance_transactions.id IS '记录唯一标识符';
COMMENT ON COLUMN balance_transactions.user_id IS '用户ID';
COMMENT ON COLUMN balance_transactions.type IS '交易类型';
COMMENT ON COLUMN balance_transactions.amount_cents IS '变动金额（分），正数为增加，负数为减少';
COMMENT ON COLUMN balance_transactions.balance_before_cents IS '变动前余额（分）';
COMMENT ON COLUMN balance_transactions.balance_after_cents IS '变动后余额（分）';
COMMENT ON COLUMN balance_transactions.reference_type IS '关联记录类型';
COMMENT ON COLUMN balance_transactions.reference_id IS '关联记录ID';
COMMENT ON COLUMN balance_transactions.description IS '交易描述';
COMMENT ON COLUMN balance_transactions.operator_id IS '操作人ID（管理员调整时使用）';
COMMENT ON COLUMN balance_transactions.created_at IS '创建时间';

-- ============================================================
-- 触发器：自动更新 user_balances.updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_user_balances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = NEW.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_balances_updated_at ON user_balances;
CREATE TRIGGER trigger_user_balances_updated_at
    BEFORE UPDATE ON user_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_user_balances_updated_at();

-- ============================================================
-- 触发器：新用户自动创建余额记录
-- ============================================================
CREATE OR REPLACE FUNCTION create_user_balance_on_user_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_balances (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_user_balance ON users;
CREATE TRIGGER trigger_create_user_balance
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_balance_on_user_insert();
