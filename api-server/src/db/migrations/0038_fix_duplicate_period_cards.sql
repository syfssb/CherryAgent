-- 0038: 修复期卡重复创建 bug + 邮件模板支持 total 模式
-- 根因：webhook 回调和前端轮询补单路径存在竞态，同一笔支付创建两张期卡

-- ==========================================
-- 1) 清理已有重复数据（按 payment_id 分组，保留最早创建的那条）
-- ==========================================
DELETE FROM user_period_cards
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY payment_id ORDER BY created_at, id) AS rn
    FROM user_period_cards
    WHERE payment_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- ==========================================
-- 2) 添加 payment_id 唯一约束（核心防护：每次支付只能创建一张期卡）
-- ==========================================
CREATE UNIQUE INDEX IF NOT EXISTS user_period_cards_unique_payment
  ON user_period_cards (payment_id) WHERE payment_id IS NOT NULL;

-- 注意：不恢复 one_active_per_user 索引
-- 0029_allow_multiple_active_cards.sql 已明确移除它以支持多张 active 卡并行

-- ==========================================
-- 3) 更新邮件模板：支持 total/daily 两种模式的动态文案
-- ==========================================
UPDATE email_templates
SET
  html_content = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;background:#f5f5f5}
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
<p>{{introText}}</p>
<table class="detail-table">
<tr><td>套餐名称</td><td>{{planName}}</td></tr>
<tr><td>生效时间</td><td>{{startsAt}}</td></tr>
<tr><td>到期时间</td><td>{{expiresAt}}</td></tr>
</table>
<div class="highlight"><p>{{creditsLabel}}</p><div class="credits">{{creditsDisplay}} 积分</div></div>
<p>{{creditsNote}}</p>
<p>感谢您的支持！</p>
</div>
<div class="footer"><p>此邮件由 {{appName}} 系统自动发送，请勿回复。</p></div>
</div></body></html>',
  variables = 'username,planName,startsAt,expiresAt,dailyCredits,appName,creditsLabel,creditsDisplay,creditsNote,introText'
WHERE slug = 'period-card-purchase-confirm';
