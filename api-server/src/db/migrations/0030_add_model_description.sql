-- 添加模型介绍字段
-- Migration: 0030_add_model_description
-- Created: 2026-02-18

-- 为 models 表添加介绍相关字段
ALTER TABLE models
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS description_format VARCHAR(20) DEFAULT 'markdown',
  ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS use_cases JSONB DEFAULT '[]'::jsonb;

-- 添加注释
COMMENT ON COLUMN models.description IS '模型介绍（支持 Markdown）';
COMMENT ON COLUMN models.description_format IS '介绍格式（markdown/plain）';
COMMENT ON COLUMN models.features IS '模型特性标签（JSON 数组）';
COMMENT ON COLUMN models.use_cases IS '适用场景（JSON 数组）';

-- 示例数据（可选）
-- UPDATE models SET
--   description = 'Claude Opus 4.6 是最强大的模型，适合复杂推理任务',
--   features = '["长上下文", "多模态", "工具使用"]'::jsonb,
--   use_cases = '["代码生成", "数据分析", "创意写作"]'::jsonb
-- WHERE id = 'claude-opus-4-6';
