# Repository Atlas: api-server

## Project Responsibility
Cherry Agent 后端服务，提供 REST API、AI 模型代理网关、用户认证、计费结算、管理后台接口。基于 Express + Drizzle ORM + PostgreSQL 构建，部署于 Zeabur（Tokyo）。

## Technology Stack
- **Framework**: Express 4 + express-async-errors
- **ORM**: Drizzle ORM（PostgreSQL）
- **Auth**: JWT（access/refresh token）+ Google OAuth2
- **Payment**: Stripe + 支付宝 + 微信 + 虎皮椒
- **Deploy**: Zeabur，数据库 PostgreSQL（hnd1.clusters.zeabur.com）

## System Entry Points
| 文件 | 职责 |
|------|------|
| `src/app.ts` | Express 应用入口，中间件注册，路由挂载 |
| `src/db/schema.ts` | Drizzle ORM 40+ 业务表定义 |
| `src/middleware/` | 11 个中间件（认证、限流、验证、错误处理）|

## Architecture Overview

```
客户端请求
  ↓
Express 中间件栈（cors / rateLimit / authenticate / authorize）
  ↓
路由层（routes/）
  ├── /api/auth/*        认证（登录/注册/OAuth/token 刷新）
  ├── /api/proxy/*       AI 模型代理网关（多渠道负载均衡）
  ├── /api/billing/*     计费（充值/消费/期卡/提现）
  ├── /api/sessions/*    会话管理
  ├── /api/skills/*      技能管理
  ├── /api/sync/*        云同步
  ├── /api/admin/*       管理后台（24 个接口）
  └── /api/webhooks/*    Stripe/支付宝 Webhook
  ↓
服务层（services/）：15+ 业务服务
  ↓
数据库层（db/）：Drizzle ORM + PostgreSQL
```

## Key Flow：AI 代理计费

```
客户端 → POST /api/proxy/messages
  → authenticate → 预扣积分（preDeductCredits）
  → 选渠道（loadBalancer，按权重/健康状态）
  → 适配器（anthropic/openai-compat）转发请求
  → 流式响应回传客户端
  → 结算实际用量（settleCredits）
  → 若预扣 > 实际 → 退还差额
```

## Directory Map

| 目录 | 职责摘要 | 详细地图 |
|------|---------|---------|
| `src/` | Express 入口、路由挂载、全局中间件 | [查看](src/codemap.md) |
| `src/config/` | 系统配置热更新机制 | [查看](src/config/codemap.md) |
| `src/constants/` | Provider 常量定义 | [查看](src/constants/codemap.md) |
| `src/db/` | Drizzle ORM Schema，40+ 业务表 | [查看](src/db/codemap.md) |
| `src/middleware/` | 11 个中间件（认证/授权/限流/验证/错误处理）| [查看](src/middleware/codemap.md) |
| `src/routes/` | 15+ 公开 API 路由 | [查看](src/routes/codemap.md) |
| `src/routes/admin/` | 24 个管理后台路由 | [查看](src/routes/admin/codemap.md) |
| `src/routes/proxy/` | AI 模型代理网关、多渠道负载均衡 | [查看](src/routes/proxy/codemap.md) |
| `src/routes/proxy/adapters/` | Provider 适配器（Anthropic/OpenAI 兼容）| [查看](src/routes/proxy/adapters/codemap.md) |
| `src/services/` | 15+ 业务服务（用户/计费/支付/邮件/反欺诈）| [查看](src/services/codemap.md) |
| `src/utils/` | 工具模块（环境变量/错误定义/加密/OAuth）| [查看](src/utils/codemap.md) |

## How to Update This Map
```bash
cd api-server
python3 ~/.claude/skills/cartography/scripts/cartographer.py changes --root ./
python3 ~/.claude/skills/cartography/scripts/cartographer.py update --root ./
```
