-- 创建 webhook 事件表
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 事件标识
  provider VARCHAR(50) NOT NULL, -- stripe, xunhupay
  event_id VARCHAR(255) NOT NULL, -- 支付提供商的事件 ID
  event_type VARCHAR(100) NOT NULL, -- 事件类型

  -- 处理状态
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,

  -- 关联数据
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,

  -- 原始数据
  raw_payload JSONB NOT NULL, -- 原始 webhook 数据

  -- 处理结果
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  error_details JSONB,

  -- 签名验证
  signature VARCHAR(500),
  signature_verified BOOLEAN NOT NULL DEFAULT false,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- 确保同一个事件只记录一次 (核心幂等性保证)
  CONSTRAINT webhook_events_provider_event_id_unique UNIQUE (provider, event_id)
);

-- 创建索引
CREATE INDEX idx_webhook_events_provider ON webhook_events(provider);
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at);
CREATE INDEX idx_webhook_events_user_id ON webhook_events(user_id);
CREATE INDEX idx_webhook_events_payment_id ON webhook_events(payment_id);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);

-- 添加注释
COMMENT ON TABLE webhook_events IS 'Webhook 事件记录表，用于实现幂等性和重试机制';
COMMENT ON COLUMN webhook_events.event_id IS '支付提供商的唯一事件 ID';
COMMENT ON COLUMN webhook_events.status IS '处理状态: pending-待处理, processing-处理中, completed-已完成, failed-失败';
COMMENT ON COLUMN webhook_events.retry_count IS '重试次数';
COMMENT ON CONSTRAINT webhook_events_provider_event_id_unique ON webhook_events IS '确保同一个 webhook 事件只处理一次（幂等性核心）';
