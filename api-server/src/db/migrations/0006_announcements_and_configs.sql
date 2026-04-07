-- 0006: 公告管理和系统配置表
-- 创建时间: 2026-02-07

-- 确保 uuid 扩展存在
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 公告表
-- 注意: announcements 表已在 0005_versions.sql 中创建（使用 announcement_type enum）
-- 此处仅作为备份，如果 0005 未执行则创建基础表
-- sort_order 和 i18n 字段由后续迁移添加
-- ==========================================
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    type announcement_type DEFAULT 'info',
    is_published BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引：按发布状态和排序查询
CREATE INDEX IF NOT EXISTS idx_announcements_published
    ON announcements (is_published, sort_order DESC, published_at DESC);

-- 索引：按过期时间查询
CREATE INDEX IF NOT EXISTS idx_announcements_expires
    ON announcements (expires_at)
    WHERE expires_at IS NOT NULL;

-- ==========================================
-- 系统配置表 (KV 存储)
-- ==========================================
CREATE TABLE IF NOT EXISTS system_configs (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description VARCHAR(200),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID
);

-- 插入默认配置
INSERT INTO system_configs (key, value, description) VALUES
    ('privacy_policy', '', '隐私政策'),
    ('terms_of_service', '', '服务条款'),
    ('about_us', '', '关于我们'),
    ('contact_email', '', '联系邮箱'),
    ('welcome_credits', '100', '新用户欢迎积分数量')
ON CONFLICT (key) DO NOTHING;
