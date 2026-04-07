-- ==========================================
-- 0024: 修复 welcome_credits 配置
--
-- 问题背景:
-- 0004_admin.sql 创建 system_configs 表时 value 列为 JSONB 类型
-- 0006_announcements_and_configs.sql 尝试用 TEXT 值插入（含空字符串 ''）
-- 空字符串不是有效 JSONB，导致整个 INSERT 失败
-- welcome_credits 配置因此未被插入
-- ==========================================

-- 尝试插入 welcome_credits 配置
-- 使用 DO 块来处理 JSONB/TEXT 类型兼容
DO $$
DECLARE
  col_type TEXT;
BEGIN
  -- 检测 value 列的实际类型
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'system_configs' AND column_name = 'value';

  -- 检查 welcome_credits 是否已存在
  IF NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'welcome_credits') THEN
    IF col_type = 'jsonb' THEN
      EXECUTE $q$
        INSERT INTO system_configs (key, value, description)
        VALUES ('welcome_credits', '10'::jsonb, '新用户欢迎积分数量')
      $q$;
    ELSE
      EXECUTE $q$
        INSERT INTO system_configs (key, value, description)
        VALUES ('welcome_credits', '10', '新用户欢迎积分数量')
      $q$;
    END IF;
    RAISE NOTICE 'welcome_credits 配置已插入（默认 10 积分）';
  ELSE
    RAISE NOTICE 'welcome_credits 配置已存在，跳过';
  END IF;

  -- 同时修复 0006 中其他可能缺失的配置
  IF NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'privacy_policy') THEN
    IF col_type = 'jsonb' THEN
      EXECUTE $q$
        INSERT INTO system_configs (key, value, description)
        VALUES ('privacy_policy', '""'::jsonb, '隐私政策')
      $q$;
    ELSE
      EXECUTE $q$
        INSERT INTO system_configs (key, value, description)
        VALUES ('privacy_policy', '', '隐私政策')
      $q$;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'terms_of_service') THEN
    IF col_type = 'jsonb' THEN
      EXECUTE $q$
        INSERT INTO system_configs (key, value, description)
        VALUES ('terms_of_service', '""'::jsonb, '服务条款')
      $q$;
    ELSE
      EXECUTE $q$
        INSERT INTO system_configs (key, value, description)
        VALUES ('terms_of_service', '', '服务条款')
      $q$;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'about_us') THEN
    IF col_type = 'jsonb' THEN
      EXECUTE $q$
        INSERT INTO system_configs (key, value, description)
        VALUES ('about_us', '""'::jsonb, '关于我们')
      $q$;
    ELSE
      EXECUTE $q$
        INSERT INTO system_configs (key, value, description)
        VALUES ('about_us', '', '关于我们')
      $q$;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'contact_email') THEN
    IF col_type = 'jsonb' THEN
      EXECUTE $q$
        INSERT INTO system_configs (key, value, description)
        VALUES ('contact_email', '""'::jsonb, '联系邮箱')
      $q$;
    ELSE
      EXECUTE $q$
        INSERT INTO system_configs (key, value, description)
        VALUES ('contact_email', '', '联系邮箱')
      $q$;
    END IF;
  END IF;
END $$;
