# src/routes/

## Responsibility
处理 HTTP 请求的业务逻辑，定义 API endpoint 并响应客户端。按功能分离：认证、代理、计费、用户、管理后台等。

## Design
每个文件为一个独立 Router，导出后在 app.ts 中挂载。支持嵌套路由（如 /api/admin/* 下属多个子路由）。

## Files & Functions

### **auth.ts** — 用户认证
- POST /api/auth/register — 邮箱注册
- POST /api/auth/login — 邮箱登录（返回 JWT）
- POST /api/auth/refresh — 刷新 Token
- POST /api/auth/oauth/google — Google 登录入口
- POST /api/auth/oauth/google/callback — Google 回调处理
- POST /api/auth/verify-email — 邮箱验证
- POST /api/auth/password-reset — 密码重置请求
- POST /api/auth/password-reset/confirm — 密码重置确认

### **proxy/** — AI 模型代理
- POST /api/proxy/v1/messages — Claude Messages API
- POST /api/proxy/chat/completions — OpenAI 兼容格式
- POST /api/proxy/responses — Codex 响应代理
- GET /api/proxy/models — 可用模型列表
- GET /api/proxy/channels — 渠道状态
- GET /api/proxy/providers — Provider 列表

### **billing.ts** — 计费和支付
- GET /api/billing/balance — 用户余额查询
- POST /api/billing/recharge — 充值请求（Stripe/讯虎）
- GET /api/billing/recharge/success — 支付成功回调
- GET /api/billing/recharge/cancel — 支付取消回调
- GET /api/billing/statements — 余额流水查询
- GET /api/billing/usage — API 使用统计

### **usage.ts** — 使用量查询
- GET /api/usage/stats — 统计数据
- GET /api/usage/logs — 使用日志

### **webhooks.ts** — Webhook 接收
- POST /api/webhooks/stripe — Stripe webhook
- POST /api/webhooks/xunhupay — 讯虎支付 webhook

### **announcements.ts** — 公告
- GET /api/announcements — 获取公告列表（无需认证）

### **configs.ts** — 系统配置
- GET /api/configs — 获取公开配置（无需认证）

### **skills.ts** — 技能和插件
- GET /api/skills — 获取可用技能列表

### **models-public.ts** — 模型信息
- GET /api/models — 公开模型列表

### **updates.ts** — 桌面版本更新
- GET /api/updates/check — 检查最新版本

### **referrals.ts** — 邀请系统
- GET /api/referrals/link — 获取邀请链接
- POST /api/referrals/claim — 领取邀请奖励

### **checkin.ts** — 签到系统
- POST /api/checkin — 每日签到
- GET /api/checkin/records — 签到记录

### **sync.ts** — Electron 端数据同步
- POST /api/sync/sync — 同步操作

### **analytics.ts** — 分析数据
- GET /api/analytics/* — 各种分析端点

### **downloads.ts** — 文件下载
- GET /downloads/* — 下载资源

### **admin/** — 管理后台 (需管理员权限)
详见 admin/codemap.md

## Flow
1. **路由匹配**：Express 路由器按注册顺序匹配 HTTP method + path
2. **中间件应用**：应用认证、校验等 middleware
3. **业务处理**：调用 service 层处理数据
4. **响应返回**：统一格式 successResponse() 或 errorResponse()

## Integration
- **依赖**：Express、Zod、services、middleware (auth、validate 等)
- **被依赖**：app.ts 在启动时挂载所有 router
- **关键接口**：见各文件暴露的 route
