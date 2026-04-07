-- 外部 Skills 表（从 GitHub 等外部来源抓取的 skills）
CREATE TABLE IF NOT EXISTS external_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,           -- 'vercel-labs', 'anthropics', 'custom'
  repo_url TEXT NOT NULL,                -- GitHub 仓库 URL
  skill_slug VARCHAR(100) NOT NULL,      -- skill 的 slug（目录名）
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  skill_content TEXT NOT NULL,           -- 完整的 SKILL.md 内容
  icon VARCHAR(50),
  version VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'imported'
  imported_to_preset_id UUID REFERENCES preset_skills(id) ON DELETE SET NULL,
  metadata JSONB,                        -- 额外的元数据（如 GitHub stars, 作者等）
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(source, repo_url, skill_slug)
);

-- 索引
CREATE INDEX IF NOT EXISTS external_skills_source_idx ON external_skills(source);
CREATE INDEX IF NOT EXISTS external_skills_status_idx ON external_skills(status);
CREATE INDEX IF NOT EXISTS external_skills_fetched_at_idx ON external_skills(fetched_at DESC);

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_external_skills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER external_skills_updated_at
  BEFORE UPDATE ON external_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_external_skills_updated_at();
