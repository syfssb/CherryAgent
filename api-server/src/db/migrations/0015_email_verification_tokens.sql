-- ============================================================
-- 0015_email_verification_tokens.sql - 邮箱验证
-- 创建邮箱验证 token 表，插入验证邮件模板
-- ============================================================

-- ============================================================
-- email_verification_tokens 表
-- ============================================================
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
    ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token
    ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
    ON email_verification_tokens(expires_at);

COMMENT ON TABLE email_verification_tokens IS '邮箱验证 token 表';
COMMENT ON COLUMN email_verification_tokens.user_id IS '关联用户 ID';
COMMENT ON COLUMN email_verification_tokens.token IS '验证 token（唯一）';
COMMENT ON COLUMN email_verification_tokens.expires_at IS '过期时间';

-- ============================================================
-- 确保 users 表有 email_verified_at 列
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- ============================================================
-- 插入邮箱验证邮件模板
-- ============================================================
INSERT INTO email_templates (slug, name, subject, html_content, variables) VALUES
(
    'email_verification',
    '邮箱验证',
    '验证您的邮箱 - {{appName}}',
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;background:#f5f5f5}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#10b981,#059669);padding:32px;text-align:center;color:#fff}
.header h1{margin:0;font-size:24px}
.content{padding:32px}
.content h2{color:#1f2937;margin-top:0}
.content p{color:#4b5563;line-height:1.6}
.btn{display:inline-block;background:#10b981;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:500;margin:24px 0}
.footer{padding:24px 32px;background:#f9fafb;text-align:center;color:#9ca3af;font-size:12px}
</style></head><body><div class="container">
<div class="header"><h1>验证邮箱</h1></div>
<div class="content">
<h2>{{username}}，您好！</h2>
<p>感谢注册 {{appName}}！请点击下方按钮验证您的邮箱地址：</p>
<p style="text-align:center"><a href="{{verifyLink}}" class="btn">验证邮箱</a></p>
<p>如果按钮无法点击，请复制以下链接到浏览器：</p>
<p style="word-break:break-all;color:#6b7280;font-size:14px">{{verifyLink}}</p>
<p>链接有效期 24 小时。如果您没有注册账号，请忽略此邮件。</p>
</div>
<div class="footer"><p>此邮件由系统自动发送，请勿回复。</p></div>
</div></body></html>',
    '["username", "appName", "verifyLink"]'
)
ON CONFLICT (slug) DO NOTHING;
