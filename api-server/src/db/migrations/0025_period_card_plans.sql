-- 期卡套餐系统迁移
-- 创建期卡套餐定义表、用户期卡记录表、期卡额度使用日志表

-- ==========================================
-- 期卡套餐定义表
-- ==========================================
CREATE TABLE IF NOT EXISTS period_card_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  period_type VARCHAR(20) NOT NULL,        -- 'daily', 'weekly', 'monthly'
  period_days INTEGER NOT NULL,             -- 1, 7, 30
  daily_credits DECIMAL(12, 2) NOT NULL DEFAULT '0',
  price_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'CNY',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 用户期卡记录表
-- ==========================================
CREATE TABLE IF NOT EXISTS user_period_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES period_card_plans(id),
  payment_id UUID REFERENCES payments(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, expired, cancelled, upgraded
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  daily_credits DECIMAL(12, 2) NOT NULL,          -- 购买时快照
  daily_quota_remaining DECIMAL(12, 2) NOT NULL,   -- 当天剩余额度
  quota_reset_date VARCHAR(10),                    -- YYYY-MM-DD (Asia/Shanghai)
  expiry_notified BOOLEAN NOT NULL DEFAULT false,
  upgraded_to_id UUID REFERENCES user_period_cards(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 关键约束：每个用户只能有 1 张 active 卡（partial unique index）
CREATE UNIQUE INDEX IF NOT EXISTS user_period_cards_one_active_per_user
  ON user_period_cards (user_id) WHERE status = 'active';

-- ==========================================
-- 期卡额度使用日志（审计）
-- ==========================================
CREATE TABLE IF NOT EXISTS period_card_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_period_card_id UUID NOT NULL REFERENCES user_period_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date VARCHAR(10) NOT NULL,  -- YYYY-MM-DD (Asia/Shanghai)
  quota_used DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 索引
-- ==========================================
CREATE INDEX IF NOT EXISTS user_period_cards_user_id_idx ON user_period_cards (user_id);
CREATE INDEX IF NOT EXISTS user_period_cards_status_idx ON user_period_cards (status);
CREATE INDEX IF NOT EXISTS user_period_cards_expires_at_idx ON user_period_cards (expires_at);
CREATE INDEX IF NOT EXISTS period_card_usage_logs_user_id_idx ON period_card_usage_logs (user_id);
CREATE INDEX IF NOT EXISTS period_card_usage_logs_date_idx ON period_card_usage_logs (usage_date);

-- ==========================================
-- 邮件模板
-- ==========================================
INSERT INTO email_templates (slug, name, subject, html_content, variables, is_enabled)
VALUES
  (
    'period-card-expiry-reminder',
    '期卡到期提醒',
    '您的{{planName}}即将到期 - {{appName}}',
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;background:#f5f5f5}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#f59e0b,#d97706);padding:32px;text-align:center;color:#fff}
.header h1{margin:0;font-size:24px}
.content{padding:32px}
.content h2{color:#1f2937;margin-top:0}
.content p{color:#4b5563;line-height:1.6}
.warning-box{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:20px;text-align:center;margin:24px 0}
.warning-box .expiry{font-size:24px;font-weight:bold;color:#d97706;margin-top:8px}
.btn{display:inline-block;background:#6366f1;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:500;margin:24px 0}
.footer{padding:24px 32px;background:#f9fafb;text-align:center;color:#9ca3af;font-size:12px}
</style></head><body><div class="container">
<div class="header"><h1>期卡到期提醒</h1></div>
<div class="content">
<h2>{{username}}，您好！</h2>
<p>您购买的 <strong>{{planName}}</strong> 即将到期，请注意续费以免影响使用。</p>
<div class="warning-box"><p>到期时间</p><div class="expiry">{{expiresAt}}</div></div>
<p>到期后每日额度将不再发放，超出部分将从充值积分中扣除。</p>
<p style="text-align:center"><a href="{{renewLink}}" class="btn">立即续费</a></p>
</div>
<div class="footer"><p>此邮件由 {{appName}} 系统自动发送，请勿回复。</p></div>
</div></body></html>',
    'username,planName,expiresAt,appName,renewLink',
    true
  ),
  (
    'period-card-purchase-confirm',
    '期卡购买确认',
    '您已成功购买{{planName}} - {{appName}}',
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;background:#f5f5f5}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#10b981,#059669);padding:32px;text-align:center;color:#fff}
.header h1{margin:0;font-size:24px}
.content{padding:32px}
.content h2{color:#1f2937;margin-top:0}
.content p{color:#4b5563;line-height:1.6}
.detail-table{width:100%;border-collapse:collapse;margin:24px 0}
.detail-table td{padding:12px 16px;border-bottom:1px solid #e5e7eb}
.detail-table td:first-child{color:#6b7280;width:120px}
.detail-table td:last-child{color:#1f2937;font-weight:500}
.highlight{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center;margin:24px 0}
.highlight .credits{font-size:36px;font-weight:bold;color:#059669}
.footer{padding:24px 32px;background:#f9fafb;text-align:center;color:#9ca3af;font-size:12px}
</style></head><body><div class="container">
<div class="header"><h1>购买成功</h1></div>
<div class="content">
<h2>{{username}}，您好！</h2>
<p>您已成功购买 <strong>{{planName}}</strong>，现在可以享受每日额度了。</p>
<table class="detail-table">
<tr><td>套餐名称</td><td>{{planName}}</td></tr>
<tr><td>生效时间</td><td>{{startsAt}}</td></tr>
<tr><td>到期时间</td><td>{{expiresAt}}</td></tr>
</table>
<div class="highlight"><p>每日额度</p><div class="credits">{{dailyCredits}} 积分</div></div>
<p>每日额度在北京时间 00:00 自动重置，当天未用完的额度不累积。超出额度部分将从充值积分中扣除。</p>
<p>感谢您的支持！</p>
</div>
<div class="footer"><p>此邮件由 {{appName}} 系统自动发送，请勿回复。</p></div>
</div></body></html>',
    'username,planName,startsAt,expiresAt,dailyCredits,appName',
    true
  )
ON CONFLICT (slug) DO NOTHING;
