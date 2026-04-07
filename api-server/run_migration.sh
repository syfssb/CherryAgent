#!/bin/bash
# 运行单个迁移文件
PGPASSWORD='6yZj8QDgHGA0w23X57EavOVs9tr14uRq' psql \
  -h hnd1.clusters.zeabur.com \
  -p 25801 \
  -U root \
  -d zeabur \
  -f src/db/migrations/0032_sync_tables.sql
