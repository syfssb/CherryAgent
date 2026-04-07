-- 兑换码表
CREATE TABLE IF NOT EXISTS redeem_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  credits_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 兑换码唯一索引（不区分大小写）
CREATE UNIQUE INDEX redeem_codes_code_idx ON redeem_codes (UPPER(code));
CREATE INDEX redeem_codes_is_active_idx ON redeem_codes (is_active);
CREATE INDEX redeem_codes_expires_at_idx ON redeem_codes (expires_at);

-- 兑换记录表
CREATE TABLE IF NOT EXISTS redeem_code_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  redeem_code_id UUID NOT NULL REFERENCES redeem_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits_awarded DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX redeem_code_usages_code_id_idx ON redeem_code_usages (redeem_code_id);
CREATE INDEX redeem_code_usages_user_id_idx ON redeem_code_usages (user_id);
-- 防止同一用户重复兑换同一码
CREATE UNIQUE INDEX redeem_code_usages_user_code_idx ON redeem_code_usages (redeem_code_id, user_id);
