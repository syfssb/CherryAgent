# src/db/

## Responsibility
数据库连接管理、ORM 配置、Schema 定义和迁移脚本。统一为全系统提供数据访问层。

## Design
使用 Drizzle ORM + node-postgres (pg) 驱动。schema.ts 定义 40+ 业务表（users、billing、proxy、period-cards 等）及关系。index.ts 管理连接池（可配最大/最小连接数）和生命周期。迁移脚本存于 migrations/，按编号递增执行。

## Flow
1. **pool 创建**：连接池初始化（10~50 连接可配），启用连接超时、statement timeout、query timeout 保护
2. **db ORM**：Drizzle ORM 包装 pool，提供类型安全查询 API
3. **Schema 定义**：tables + relations，支持 ForeignKey、index、unique constraint
4. **迁移执行**：run_migrations.sql 按序执行，初始化表结构、索引、序列等

## Tables
- **users** — 用户账户（邮箱、密码、角色等）
- **plans / subscriptions** — 订阅计划和用户订阅状态
- **user_balances / balance_transactions** — 积分余额和交易记录
- **payments** — 支付订单（Stripe、讯虎支付等）
- **usage_logs** — API 调用日志（model、token、cost、quota 等）
- **period_card_plans / user_period_cards** — 期卡套餐和用户期卡
- **period_card_usage_logs** — 期卡额度消耗日志
- **webhook_events** — Webhook 事件队列（Stripe、讯虎等 webhook）
- **redeem_codes / redeem_code_usages** — 兑换码表和使用记录
- **check_in_records** — 用户签到记录
- **suspicious_accounts / ip_registration_log / ip_blocklist** — 反欺诈相关表
- **security_audit_logs** — 安全审计日志

## Integration
- **依赖**：pg 驱动、Drizzle ORM、dotenv
- **被依赖**：所有 services、routes、middleware 都通过 db 或 pool 访问数据
- **关键接口**：
  - pool — 原始 PostgreSQL 连接池，支持 pool.query()
  - db — Drizzle ORM 实例，支持 db.select()、db.insert()、db.update() 等
  - testConnection() — 连接测试
  - closeConnection() — 优雅关闭池
