-- ==========================================
-- 0020: 签到系统 + 防批量注册
-- ==========================================

-- 1. 用户表新增防刷字段
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(45),
  ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_reason TEXT;

-- 索引
CREATE INDEX IF NOT EXISTS users_registration_ip_idx ON users (registration_ip);
CREATE INDEX IF NOT EXISTS users_is_frozen_idx ON users (is_frozen) WHERE is_frozen = TRUE;
CREATE INDEX IF NOT EXISTS users_risk_score_idx ON users (risk_score) WHERE risk_score > 0;

-- 2. 签到记录表
CREATE TABLE IF NOT EXISTS check_in_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL,
  consecutive_days INTEGER NOT NULL DEFAULT 1,
  credits_earned DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 唯一索引：每个用户每天只能签到一次
CREATE UNIQUE INDEX IF NOT EXISTS check_in_records_user_date_idx
  ON check_in_records (user_id, check_in_date);

CREATE INDEX IF NOT EXISTS check_in_records_user_id_idx
  ON check_in_records (user_id);

CREATE INDEX IF NOT EXISTS check_in_records_created_at_idx
  ON check_in_records (created_at);

-- 3. 可疑账户记录表
CREATE TABLE IF NOT EXISTS suspicious_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(100) NOT NULL,
  details JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  action_taken VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS suspicious_accounts_user_id_idx
  ON suspicious_accounts (user_id);

CREATE INDEX IF NOT EXISTS suspicious_accounts_status_idx
  ON suspicious_accounts (status);

CREATE INDEX IF NOT EXISTS suspicious_accounts_created_at_idx
  ON suspicious_accounts (created_at);

-- 4. IP 注册频率追踪表
CREATE TABLE IF NOT EXISTS ip_registration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip VARCHAR(45) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  is_disposable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ip_registration_log_ip_idx
  ON ip_registration_log (ip);

CREATE INDEX IF NOT EXISTS ip_registration_log_created_at_idx
  ON ip_registration_log (created_at);

-- 5. 插入签到相关的系统配置默认值
INSERT INTO system_configs (key, value, description)
VALUES
  ('checkin_base_credits', '0.5', '签到基础奖励积分'),
  ('checkin_consecutive_bonus', '0.1', '连续签到每天额外奖励'),
  ('checkin_max_consecutive_bonus', '3', '连续签到最大额外奖励（7天周期）'),
  ('checkin_enabled', 'true', '是否启用签到功能'),
  ('fraud_max_registrations_per_ip_per_hour', '3', '同一IP每小时最大注册数'),
  ('fraud_max_registrations_per_ip_per_day', '5', '同一IP每天最大注册数'),
  ('fraud_block_disposable_email', 'true', '是否阻止一次性邮箱注册'),
  ('fraud_scan_enabled', 'true', '是否启用定时防刷扫描'),
  ('fraud_rapid_consumption_threshold_minutes', '30', '快速消耗积分的时间阈值（分钟）')
ON CONFLICT (key) DO NOTHING;
