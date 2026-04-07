-- ============================================================
-- 0035_skill_compatible_runtimes.sql - Skill 兼容运行时
-- ============================================================
-- 为 preset_skills 和 external_skills 表添加 compatible_runtimes 字段
-- 存储 JSON 数组字符串，如 '["claude","codex"]'

-- preset_skills 表
ALTER TABLE preset_skills
  ADD COLUMN IF NOT EXISTS compatible_runtimes TEXT NOT NULL DEFAULT '["claude","codex"]';

-- external_skills 表
ALTER TABLE external_skills
  ADD COLUMN IF NOT EXISTS compatible_runtimes TEXT NOT NULL DEFAULT '["claude","codex"]';

SELECT 'Migration 0035_skill_compatible_runtimes completed' AS status;
