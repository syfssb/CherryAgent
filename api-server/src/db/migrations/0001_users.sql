-- ============================================================
-- 0001_users.sql - 用户与认证
-- 创建用户表和 API 密钥表
-- ============================================================

-- 启用 uuid-ossp 扩展（如果尚未启用）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 用户状态枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- users 表 - 用户主表
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 基本信息
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,

    -- 状态
    status user_status NOT NULL DEFAULT 'active',

    -- 新用户奖励
    welcome_bonus_granted BOOLEAN NOT NULL DEFAULT FALSE,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,

    -- 约束
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- users 表索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

-- users 表注释
COMMENT ON TABLE users IS '用户主表';
COMMENT ON COLUMN users.id IS '用户唯一标识符';
COMMENT ON COLUMN users.email IS '用户邮箱（用于登录）';
COMMENT ON COLUMN users.display_name IS '显示名称';
COMMENT ON COLUMN users.avatar_url IS '头像URL';
COMMENT ON COLUMN users.status IS '用户状态：active-活跃, suspended-已暂停, deleted-已删除';
COMMENT ON COLUMN users.welcome_bonus_granted IS '是否已发放新用户欢迎奖励';
COMMENT ON COLUMN users.created_at IS '创建时间';
COMMENT ON COLUMN users.updated_at IS '更新时间';
COMMENT ON COLUMN users.last_login_at IS '最后登录时间';

-- ============================================================
-- user_api_keys 表 - 用户 API 密钥
-- ============================================================
CREATE TABLE IF NOT EXISTS user_api_keys (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 关联用户
    user_id UUID NOT NULL,

    -- 密钥信息
    key_hash VARCHAR(64) NOT NULL,              -- SHA-256 哈希值
    key_prefix VARCHAR(12) NOT NULL,             -- 密钥前缀，用于识别（如 sk-xxx...）
    name VARCHAR(100) NOT NULL,                  -- 密钥名称

    -- 权限控制
    allowed_models JSONB DEFAULT '[]'::jsonb,    -- 允许的模型列表，空数组表示全部允许

    -- 有效期和状态
    expires_at TIMESTAMPTZ,                      -- 过期时间，NULL 表示永不过期
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- 使用追踪
    last_used_at TIMESTAMPTZ,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 外键约束
    CONSTRAINT fk_user_api_keys_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    -- 唯一约束
    CONSTRAINT user_api_keys_key_hash_unique UNIQUE (key_hash)
);

-- user_api_keys 表索引
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_key_prefix ON user_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_is_active ON user_api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_expires_at ON user_api_keys(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_api_keys_last_used_at ON user_api_keys(last_used_at);

-- user_api_keys 表注释
COMMENT ON TABLE user_api_keys IS '用户 API 密钥表';
COMMENT ON COLUMN user_api_keys.id IS '密钥唯一标识符';
COMMENT ON COLUMN user_api_keys.user_id IS '关联的用户ID';
COMMENT ON COLUMN user_api_keys.key_hash IS 'API 密钥的 SHA-256 哈希值';
COMMENT ON COLUMN user_api_keys.key_prefix IS '密钥前缀（用于用户识别，如 sk-abc...）';
COMMENT ON COLUMN user_api_keys.name IS '密钥名称（用户自定义）';
COMMENT ON COLUMN user_api_keys.allowed_models IS '允许使用的模型列表（JSON数组），空数组表示全部允许';
COMMENT ON COLUMN user_api_keys.expires_at IS '过期时间，NULL 表示永不过期';
COMMENT ON COLUMN user_api_keys.is_active IS '是否激活';
COMMENT ON COLUMN user_api_keys.last_used_at IS '最后使用时间';
COMMENT ON COLUMN user_api_keys.created_at IS '创建时间';

-- ============================================================
-- 触发器：自动更新 users.updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();
