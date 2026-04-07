-- ============================================================
-- 0003_channels.sql - API 渠道配置
-- 创建渠道表、模型表、价格倍率表
-- ============================================================

-- ============================================================
-- API 提供商枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE api_provider AS ENUM (
        'openai',
        'anthropic',
        'google',
        'azure',
        'deepseek',
        'moonshot',
        'zhipu',
        'baidu',
        'alibaba',
        'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 渠道健康状态枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE channel_health_status AS ENUM ('healthy', 'degraded', 'unhealthy', 'unknown');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 价格倍率类型枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE price_multiplier_type AS ENUM ('model', 'user_group', 'time_based', 'promotion');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- channels 表 - API 渠道配置
-- ============================================================
CREATE TABLE IF NOT EXISTS channels (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 基本信息
    name VARCHAR(100) NOT NULL,
    provider api_provider NOT NULL,
    base_url VARCHAR(500) NOT NULL,

    -- 认证信息（加密存储）
    api_key_encrypted TEXT NOT NULL,

    -- 模型映射（将请求模型映射到实际模型）
    -- 格式: {"gpt-4": "gpt-4-turbo", "claude-3": "claude-3-sonnet"}
    model_mapping JSONB DEFAULT '{}'::jsonb,

    -- 负载均衡配置
    weight INTEGER NOT NULL DEFAULT 100,               -- 权重（0-100）
    priority INTEGER NOT NULL DEFAULT 0,               -- 优先级（越小越优先）

    -- 限流配置
    rpm_limit INTEGER DEFAULT 0,                       -- 每分钟请求数限制（0=无限制）
    tpm_limit INTEGER DEFAULT 0,                       -- 每分钟 token 数限制（0=无限制）
    daily_limit INTEGER DEFAULT 0,                     -- 每日请求数限制（0=无限制）

    -- 价格倍率（相对于基准价格）
    price_multiplier DECIMAL(5, 3) NOT NULL DEFAULT 1.000,

    -- 状态
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- 健康检查
    health_status channel_health_status NOT NULL DEFAULT 'unknown',
    last_health_check TIMESTAMPTZ,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 约束
    CONSTRAINT channels_weight_range CHECK (weight >= 0 AND weight <= 100),
    CONSTRAINT channels_price_multiplier_positive CHECK (price_multiplier > 0)
);

-- channels 表索引
CREATE INDEX IF NOT EXISTS idx_channels_provider ON channels(provider);
CREATE INDEX IF NOT EXISTS idx_channels_is_enabled ON channels(is_enabled);
CREATE INDEX IF NOT EXISTS idx_channels_health_status ON channels(health_status);
CREATE INDEX IF NOT EXISTS idx_channels_priority ON channels(priority DESC);
CREATE INDEX IF NOT EXISTS idx_channels_weight ON channels(weight DESC);

-- 复合索引：用于渠道选择
CREATE INDEX IF NOT EXISTS idx_channels_selection ON channels(is_enabled, health_status, priority DESC, weight DESC)
    WHERE is_enabled = TRUE;

-- channels 表注释
COMMENT ON TABLE channels IS 'API 渠道配置表';
COMMENT ON COLUMN channels.id IS '渠道唯一标识符';
COMMENT ON COLUMN channels.name IS '渠道名称';
COMMENT ON COLUMN channels.provider IS 'API 提供商';
COMMENT ON COLUMN channels.base_url IS 'API 基础URL';
COMMENT ON COLUMN channels.api_key_encrypted IS '加密的 API 密钥';
COMMENT ON COLUMN channels.model_mapping IS '模型映射配置（JSON格式）';
COMMENT ON COLUMN channels.weight IS '负载均衡权重（0-100）';
COMMENT ON COLUMN channels.priority IS '优先级（越高越优先选择）';
COMMENT ON COLUMN channels.rpm_limit IS '每分钟请求数限制（0=无限制）';
COMMENT ON COLUMN channels.tpm_limit IS '每分钟 token 数限制（0=无限制）';
COMMENT ON COLUMN channels.daily_limit IS '每日请求数限制（0=无限制）';
COMMENT ON COLUMN channels.price_multiplier IS '价格倍率（相对于基准价格）';
COMMENT ON COLUMN channels.is_enabled IS '是否启用';
COMMENT ON COLUMN channels.health_status IS '健康状态';
COMMENT ON COLUMN channels.last_health_check IS '最后健康检查时间';
COMMENT ON COLUMN channels.consecutive_failures IS '连续失败次数';
COMMENT ON COLUMN channels.created_at IS '创建时间';
COMMENT ON COLUMN channels.updated_at IS '更新时间';

-- ============================================================
-- models 表 - 模型定义
-- ============================================================
CREATE TABLE IF NOT EXISTS models (
    -- 主键（使用模型标识符作为主键）
    id VARCHAR(100) PRIMARY KEY,

    -- 显示信息
    display_name VARCHAR(200) NOT NULL,
    provider api_provider NOT NULL,

    -- 基准价格（每百万 token，以美分为单位）
    input_price_per_mtok INTEGER NOT NULL DEFAULT 0,           -- 输入价格
    output_price_per_mtok INTEGER NOT NULL DEFAULT 0,          -- 输出价格
    cache_read_price_per_mtok INTEGER DEFAULT 0,               -- 缓存读取价格
    cache_write_price_per_mtok INTEGER DEFAULT 0,              -- 缓存写入价格

    -- 长上下文价格（超过阈值后的价格）
    long_context_input_price INTEGER DEFAULT 0,
    long_context_output_price INTEGER DEFAULT 0,
    long_context_threshold INTEGER DEFAULT 0,                   -- 长上下文阈值（token数）

    -- 模型限制
    max_tokens INTEGER DEFAULT 4096,                            -- 最大输出 token
    max_context_length INTEGER DEFAULT 128000,                  -- 最大上下文长度

    -- 状态
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- models 表索引
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);
CREATE INDEX IF NOT EXISTS idx_models_is_enabled ON models(is_enabled);
CREATE INDEX IF NOT EXISTS idx_models_sort_order ON models(sort_order);

-- 复合索引：用于模型列表查询
CREATE INDEX IF NOT EXISTS idx_models_enabled_sorted ON models(is_enabled, sort_order, provider)
    WHERE is_enabled = TRUE;

-- models 表注释
COMMENT ON TABLE models IS '模型定义表';
COMMENT ON COLUMN models.id IS '模型标识符（如 gpt-4, claude-3-opus）';
COMMENT ON COLUMN models.display_name IS '显示名称';
COMMENT ON COLUMN models.provider IS '模型提供商';
COMMENT ON COLUMN models.input_price_per_mtok IS '输入价格（每百万token，美分）';
COMMENT ON COLUMN models.output_price_per_mtok IS '输出价格（每百万token，美分）';
COMMENT ON COLUMN models.cache_read_price_per_mtok IS '缓存读取价格（每百万token，美分）';
COMMENT ON COLUMN models.cache_write_price_per_mtok IS '缓存写入价格（每百万token，美分）';
COMMENT ON COLUMN models.long_context_input_price IS '长上下文输入价格（每百万token，美分）';
COMMENT ON COLUMN models.long_context_output_price IS '长上下文输出价格（每百万token，美分）';
COMMENT ON COLUMN models.long_context_threshold IS '长上下文阈值（token数）';
COMMENT ON COLUMN models.max_tokens IS '最大输出 token 数';
COMMENT ON COLUMN models.max_context_length IS '最大上下文长度';
COMMENT ON COLUMN models.is_enabled IS '是否启用';
COMMENT ON COLUMN models.sort_order IS '排序顺序';
COMMENT ON COLUMN models.created_at IS '创建时间';
COMMENT ON COLUMN models.updated_at IS '更新时间';

-- ============================================================
-- price_multipliers 表 - 价格倍率配置
-- ============================================================
CREATE TABLE IF NOT EXISTS price_multipliers (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 倍率类型
    type price_multiplier_type NOT NULL,

    -- 关联信息（根据类型可能关联不同的实体）
    model_id VARCHAR(100),                             -- 关联的模型ID
    user_group_id UUID,                                -- 关联的用户组ID

    -- 倍率值
    multiplier DECIMAL(5, 3) NOT NULL,

    -- 生效时间范围
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,                       -- NULL 表示永久有效

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 外键约束
    CONSTRAINT fk_price_multipliers_model
        FOREIGN KEY (model_id)
        REFERENCES models(id)
        ON DELETE CASCADE,

    -- 约束
    CONSTRAINT price_multipliers_multiplier_positive CHECK (multiplier > 0),
    CONSTRAINT price_multipliers_effective_range CHECK (
        effective_until IS NULL OR effective_until > effective_from
    )
);

-- price_multipliers 表索引
CREATE INDEX IF NOT EXISTS idx_price_multipliers_type ON price_multipliers(type);
CREATE INDEX IF NOT EXISTS idx_price_multipliers_model_id ON price_multipliers(model_id) WHERE model_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_multipliers_user_group_id ON price_multipliers(user_group_id) WHERE user_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_multipliers_effective ON price_multipliers(effective_from, effective_until);

-- 复合索引：用于查询当前有效的倍率
CREATE INDEX IF NOT EXISTS idx_price_multipliers_active ON price_multipliers(type, effective_from, effective_until)
    WHERE effective_until IS NULL OR effective_until > NOW();

-- price_multipliers 表注释
COMMENT ON TABLE price_multipliers IS '价格倍率配置表';
COMMENT ON COLUMN price_multipliers.id IS '记录唯一标识符';
COMMENT ON COLUMN price_multipliers.type IS '倍率类型';
COMMENT ON COLUMN price_multipliers.model_id IS '关联的模型ID';
COMMENT ON COLUMN price_multipliers.user_group_id IS '关联的用户组ID';
COMMENT ON COLUMN price_multipliers.multiplier IS '价格倍率';
COMMENT ON COLUMN price_multipliers.effective_from IS '生效开始时间';
COMMENT ON COLUMN price_multipliers.effective_until IS '生效结束时间（NULL表示永久有效）';
COMMENT ON COLUMN price_multipliers.created_at IS '创建时间';

-- ============================================================
-- 触发器：自动更新 channels.updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_channels_updated_at ON channels;
CREATE TRIGGER trigger_channels_updated_at
    BEFORE UPDATE ON channels
    FOR EACH ROW
    EXECUTE FUNCTION update_channels_updated_at();

-- ============================================================
-- 触发器：自动更新 models.updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_models_updated_at ON models;
CREATE TRIGGER trigger_models_updated_at
    BEFORE UPDATE ON models
    FOR EACH ROW
    EXECUTE FUNCTION update_models_updated_at();

-- ============================================================
-- 为 usage_records 添加 channel_id 外键（延迟添加，避免循环依赖）
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_usage_records_channel'
    ) THEN
        ALTER TABLE usage_records
        ADD CONSTRAINT fk_usage_records_channel
        FOREIGN KEY (channel_id)
        REFERENCES channels(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- 插入默认模型数据
-- ============================================================
INSERT INTO models (id, display_name, provider, input_price_per_mtok, output_price_per_mtok, cache_read_price_per_mtok, cache_write_price_per_mtok, max_tokens, max_context_length, sort_order)
VALUES
    -- OpenAI 模型
    ('gpt-4o', 'GPT-4o', 'openai', 250, 1000, 125, 0, 16384, 128000, 10),
    ('gpt-4o-mini', 'GPT-4o Mini', 'openai', 15, 60, 8, 0, 16384, 128000, 20),
    ('gpt-4-turbo', 'GPT-4 Turbo', 'openai', 1000, 3000, 0, 0, 4096, 128000, 30),
    ('gpt-3.5-turbo', 'GPT-3.5 Turbo', 'openai', 50, 150, 0, 0, 4096, 16385, 40),

    -- Anthropic 模型
    ('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 'anthropic', 300, 1500, 30, 375, 8192, 200000, 50),
    ('claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 'anthropic', 80, 400, 8, 100, 8192, 200000, 60),
    ('claude-3-opus-20240229', 'Claude 3 Opus', 'anthropic', 1500, 7500, 150, 1875, 4096, 200000, 70),

    -- Google 模型
    ('gemini-1.5-pro', 'Gemini 1.5 Pro', 'google', 125, 500, 31, 0, 8192, 2000000, 80),
    ('gemini-1.5-flash', 'Gemini 1.5 Flash', 'google', 8, 30, 2, 0, 8192, 1000000, 90),

    -- DeepSeek 模型
    ('deepseek-chat', 'DeepSeek Chat', 'deepseek', 14, 28, 1, 0, 8192, 64000, 100),
    ('deepseek-coder', 'DeepSeek Coder', 'deepseek', 14, 28, 1, 0, 8192, 64000, 110)
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    input_price_per_mtok = EXCLUDED.input_price_per_mtok,
    output_price_per_mtok = EXCLUDED.output_price_per_mtok,
    cache_read_price_per_mtok = EXCLUDED.cache_read_price_per_mtok,
    cache_write_price_per_mtok = EXCLUDED.cache_write_price_per_mtok,
    max_tokens = EXCLUDED.max_tokens,
    max_context_length = EXCLUDED.max_context_length,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();
