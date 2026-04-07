-- ============================================================
-- 0022_announcement_pinned.sql - 公告置顶功能
-- ============================================================
-- 为 announcements 表添加 is_pinned 和 pinned_at 字段
-- ============================================================

-- 添加置顶标记字段
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- 添加置顶时间字段
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- 索引：置顶公告查询优化
CREATE INDEX IF NOT EXISTS idx_announcements_pinned
    ON announcements (is_pinned, pinned_at DESC)
    WHERE is_pinned = TRUE;

-- 注释
COMMENT ON COLUMN announcements.is_pinned IS '是否置顶';
COMMENT ON COLUMN announcements.pinned_at IS '置顶时间';

-- ============================================================
-- 完成
-- ============================================================
SELECT 'Migration 0022_announcement_pinned completed' AS status;
