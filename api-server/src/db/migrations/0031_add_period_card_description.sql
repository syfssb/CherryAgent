-- 添加期卡介绍字段
-- Migration: 0031_add_period_card_description
-- Created: 2026-02-18

-- 为 period_card_plans 表添加介绍相关字段
ALTER TABLE period_card_plans
  ADD COLUMN IF NOT EXISTS short_description VARCHAR(200),
  ADD COLUMN IF NOT EXISTS full_description TEXT,
  ADD COLUMN IF NOT EXISTS description_format VARCHAR(20) DEFAULT 'markdown',
  ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS terms JSONB DEFAULT '[]'::jsonb;

-- 添加注释
COMMENT ON COLUMN period_card_plans.short_description IS '简短介绍（显示在卡片上，最多200字）';
COMMENT ON COLUMN period_card_plans.full_description IS '完整介绍（支持 Markdown）';
COMMENT ON COLUMN period_card_plans.description_format IS '介绍格式（markdown/plain）';
COMMENT ON COLUMN period_card_plans.highlights IS '亮点标签（JSON 数组）';
COMMENT ON COLUMN period_card_plans.terms IS '使用条款（JSON 数组）';

-- 将现有的 description 迁移到 short_description（如果需要）
-- UPDATE period_card_plans
-- SET short_description = description
-- WHERE short_description IS NULL AND description IS NOT NULL;
