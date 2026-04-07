-- 邮件系统迁移
-- 创建邮件日志表和邮件模板表

-- 邮件日志
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    template VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, sent, failed
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at);

-- 邮件模板
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    html_content TEXT NOT NULL,
    variables TEXT,  -- JSON: 可用变量说明
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认模板
INSERT INTO email_templates (slug, name, subject, html_content, variables) VALUES
(
    'welcome',
    '欢迎邮件',
    '欢迎加入 {{appName}}',
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;background:#f5f5f5}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;color:#fff}
.header h1{margin:0;font-size:24px}
.content{padding:32px}
.content h2{color:#1f2937;margin-top:0}
.content p{color:#4b5563;line-height:1.6}
.highlight{background:#f0f0ff;border-radius:8px;padding:16px;text-align:center;margin:24px 0}
.highlight .credits{font-size:36px;font-weight:bold;color:#6366f1}
.footer{padding:24px 32px;background:#f9fafb;text-align:center;color:#9ca3af;font-size:12px}
</style></head><body><div class="container">
<div class="header"><h1>{{appName}}</h1></div>
<div class="content">
<h2>欢迎，{{username}}！</h2>
<p>感谢注册 {{appName}}。我们很高兴您的加入！</p>
<div class="highlight"><p>您已获得新手礼包</p><div class="credits">{{welcomeCredits}} 积分</div></div>
<p>开始探索 AI 对话的无限可能吧！</p>
</div>
<div class="footer"><p>此邮件由系统自动发送，请勿回复。</p></div>
</div></body></html>',
    '["username", "appName", "welcomeCredits"]'
),
(
    'purchase_confirm',
    '购买确认',
    '充值成功 - {{appName}}',
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
.footer{padding:24px 32px;background:#f9fafb;text-align:center;color:#9ca3af;font-size:12px}
</style></head><body><div class="container">
<div class="header"><h1>充值成功</h1></div>
<div class="content">
<h2>{{username}}，您好！</h2>
<p>您的充值已成功处理。</p>
<table class="detail-table">
<tr><td>充值金额</td><td>&yen;{{amount}}</td></tr>
<tr><td>获得积分</td><td>{{credits}} 积分</td></tr>
<tr><td>订单号</td><td>{{orderId}}</td></tr>
</table>
<p>感谢您的支持！</p>
</div>
<div class="footer"><p>此邮件由系统自动发送，请勿回复。</p></div>
</div></body></html>',
    '["username", "appName", "amount", "credits", "orderId"]'
),
(
    'low_balance',
    '余额不足提醒',
    '积分余额不足 - {{appName}}',
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;background:#f5f5f5}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#f59e0b,#d97706);padding:32px;text-align:center;color:#fff}
.header h1{margin:0;font-size:24px}
.content{padding:32px}
.content h2{color:#1f2937;margin-top:0}
.content p{color:#4b5563;line-height:1.6}
.warning-box{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;text-align:center;margin:24px 0}
.warning-box .balance{font-size:36px;font-weight:bold;color:#d97706}
.footer{padding:24px 32px;background:#f9fafb;text-align:center;color:#9ca3af;font-size:12px}
</style></head><body><div class="container">
<div class="header"><h1>余额提醒</h1></div>
<div class="content">
<h2>{{username}}，您好！</h2>
<p>您的积分余额已不足，建议及时充值以继续使用服务。</p>
<div class="warning-box"><p>当前余额</p><div class="balance">{{currentCredits}} 积分</div></div>
<p>为避免服务中断，请尽快充值。</p>
</div>
<div class="footer"><p>此邮件由系统自动发送，请勿回复。</p></div>
</div></body></html>',
    '["username", "appName", "currentCredits"]'
),
(
    'password_reset',
    '密码重置',
    '重置密码 - {{appName}}',
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;background:#f5f5f5}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#3b82f6,#2563eb);padding:32px;text-align:center;color:#fff}
.header h1{margin:0;font-size:24px}
.content{padding:32px}
.content h2{color:#1f2937;margin-top:0}
.content p{color:#4b5563;line-height:1.6}
.btn{display:inline-block;background:#3b82f6;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:500;margin:24px 0}
.footer{padding:24px 32px;background:#f9fafb;text-align:center;color:#9ca3af;font-size:12px}
</style></head><body><div class="container">
<div class="header"><h1>重置密码</h1></div>
<div class="content">
<h2>{{username}}，您好！</h2>
<p>我们收到了您的密码重置请求。点击下方按钮重置密码：</p>
<p style="text-align:center"><a href="{{resetLink}}" class="btn">重置密码</a></p>
<p>如果按钮无法点击，请复制以下链接到浏览器：</p>
<p style="word-break:break-all;color:#6b7280;font-size:14px">{{resetLink}}</p>
<p>链接有效期 30 分钟。如果您没有请求重置密码，请忽略此邮件。</p>
</div>
<div class="footer"><p>此邮件由系统自动发送，请勿回复。</p></div>
</div></body></html>',
    '["username", "appName", "resetLink"]'
),
(
    'refund',
    '退款通知',
    '退款通知 - {{appName}}',
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;background:#f5f5f5}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;color:#fff}
.header h1{margin:0;font-size:24px}
.content{padding:32px}
.content h2{color:#1f2937;margin-top:0}
.content p{color:#4b5563;line-height:1.6}
.detail-table{width:100%;border-collapse:collapse;margin:24px 0}
.detail-table td{padding:12px 16px;border-bottom:1px solid #e5e7eb}
.detail-table td:first-child{color:#6b7280;width:120px}
.detail-table td:last-child{color:#1f2937;font-weight:500}
.footer{padding:24px 32px;background:#f9fafb;text-align:center;color:#9ca3af;font-size:12px}
</style></head><body><div class="container">
<div class="header"><h1>退款通知</h1></div>
<div class="content">
<h2>{{username}}，您好！</h2>
<p>您的退款已处理完成。</p>
<table class="detail-table">
<tr><td>退款金额</td><td>&yen;{{amount}}</td></tr>
<tr><td>退款原因</td><td>{{reason}}</td></tr>
</table>
<p>退款将在 1-3 个工作日内退回原支付账户。如有疑问，请联系客服。</p>
</div>
<div class="footer"><p>此邮件由系统自动发送，请勿回复。</p></div>
</div></body></html>',
    '["username", "appName", "amount", "reason"]'
)
ON CONFLICT (slug) DO NOTHING;

-- 在 system_configs 中添加 SMTP 配置
INSERT INTO system_configs (key, value, description) VALUES
('smtp_host', '', 'SMTP 服务器地址'),
('smtp_port', '587', 'SMTP 端口'),
('smtp_user', '', 'SMTP 用户名'),
('smtp_pass', '', 'SMTP 密码'),
('smtp_secure', 'false', '是否使用 SSL/TLS'),
('smtp_from_name', 'Cherry Agent', '发件人名称'),
('smtp_from_email', '', '发件人邮箱'),
('smtp_reply_to', '', '回复邮箱'),
('email_enabled', 'false', '是否启用邮件通知')
ON CONFLICT (key) DO NOTHING;
