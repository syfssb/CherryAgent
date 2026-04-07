-- ============================================================
-- 0023_add_important_announcement_type.sql
-- 为 announcement_type enum 添加 'important' 值
-- ============================================================
-- 注意: ALTER TYPE ... ADD VALUE 不能在事务块中执行
-- 使用 IF NOT EXISTS 确保幂等性（PostgreSQL 12+）
-- ============================================================

ALTER TYPE announcement_type ADD VALUE IF NOT EXISTS 'important';

-- ============================================================
-- 同步修复: 0006 迁移中的 CHECK 约束可能与 enum 冲突
-- 如果 announcements.type 列上存在 CHECK 约束，移除它
-- （因为 enum 类型本身就限制了合法值）
-- ============================================================
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- 查找 announcements 表上 type 列相关的 CHECK 约束
    FOR constraint_name IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'announcements'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%type%IN%'
    LOOP
        EXECUTE format('ALTER TABLE announcements DROP CONSTRAINT IF EXISTS %I', constraint_name);
        RAISE NOTICE 'Dropped CHECK constraint: %', constraint_name;
    END LOOP;
END $$;

-- ============================================================
-- 完成
-- ============================================================
SELECT 'Migration 0023: Added important to announcement_type enum' AS status;
