-- ============================================================
-- 0004_admin.sql - 管理后台
-- 创建管理员表、操作日志表、系统配置表
-- ============================================================

-- ============================================================
-- 管理员角色枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE admin_role AS ENUM ('super_admin', 'admin', 'operator', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- admins 表 - 管理员
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 登录信息
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),

    -- 角色和权限
    role admin_role NOT NULL DEFAULT 'viewer',
    permissions JSONB DEFAULT '[]'::jsonb,             -- 细粒度权限列表

    -- 状态
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- 时间戳
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 约束
    CONSTRAINT admins_username_unique UNIQUE (username),
    CONSTRAINT admins_email_unique UNIQUE (email)
);

-- admins 表索引
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);
CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role);
CREATE INDEX IF NOT EXISTS idx_admins_is_active ON admins(is_active);

-- admins 表注释
COMMENT ON TABLE admins IS '管理员表';
COMMENT ON COLUMN admins.id IS '管理员唯一标识符';
COMMENT ON COLUMN admins.username IS '用户名';
COMMENT ON COLUMN admins.password_hash IS '密码哈希值（bcrypt）';
COMMENT ON COLUMN admins.email IS '邮箱';
COMMENT ON COLUMN admins.role IS '角色：super_admin-超级管理员, admin-管理员, operator-操作员, viewer-查看者';
COMMENT ON COLUMN admins.permissions IS '细粒度权限列表（JSON数组）';
COMMENT ON COLUMN admins.is_active IS '是否激活';
COMMENT ON COLUMN admins.last_login_at IS '最后登录时间';
COMMENT ON COLUMN admins.created_at IS '创建时间';
COMMENT ON COLUMN admins.updated_at IS '更新时间';

-- ============================================================
-- admin_logs 表 - 管理员操作日志
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_logs (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 关联管理员
    admin_id UUID NOT NULL,

    -- 操作信息
    action VARCHAR(100) NOT NULL,                      -- 操作类型
    target_type VARCHAR(50),                           -- 目标类型：user, channel, model, config 等
    target_id VARCHAR(100),                            -- 目标ID

    -- 详细信息
    details JSONB DEFAULT '{}'::jsonb,                 -- 操作详情

    -- 请求信息
    ip_address INET,
    user_agent TEXT,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 外键约束
    CONSTRAINT fk_admin_logs_admin
        FOREIGN KEY (admin_id)
        REFERENCES admins(id)
        ON DELETE CASCADE
);

-- admin_logs 表索引
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON admin_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at);

-- 复合索引：用于审计查询
CREATE INDEX IF NOT EXISTS idx_admin_logs_audit ON admin_logs(admin_id, created_at DESC);

-- admin_logs 表注释
COMMENT ON TABLE admin_logs IS '管理员操作日志表';
COMMENT ON COLUMN admin_logs.id IS '记录唯一标识符';
COMMENT ON COLUMN admin_logs.admin_id IS '操作管理员ID';
COMMENT ON COLUMN admin_logs.action IS '操作类型';
COMMENT ON COLUMN admin_logs.target_type IS '目标类型';
COMMENT ON COLUMN admin_logs.target_id IS '目标ID';
COMMENT ON COLUMN admin_logs.details IS '操作详情（JSON格式）';
COMMENT ON COLUMN admin_logs.ip_address IS '操作IP地址';
COMMENT ON COLUMN admin_logs.user_agent IS '用户代理字符串';
COMMENT ON COLUMN admin_logs.created_at IS '创建时间';

-- ============================================================
-- system_configs 表 - 系统配置
-- ============================================================
CREATE TABLE IF NOT EXISTS system_configs (
    -- 主键
    key VARCHAR(100) PRIMARY KEY,

    -- 配置值（JSON 格式，支持各种类型）
    value JSONB NOT NULL,

    -- 描述
    description TEXT,

    -- 更新信息
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID                                    -- 最后更新的管理员ID
);

-- system_configs 表索引
CREATE INDEX IF NOT EXISTS idx_system_configs_updated_at ON system_configs(updated_at);

-- system_configs 表注释
COMMENT ON TABLE system_configs IS '系统配置表';
COMMENT ON COLUMN system_configs.key IS '配置键名';
COMMENT ON COLUMN system_configs.value IS '配置值（JSON格式）';
COMMENT ON COLUMN system_configs.description IS '配置描述';
COMMENT ON COLUMN system_configs.updated_at IS '更新时间';
COMMENT ON COLUMN system_configs.updated_by IS '最后更新的管理员ID';

-- ============================================================
-- 触发器：自动更新 admins.updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_admins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_admins_updated_at ON admins;
CREATE TRIGGER trigger_admins_updated_at
    BEFORE UPDATE ON admins
    FOR EACH ROW
    EXECUTE FUNCTION update_admins_updated_at();

-- ============================================================
-- 触发器：自动更新 system_configs.updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_system_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_system_configs_updated_at ON system_configs;
CREATE TRIGGER trigger_system_configs_updated_at
    BEFORE UPDATE ON system_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_system_configs_updated_at();

-- ============================================================
-- 插入默认系统配置
-- ============================================================
INSERT INTO system_configs (key, value, description) VALUES
    -- 新用户欢迎奖励
    ('welcome_bonus_cents', '1000'::jsonb, '新用户欢迎奖励金额（分）'),

    -- 充值配置
    ('min_recharge_cents', '1000'::jsonb, '最小充值金额（分）'),
    ('max_recharge_cents', '10000000'::jsonb, '最大充值金额（分）'),

    -- 支付渠道配置
    ('payment_channels_enabled', '["stripe", "xunhupay"]'::jsonb, '启用的支付渠道'),

    -- 价格倍率
    ('global_price_multiplier', '1.0'::jsonb, '全局价格倍率'),

    -- API 限流
    ('default_rpm_limit', '60'::jsonb, '默认每分钟请求数限制'),
    ('default_tpm_limit', '100000'::jsonb, '默认每分钟 token 数限制'),

    -- 账户限制
    ('max_api_keys_per_user', '10'::jsonb, '每用户最大 API 密钥数'),
    ('default_daily_limit_cents', '0'::jsonb, '默认每日消费限额（分），0表示无限制'),
    ('default_monthly_limit_cents', '0'::jsonb, '默认每月消费限额（分），0表示无限制'),

    -- 健康检查配置
    ('channel_health_check_interval_seconds', '60'::jsonb, '渠道健康检查间隔（秒）'),
    ('channel_max_consecutive_failures', '3'::jsonb, '渠道最大连续失败次数（超过后标记为不健康）'),

    -- 负载均衡配置
    ('load_balancing_strategy', '"weighted_round_robin"'::jsonb, '负载均衡策略：weighted_round_robin, priority, latency'),

    -- 日志配置
    ('log_retention_days', '90'::jsonb, '日志保留天数'),
    ('usage_log_retention_days', '365'::jsonb, '使用记录保留天数'),

    -- 安全配置
    ('api_key_expiry_days', '0'::jsonb, '默认 API 密钥过期天数（0表示永不过期）'),
    ('session_expiry_hours', '24'::jsonb, '管理员会话过期时间（小时）'),
    ('max_login_attempts', '5'::jsonb, '最大登录尝试次数'),
    ('lockout_duration_minutes', '30'::jsonb, '账户锁定时长（分钟）'),

    -- 通知配置
    ('low_balance_threshold_cents', '1000'::jsonb, '低余额提醒阈值（分）'),
    ('notify_on_low_balance', 'true'::jsonb, '是否发送低余额提醒'),

    -- 系统维护
    ('maintenance_mode', 'false'::jsonb, '是否处于维护模式'),
    ('maintenance_message', '"系统维护中，请稍后再试"'::jsonb, '维护模式提示信息')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 插入默认超级管理员账号
-- 密码: admin123 (使用 bcrypt 哈希)
-- 注意: 生产环境请立即修改此密码!
-- ============================================================
INSERT INTO admins (username, password_hash, email, role, permissions)
VALUES (
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.S.g0C6ZjGdprZi',  -- admin123
    'admin@example.com',
    'super_admin',
    '["*"]'::jsonb
)
ON CONFLICT (username) DO NOTHING;
