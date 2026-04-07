-- 为模型表添加 tags 字段（短标签，用于下拉选择器展示）
ALTER TABLE models ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
