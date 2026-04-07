# src/electron/libs/migrations/

## Responsibility
SQLite 数据库版本控制系统，实现 schema 迁移的自动执行、版本跟踪、回滚支持。确保数据库在不同版本间安全升级，避免数据丢失和不一致。

## Design
- **迁移记录表**：schema_migrations 表追踪已执行的迁移版本号 & 执行时间
- **版本顺序**：迁移按版本号 (001-011) 排序，每个迁移文件包含 up / down 函数
- **事务保证**：每个迁移在事务内执行，保证原子性（迁移失败时自动回滚）
- **PRAGMA 同步**：迁移完成后同步 PRAGMA user_version，与 schema_migrations 表版本一致
- **MigrationRunner 类**：暴露 migrateUp / migrateTo / rollback 等方法，支持灵活的迁移策略

## Flow

### 1. 迁移文件结构（001-011）
每个迁移文件导出一个 Migration 对象：
```typescript
export default {
  version: 1,
  name: "add-session-features",
  up(db) { /* 创建表、添加列、创建索引 */ },
  down(db) { /* 删除表、删除列、删除索引 */ }
}
```

**已有迁移列表**：
- **001**: add-session-features（sessions / messages / session_tags 表）
- **002**: memory-system（memory_blocks / archival_memory 表）
- **003**: skills（skills / skill_runtimes 表）
- **004**: local-settings（local_settings 表，KV 配置）
- **005**: fts-search（messages_fts 全文搜索表）
- **006**: session-skills（session_skills 关联表）
- **007**: messages-content（messages 表增加 content_hash / is_compacted）
- **008**: session-provider（sessions 表增加 provider / providerThreadId）
- **009**: skill-runtimes（skills 表增加 runtime / runtimeVersion）
- **010**: skill-unique-name（skills.name 唯一约束）
- **011**: session-model-id（sessions 表增加 modelId）

### 2. MigrationRunner 类
```typescript
constructor(db: Database) {
  this.db = db;
  this.ensureMigrationTable();  // 确保 schema_migrations 表存在
}
```

**主要方法**：
- `getAppliedMigrations()`：返回已执行的迁移记录
- `getCurrentVersion()`：返回当前数据库版本（最高 version）
- `getPendingMigrations()`：返回待执行的迁移列表
- `migrateUp()`：执行所有待执行迁移，返回执行数量
- `migrateTo(targetVersion)`：迁移到指定版本（支持向上升级和向下回滚）
- `rollback(steps)`：回滚最近 N 个迁移
- `rollbackAll()`：回滚所有迁移
- `getStatus()`：返回迁移状态报告（currentVersion / latestVersion / applied / pending）
- `needsMigration()`：检查是否有待执行迁移

### 3. 执行流程

**启动时迁移**（main.ts → ipc-handlers.ts）：
```typescript
const executedCount = runMigrations(db);
console.log(`Executed ${executedCount} migrations`);
```

1. 创建 MigrationRunner 实例
2. 确保 schema_migrations 表存在
3. 获取当前版本（通常为 0 或最后一个已执行版本）
4. 获取所有待执行迁移
5. 逐个执行：
   - 开始事务
   - 调用 migration.up(db)（SQL DDL 操作）
   - 插入 schema_migrations 记录
   - 提交事务
6. 同步 PRAGMA user_version

**回滚流程**（debug/recovery）：
```typescript
const result = runner.migrateTo(targetVersion);
// 向下迁移时，按版本倒序执行 down()
```

### 4. 事务安全性
- 每个迁移 up / down 在单个事务内执行
- 失败时自动回滚（错误消息指示迁移名称和版本号）
- schema_migrations 记录与实际 DDL 操作保持一致

### 5. 错误处理
- 迁移失败抛出详细错误：`迁移执行/回滚失败 [v001: add-session-features]: xxx`
- PRAGMA user_version 同步失败时仅警告，不中断迁移

## Integration
- **依赖**：
  - `better-sqlite3`：db.transaction() / db.exec() / db.prepare()
  - `/src/electron/types/local-db.ts`：Migration / MigrationRecord 类型定义
  - 各个迁移文件（001-011）

- **被依赖**：
  - `ipc-handlers.ts`：initializeSessions() 中调用 runMigrations(db)
  - 数据库初始化过程（main.ts 启动后立即执行）
  - 升级/降级脚本（admin 工具）

- **关键接口**：
  - `runMigrations(db)`：便捷函数，执行所有待执行迁移
  - `getMigrationStatus(db)`：便捷函数，返回迁移状态报告
  - `LATEST_MIGRATION_VERSION`：当前最新迁移版本号（导出常量）
  - `MigrationRunner`：完整 API 暴露
