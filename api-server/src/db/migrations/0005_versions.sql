-- ============================================================
-- 0005_versions.sql - 版本与通知
-- 创建应用版本表、公告表
-- ============================================================

-- ============================================================
-- 更新策略枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE update_strategy AS ENUM ('none', 'optional', 'recommended', 'forced');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 公告类型枚举
-- ============================================================
DO $$ BEGIN
    CREATE TYPE announcement_type AS ENUM ('info', 'warning', 'critical', 'maintenance', 'promotion');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- app_versions 表 - 应用版本
-- ============================================================
CREATE TABLE IF NOT EXISTS app_versions (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 版本信息
    version VARCHAR(20) NOT NULL,                      -- 语义化版本号 (如 1.2.3)

    -- 下载链接
    download_url_mac_arm64 TEXT,
    download_url_mac_x64 TEXT,
    download_url_win_x64 TEXT,
    download_url_linux_x64 TEXT,

    -- 更新说明
    release_notes TEXT,
    release_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 更新策略
    update_strategy update_strategy NOT NULL DEFAULT 'optional',
    min_version VARCHAR(20),                           -- 最低兼容版本

    -- 灰度发布
    staging_percentage INTEGER NOT NULL DEFAULT 100,   -- 灰度比例 (0-100)

    -- 下载统计
    download_count_mac INTEGER NOT NULL DEFAULT 0,
    download_count_win INTEGER NOT NULL DEFAULT 0,
    download_count_linux INTEGER NOT NULL DEFAULT 0,

    -- 状态
    is_published BOOLEAN NOT NULL DEFAULT FALSE,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 约束
    CONSTRAINT app_versions_version_unique UNIQUE (version),
    CONSTRAINT app_versions_staging_percentage_range CHECK (staging_percentage >= 0 AND staging_percentage <= 100),
    CONSTRAINT app_versions_version_format CHECK (version ~ '^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$')
);

-- app_versions 表索引
CREATE INDEX IF NOT EXISTS idx_app_versions_version ON app_versions(version);
CREATE INDEX IF NOT EXISTS idx_app_versions_is_published ON app_versions(is_published);
CREATE INDEX IF NOT EXISTS idx_app_versions_release_date ON app_versions(release_date);
CREATE INDEX IF NOT EXISTS idx_app_versions_update_strategy ON app_versions(update_strategy);

-- 复合索引：用于查询最新发布版本
CREATE INDEX IF NOT EXISTS idx_app_versions_latest ON app_versions(is_published, release_date DESC)
    WHERE is_published = TRUE;

-- app_versions 表注释
COMMENT ON TABLE app_versions IS '应用版本表';
COMMENT ON COLUMN app_versions.id IS '版本记录唯一标识符';
COMMENT ON COLUMN app_versions.version IS '语义化版本号（如 1.2.3）';
COMMENT ON COLUMN app_versions.download_url_mac_arm64 IS 'macOS ARM64 下载链接';
COMMENT ON COLUMN app_versions.download_url_mac_x64 IS 'macOS x64 下载链接';
COMMENT ON COLUMN app_versions.download_url_win_x64 IS 'Windows x64 下载链接';
COMMENT ON COLUMN app_versions.download_url_linux_x64 IS 'Linux x64 下载链接';
COMMENT ON COLUMN app_versions.release_notes IS '更新说明（Markdown格式）';
COMMENT ON COLUMN app_versions.release_date IS '发布日期';
COMMENT ON COLUMN app_versions.update_strategy IS '更新策略：none-不更新, optional-可选更新, recommended-推荐更新, forced-强制更新';
COMMENT ON COLUMN app_versions.min_version IS '最低兼容版本';
COMMENT ON COLUMN app_versions.staging_percentage IS '灰度发布比例（0-100）';
COMMENT ON COLUMN app_versions.download_count_mac IS 'macOS 下载次数';
COMMENT ON COLUMN app_versions.download_count_win IS 'Windows 下载次数';
COMMENT ON COLUMN app_versions.download_count_linux IS 'Linux 下载次数';
COMMENT ON COLUMN app_versions.is_published IS '是否已发布';
COMMENT ON COLUMN app_versions.created_at IS '创建时间';

-- ============================================================
-- announcements 表 - 系统公告
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 公告内容
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,                             -- Markdown 格式

    -- 类型和展示渠道
    type announcement_type NOT NULL DEFAULT 'info',
    channels JSONB DEFAULT '["app", "web"]'::jsonb,    -- 展示渠道：app, web, email

    -- 发布时间控制
    publish_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,                            -- NULL 表示永不过期

    -- 状态
    is_published BOOLEAN NOT NULL DEFAULT FALSE,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,                                   -- 创建者管理员ID

    -- 外键约束
    CONSTRAINT fk_announcements_created_by
        FOREIGN KEY (created_by)
        REFERENCES admins(id)
        ON DELETE SET NULL,

    -- 约束
    CONSTRAINT announcements_expires_after_publish CHECK (
        expires_at IS NULL OR expires_at > publish_at
    )
);

-- announcements 表索引
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcements_is_published ON announcements(is_published);
CREATE INDEX IF NOT EXISTS idx_announcements_publish_at ON announcements(publish_at);
CREATE INDEX IF NOT EXISTS idx_announcements_expires_at ON announcements(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON announcements(created_by) WHERE created_by IS NOT NULL;

-- 复合索引：用于查询当前有效公告
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_published, publish_at, expires_at)
    WHERE is_published = TRUE;

-- GIN 索引：用于按渠道筛选
CREATE INDEX IF NOT EXISTS idx_announcements_channels ON announcements USING GIN (channels);

-- announcements 表注释
COMMENT ON TABLE announcements IS '系统公告表';
COMMENT ON COLUMN announcements.id IS '公告唯一标识符';
COMMENT ON COLUMN announcements.title IS '公告标题';
COMMENT ON COLUMN announcements.content IS '公告内容（Markdown格式）';
COMMENT ON COLUMN announcements.type IS '公告类型：info-信息, warning-警告, critical-紧急, maintenance-维护, promotion-促销';
COMMENT ON COLUMN announcements.channels IS '展示渠道（JSON数组）：app, web, email';
COMMENT ON COLUMN announcements.publish_at IS '发布时间';
COMMENT ON COLUMN announcements.expires_at IS '过期时间（NULL表示永不过期）';
COMMENT ON COLUMN announcements.is_published IS '是否已发布';
COMMENT ON COLUMN announcements.created_at IS '创建时间';
COMMENT ON COLUMN announcements.created_by IS '创建者管理员ID';

-- ============================================================
-- 辅助函数：获取当前有效公告
-- ============================================================
CREATE OR REPLACE FUNCTION get_active_announcements(
    p_channel VARCHAR DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    title VARCHAR(200),
    content TEXT,
    type announcement_type,
    channels JSONB,
    publish_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.title,
        a.content,
        a.type,
        a.channels,
        a.publish_at,
        a.expires_at
    FROM announcements a
    WHERE
        a.is_published = TRUE
        AND a.publish_at <= NOW()
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND (p_channel IS NULL OR a.channels ? p_channel)
    ORDER BY
        CASE a.type
            WHEN 'critical' THEN 1
            WHEN 'maintenance' THEN 2
            WHEN 'warning' THEN 3
            WHEN 'promotion' THEN 4
            ELSE 5
        END,
        a.publish_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 辅助函数：获取最新发布版本
-- ============================================================
CREATE OR REPLACE FUNCTION get_latest_version(
    p_platform VARCHAR DEFAULT NULL,
    p_current_version VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    version VARCHAR(20),
    download_url TEXT,
    release_notes TEXT,
    release_date TIMESTAMPTZ,
    update_strategy update_strategy,
    min_version VARCHAR(20),
    is_update_available BOOLEAN
) AS $$
DECLARE
    v_download_url TEXT;
BEGIN
    RETURN QUERY
    WITH latest AS (
        SELECT
            av.id,
            av.version,
            av.download_url_mac_arm64,
            av.download_url_mac_x64,
            av.download_url_win_x64,
            av.download_url_linux_x64,
            av.release_notes,
            av.release_date,
            av.update_strategy,
            av.min_version,
            av.staging_percentage
        FROM app_versions av
        WHERE
            av.is_published = TRUE
            AND av.staging_percentage > 0
        ORDER BY
            string_to_array(av.version, '.')::int[] DESC
        LIMIT 1
    )
    SELECT
        l.id,
        l.version,
        CASE p_platform
            WHEN 'mac_arm64' THEN l.download_url_mac_arm64
            WHEN 'mac_x64' THEN l.download_url_mac_x64
            WHEN 'win_x64' THEN l.download_url_win_x64
            WHEN 'linux_x64' THEN l.download_url_linux_x64
            ELSE l.download_url_mac_arm64
        END AS download_url,
        l.release_notes,
        l.release_date,
        l.update_strategy,
        l.min_version,
        CASE
            WHEN p_current_version IS NULL THEN FALSE
            WHEN string_to_array(l.version, '.')::int[] > string_to_array(p_current_version, '.')::int[] THEN TRUE
            ELSE FALSE
        END AS is_update_available
    FROM latest l;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 辅助函数：增加版本下载计数
-- ============================================================
CREATE OR REPLACE FUNCTION increment_download_count(
    p_version_id UUID,
    p_platform VARCHAR
)
RETURNS VOID AS $$
BEGIN
    UPDATE app_versions
    SET
        download_count_mac = CASE
            WHEN p_platform IN ('mac_arm64', 'mac_x64') THEN download_count_mac + 1
            ELSE download_count_mac
        END,
        download_count_win = CASE
            WHEN p_platform = 'win_x64' THEN download_count_win + 1
            ELSE download_count_win
        END,
        download_count_linux = CASE
            WHEN p_platform = 'linux_x64' THEN download_count_linux + 1
            ELSE download_count_linux
        END
    WHERE id = p_version_id;
END;
$$ LANGUAGE plpgsql;
