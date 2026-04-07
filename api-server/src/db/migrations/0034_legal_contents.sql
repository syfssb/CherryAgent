-- ============================================================
-- 0034_legal_contents.sql - 法律文档内容管理
-- ============================================================
-- 创建 legal_contents 表用于管理隐私政策、服务条款、关于我们等法律文档
-- 支持多语言（i18n）和版本管理
-- ============================================================

-- 确保 uuid 扩展存在
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. 创建法律文档类型枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE legal_content_type AS ENUM (
        'privacy_policy',
        'terms_of_service',
        'about_us'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 2. 创建 legal_contents 表
-- ============================================================
CREATE TABLE IF NOT EXISTS legal_contents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type legal_content_type NOT NULL UNIQUE,
    content TEXT NOT NULL,
    i18n JSONB DEFAULT '{}'::jsonb,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- 注释
COMMENT ON TABLE legal_contents IS '法律文档内容表（隐私政策、服务条款、关于我们）';
COMMENT ON COLUMN legal_contents.type IS '文档类型：privacy_policy, terms_of_service, about_us';
COMMENT ON COLUMN legal_contents.content IS '英文内容（主语言，Markdown 格式）';
COMMENT ON COLUMN legal_contents.i18n IS '多语言翻译 { "zh": { "content": "..." }, "zh-TW": {...}, "ja": {...} }';
COMMENT ON COLUMN legal_contents.version IS '版本号，每次更新自动递增';
COMMENT ON COLUMN legal_contents.is_active IS '是否激活（预留字段，用于版本管理）';
COMMENT ON COLUMN legal_contents.updated_by IS '最后更新人（管理员 ID）';

-- ============================================================
-- 3. 创建索引
-- ============================================================
-- GIN 索引用于 JSONB 查询
CREATE INDEX IF NOT EXISTS idx_legal_contents_i18n ON legal_contents USING GIN (i18n);

-- 按类型查询索引
CREATE INDEX IF NOT EXISTS idx_legal_contents_type ON legal_contents (type);

-- 按激活状态查询索引
CREATE INDEX IF NOT EXISTS idx_legal_contents_active ON legal_contents (is_active);

-- ============================================================
-- 4. 插入默认数据
-- ============================================================
INSERT INTO legal_contents (type, content, i18n) VALUES
(
    'privacy_policy',
    '# Privacy Policy

This is the default privacy policy content. Please update it with your actual privacy policy.

## Information We Collect
- User account information
- Usage data
- Device information

## How We Use Your Information
- To provide and maintain our service
- To improve user experience
- To communicate with you

## Contact Us
If you have any questions about this Privacy Policy, please contact us.',
    '{}'::jsonb
),
(
    'terms_of_service',
    '# Terms of Service

This is the default terms of service content. Please update it with your actual terms.

## Acceptance of Terms
By accessing and using this service, you accept and agree to be bound by the terms and provision of this agreement.

## Use License
Permission is granted to temporarily use this service for personal, non-commercial purposes.

## Disclaimer
The materials on this service are provided on an ''as is'' basis.

## Contact Us
If you have any questions about these Terms, please contact us.',
    '{}'::jsonb
),
(
    'about_us',
    '# About Us

## Company Information
Operated by UK Company CHERRYCHAT LTD
Company Number: 16096119

## Contact Information
- WeChat: JsnonoChat
- Email: 1073634403@qq.com
- Telegram: https://t.me/+rF_DXgP1QiQ3Y2Zl

## Company Registration
https://find-and-update.company-information.service.gov.uk/company/16096119',
    '{}'::jsonb
)
ON CONFLICT (type) DO NOTHING;

-- ============================================================
-- 5. 创建辅助函数：获取本地化法律文档内容
-- ============================================================
CREATE OR REPLACE FUNCTION get_localized_legal_content(
    p_content legal_contents,
    p_locale VARCHAR DEFAULT 'en'
)
RETURNS TEXT AS $$
BEGIN
    -- 优先返回请求语言，回退到 en（即原始列）
    IF p_locale != 'en' AND p_content.i18n ? p_locale THEN
        RETURN COALESCE(p_content.i18n -> p_locale ->> 'content', p_content.content);
    ELSE
        RETURN p_content.content;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 6. 创建触发器：自动更新 updated_at 和 version
-- ============================================================
CREATE OR REPLACE FUNCTION update_legal_content_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    -- 如果内容发生变化，版本号递增
    IF OLD.content IS DISTINCT FROM NEW.content OR OLD.i18n IS DISTINCT FROM NEW.i18n THEN
        NEW.version = OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_legal_content_timestamp
    BEFORE UPDATE ON legal_contents
    FOR EACH ROW
    EXECUTE FUNCTION update_legal_content_timestamp();

-- ============================================================
-- 完成
-- ============================================================
SELECT 'Migration 0034_legal_contents completed' AS status;
