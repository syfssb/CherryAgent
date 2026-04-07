-- 创建同步相关表
-- 用于存储用户的云同步数据

-- 同步变更记录表
CREATE TABLE IF NOT EXISTS sync_changes (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  data JSONB NOT NULL,
  timestamp BIGINT NOT NULL,
  checksum TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 同步冲突记录表
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_data JSONB NOT NULL,
  remote_data JSONB NOT NULL,
  local_device_id TEXT NOT NULL,
  remote_device_id TEXT NOT NULL,
  local_timestamp BIGINT NOT NULL,
  remote_timestamp BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  resolved_at BIGINT,
  resolution TEXT,
  CONSTRAINT sync_conflicts_resolution_check CHECK (resolution IN ('keep_local', 'keep_remote', 'manual_merge'))
);

-- 同步设备信息表
CREATE TABLE IF NOT EXISTS sync_device_info (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  last_sync_time BIGINT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_sync_changes_user_id ON sync_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_changes_timestamp ON sync_changes(timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_changes_entity ON sync_changes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_changes_device ON sync_changes(device_id);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_user_id ON sync_conflicts(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved ON sync_conflicts(resolved_at);

CREATE INDEX IF NOT EXISTS idx_sync_device_info_user_id ON sync_device_info(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_device_info_last_sync ON sync_device_info(last_sync_time);

-- 添加注释
COMMENT ON TABLE sync_changes IS '同步变更记录表，存储用户的数据变更';
COMMENT ON TABLE sync_conflicts IS '同步冲突记录表，存储需要解决的数据冲突';
COMMENT ON TABLE sync_device_info IS '同步设备信息表，存储用户设备的同步状态';
