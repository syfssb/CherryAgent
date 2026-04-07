-- ============================================================
-- 0007_enhance_user_api_keys.sql - 增强用户 API Keys 功能
-- 添加元数据、权限范围和使用统计字段
-- ============================================================

-- 添加新字段到 user_access_tokens 表
ALTER TABLE user_access_tokens
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
  ADD COLUMN IF NOT EXISTS scopes JSONB DEFAULT '["*"]'::jsonb,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost DECIMAL(12, 6) NOT NULL DEFAULT 0;

-- 添加索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_user_access_tokens_is_active
  ON user_access_tokens(is_active);

CREATE INDEX IF NOT EXISTS idx_user_access_tokens_expires_at
  ON user_access_tokens(expires_at)
  WHERE expires_at IS NOT NULL;

-- 添加注释
COMMENT ON COLUMN user_access_tokens.description IS 'API Key 的备注说明';
COMMENT ON COLUMN user_access_tokens.source IS 'API Key 创建来源：web, desktop, api';
COMMENT ON COLUMN user_access_tokens.user_agent IS '创建时的用户代理';
COMMENT ON COLUMN user_access_tokens.ip_address IS '创建时的 IP 地址';
COMMENT ON COLUMN user_access_tokens.scopes IS '权限范围，默认 ["*"] 表示全部权限';
COMMENT ON COLUMN user_access_tokens.usage_count IS '总调用次数';
COMMENT ON COLUMN user_access_tokens.total_cost IS '总费用（美元）';
