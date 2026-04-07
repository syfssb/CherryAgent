-- ============================================================
-- 0008_optimize_usage_logs_indexes.sql
-- 优化 usage_logs 表的索引,提升查询性能
-- ============================================================

-- 添加复合索引以优化常见查询模式
-- 1. 用户 + 时间范围查询 (最常用)
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created_desc
ON usage_logs(user_id, created_at DESC)
WHERE user_id IS NOT NULL;

-- 2. 用户 + 模型 + 时间查询
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_model_created
ON usage_logs(user_id, model, created_at DESC)
WHERE user_id IS NOT NULL;

-- 3. 用户 + 提供商 + 时间查询
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_provider_created
ON usage_logs(user_id, provider, created_at DESC)
WHERE user_id IS NOT NULL;

-- 4. 用户 + 状态查询
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_status
ON usage_logs(user_id, status)
WHERE user_id IS NOT NULL;

-- 5. 按时间分组统计优化 (使用 BRIN 索引,适合时间序列数据)
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at_brin
ON usage_logs USING BRIN (created_at)
WITH (pages_per_range = 128);

-- 6. API Key 使用查询优化
CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key_created
ON usage_logs(api_key_id, created_at DESC)
WHERE api_key_id IS NOT NULL;

-- 7. 添加 JSONB metadata 索引 (使用 GIN 索引支持 JSON 查询)
CREATE INDEX IF NOT EXISTS idx_usage_logs_metadata_gin
ON usage_logs USING GIN (metadata)
WHERE metadata IS NOT NULL;

-- 8. 费用统计查询优化 (部分索引,只索引有费用的记录)
CREATE INDEX IF NOT EXISTS idx_usage_logs_cost
ON usage_logs(user_id, cost, created_at DESC)
WHERE cost IS NOT NULL AND cost::decimal > 0;

-- ============================================================
-- 表分区策略 (可选,适用于大规模数据)
-- 按月分区 usage_logs 表,提升查询和维护性能
-- 注意: 这需要重建表,生产环境需要谨慎操作
-- ============================================================

-- 示例: 创建分区表 (生产环境使用前请评估)
-- CREATE TABLE usage_logs_partitioned (
--     LIKE usage_logs INCLUDING ALL
-- ) PARTITION BY RANGE (created_at);

-- 创建月度分区
-- CREATE TABLE usage_logs_y2024m01 PARTITION OF usage_logs_partitioned
--     FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- CREATE TABLE usage_logs_y2024m02 PARTITION OF usage_logs_partitioned
--     FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
-- ... 继续创建更多分区

-- ============================================================
-- 维护建议
-- ============================================================

-- 1. 定期 VACUUM ANALYZE 表
-- VACUUM ANALYZE usage_logs;

-- 2. 定期清理旧数据 (例如保留最近 12 个月)
-- DELETE FROM usage_logs WHERE created_at < NOW() - INTERVAL '12 months';

-- 3. 监控索引使用情况
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE tablename = 'usage_logs'
-- ORDER BY idx_scan DESC;

-- 4. 检查表膨胀
-- SELECT schemaname, tablename,
--        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
-- FROM pg_tables
-- WHERE tablename = 'usage_logs';

-- ============================================================
-- 注释
-- ============================================================

COMMENT ON INDEX idx_usage_logs_user_created_desc IS '用户按时间查询优化 (降序)';
COMMENT ON INDEX idx_usage_logs_user_model_created IS '用户按模型和时间查询优化';
COMMENT ON INDEX idx_usage_logs_user_provider_created IS '用户按提供商和时间查询优化';
COMMENT ON INDEX idx_usage_logs_user_status IS '用户按状态查询优化';
COMMENT ON INDEX idx_usage_logs_created_at_brin IS '时间序列 BRIN 索引,适合范围查询';
COMMENT ON INDEX idx_usage_logs_api_key_created IS 'API Key 使用记录查询优化';
COMMENT ON INDEX idx_usage_logs_metadata_gin IS 'JSONB 元数据 GIN 索引,支持 JSON 查询';
COMMENT ON INDEX idx_usage_logs_cost IS '费用统计查询优化';
