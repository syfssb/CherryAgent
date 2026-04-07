-- Migration: 0040_add_model_hidden
-- 为 models 表添加用户侧隐藏能力

ALTER TABLE models
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN models.is_hidden IS '是否对用户隐藏（隐藏后用户不可主动选择，但系统可调用）';

CREATE INDEX IF NOT EXISTS idx_models_is_hidden
ON models(is_hidden);

CREATE INDEX IF NOT EXISTS idx_models_enabled_visible_sorted
ON models(is_enabled, is_hidden, sort_order, provider)
WHERE is_enabled = TRUE AND is_hidden = FALSE;
