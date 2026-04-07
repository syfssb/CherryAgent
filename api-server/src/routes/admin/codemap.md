# src/routes/admin/

## Responsibility
管理后台 API 接口，供运营/管理员使用。所有接口都需管理员认证且记录审计日志。

## Design
每个子文件对应一个管理业务模块（用户、财务、渠道、模型等）。index.ts 统一导出并挂载所有子路由。所有请求都经过 adminAuth 中间件和 admin-logger 审计。

## Files & Functions

### **auth.ts** — 管理员认证
- POST /api/admin/auth/login — 管理员登录

### **users.ts** — 用户管理
- GET /api/admin/users — 用户列表
- GET /api/admin/users/:id — 用户详情
- PATCH /api/admin/users/:id — 修改用户信息
- DELETE /api/admin/users/:id — 删除用户

### **finance.ts** — 财务管理
- GET /api/admin/finance/dashboard — 财务概览
- GET /api/admin/finance/transactions — 交易记录
- POST /api/admin/finance/adjust-balance — 调整用户余额（人工操作）

### **dashboard.ts** — 管理员仪表盘
- GET /api/admin/dashboard — 关键指标概览

### **channels.ts** — 渠道管理
- GET /api/admin/channels — 渠道列表
- POST /api/admin/channels — 创建渠道
- PATCH /api/admin/channels/:id — 修改渠道
- DELETE /api/admin/channels/:id — 删除渠道

### **models.ts** — 模型管理
- GET /api/admin/models — 模型列表
- POST /api/admin/models — 添加模型
- PATCH /api/admin/models/:id — 编辑模型
- DELETE /api/admin/models/:id — 删除模型

### **versions.ts** — 版本管理
- GET /api/admin/versions — 版本列表
- POST /api/admin/versions — 发布新版本

### **announcements.ts** — 公告管理
- GET /api/admin/announcements — 公告列表
- POST /api/admin/announcements — 创建公告
- PATCH /api/admin/announcements/:id — 编辑公告
- DELETE /api/admin/announcements/:id — 删除公告

### **configs.ts** — 系统配置管理
- GET /api/admin/configs — 配置列表
- POST /api/admin/configs — 更新配置

### **packages.ts** — 积分套餐管理
- GET /api/admin/packages — 套餐列表
- POST /api/admin/packages — 创建套餐
- PATCH /api/admin/packages/:id — 编辑套餐
- DELETE /api/admin/packages/:id — 删除套餐

### **skills.ts** — 内置技能管理
- GET /api/admin/skills — 技能列表
- POST /api/admin/skills — 上传技能

### **external-skills.ts** — 第三方技能管理
- GET /api/admin/external-skills — 第三方技能列表
- POST /api/admin/external-skills — 添加第三方技能

### **referrals.ts** — 邀请系统管理
- GET /api/admin/referrals — 邀请数据统计

### **emails.ts** — 邮件管理和发送
- POST /api/admin/emails/send — 发送邮件
- GET /api/admin/settings/email — 邮件配置

### **discounts.ts** — 优惠码管理
- GET /api/admin/discounts — 优惠码列表
- POST /api/admin/discounts — 创建优惠码
- PATCH /api/admin/discounts/:id — 编辑优惠码

### **redeem-codes.ts** — 兑换码管理
- GET /api/admin/redeem-codes — 兑换码列表
- POST /api/admin/redeem-codes — 创建兑换码
- PATCH /api/admin/redeem-codes/:id — 编辑兑换码

### **payment-settings.ts** — 支付设置
- GET /api/admin/settings/payment — 支付配置
- PATCH /api/admin/settings/payment — 更新支付配置

### **system-settings.ts** — 系统设置
- GET /api/admin/settings/system — 系统配置
- PATCH /api/admin/settings/system — 更新系统配置

### **period-cards.ts** — 期卡套餐管理
- GET /api/admin/period-cards — 期卡列表
- POST /api/admin/period-cards — 创建期卡
- PATCH /api/admin/period-cards/:id — 编辑期卡

### **fraud.ts** — 反欺诈管理
- GET /api/admin/fraud/suspicious-accounts — 可疑账户列表
- PATCH /api/admin/fraud/suspicious-accounts/:id — 审查可疑账户

### **sync.ts** — 数据同步管理
- POST /api/admin/sync/force — 强制同步数据

### **legal-contents.ts** — 法律内容管理
- GET /api/admin/legal-contents — 法律内容列表
- POST /api/admin/legal-contents — 添加法律内容

### **providers.ts** — Provider 管理
- GET /api/admin/providers — Provider 列表
- PATCH /api/admin/providers/:id — 更新 Provider 配置

### **clerk-settings.ts** — Clerk 集成设置
- GET /api/admin/settings/clerk — Clerk 配置

## Flow
1. 所有请求进入 /api/admin 路由前，先经过 adminAuth 认证中间件
2. admin-logger 中间件记录所有操作
3. 业务处理器调用相应 service 执行操作
4. 返回结果，审计日志存库

## Integration
- **依赖**：Express、adminAuth middleware、admin-logger、services、Zod
- **被依赖**：app.ts 挂载 adminRouter
- **关键接口**：所有 /api/admin/* 端点
