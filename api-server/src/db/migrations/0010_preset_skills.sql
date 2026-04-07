-- ============================================================
-- 0010_preset_skills.sql - 预装 Skill 管理
-- ============================================================
-- 用于后台管理桌面端预装 skill 的配置

-- 启用 uuid-ossp 扩展（如果尚未启用）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 预装 Skill 表
-- ============================================================
CREATE TABLE IF NOT EXISTS preset_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    skill_content TEXT NOT NULL,
    icon VARCHAR(50),
    is_enabled BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    version VARCHAR(20) DEFAULT '1.0.0',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_preset_skills_enabled ON preset_skills(is_enabled);
CREATE INDEX IF NOT EXISTS idx_preset_skills_category ON preset_skills(category);
CREATE INDEX IF NOT EXISTS idx_preset_skills_slug ON preset_skills(slug);

-- ============================================================
-- 更新时间触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_preset_skills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_preset_skills_updated_at ON preset_skills;
CREATE TRIGGER trigger_preset_skills_updated_at
    BEFORE UPDATE ON preset_skills
    FOR EACH ROW
    EXECUTE FUNCTION update_preset_skills_updated_at();

-- ============================================================
-- 完成
-- ============================================================
SELECT 'Migration 0010_preset_skills completed' AS status;
