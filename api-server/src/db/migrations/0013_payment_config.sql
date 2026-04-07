-- 支付配置迁移
-- 在 system_configs 表中添加支付相关配置项

INSERT INTO system_configs (key, value, description) VALUES
  ('stripe_enabled', 'false', 'Stripe 支付是否启用'),
  ('stripe_publishable_key', '', 'Stripe Publishable Key'),
  ('stripe_secret_key', '', 'Stripe Secret Key'),
  ('stripe_webhook_secret', '', 'Stripe Webhook Secret'),
  ('stripe_currency', 'cny', 'Stripe 默认货币'),
  ('xunhupay_enabled', 'false', '虎皮椒支付是否启用'),
  ('xunhupay_appid', '', '虎皮椒 AppID'),
  ('xunhupay_appsecret', '', '虎皮椒 AppSecret'),
  ('xunhupay_api_url', 'https://api.xunhupay.com/payment/do.html', '虎皮椒 API 地址'),
  ('xunhupay_notify_url', '', '虎皮椒回调地址'),
  ('payment_methods', '["xunhupay"]', '启用的支付方式列表')
ON CONFLICT (key) DO NOTHING;
