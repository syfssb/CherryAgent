# src/services/

## Responsibility
应用业务逻辑实现层。各 service 文件对应一个业务域（用户、计费、支付、邮件等），提供可复用的数据操作和业务流程。

## Design
Repository 模式。每个 service 通过 db 操作数据库，暴露类型化接口给 route 调用。支持事务、缓存、错误恢复等。

## Files & Functions

### **user.ts** — 用户服务
- createUser(email, password) — 创建用户
- getUserById(userId) — 查询用户
- updateUser(userId, updates) — 更新用户
- deleteUser(userId) — 删除用户
- getUserByEmail(email) — 邮箱查询
- verifyEmail(userId) — 标记邮箱已验证

### **billing.ts** — 计费核心服务（复杂！）
**关键流程**：
- preCharge(userId, model, tokens) — **预扣费用**（支持期卡优先 + 余额扣费）
  - 返回 PreChargeResult：估算费用、期卡扣减、余额变化等
  - 支持乐观锁防止并发扣重
- settlementCharge(userId, preChargeId, actualUsage) — **结算费用**（根据实际 token 调整）
  - 对比预扣 vs 实际，自动退款或追扣
- getModelCreditsInfo(modelId) — 获取模型定价（从数据库读）
- calculateCredits(model, tokens) — 计算积分费用
- getBalance(userId) — 查询余额和统计
- getBalanceHistory(userId, limit) — 余额交易历史

**特殊处理**：
- 期卡优先：preCharge 先从期卡扣（daily/total 模式）
- 余额补足：期卡额度不足则从余额补足
- 乐观锁：timestampz 精度统一为 ms，防止并发冲突
- referenceId 类型：预扣返回 preChargeId (uuid)，结算时作 referenceId

### **channel.ts** — 渠道服务
- getChannels() — 获取数据库渠道列表 + 环境变量渠道
- selectChannel(model) — 选择可用渠道（支持模型匹配、健康度筛选）
- getChannelStatus() — 查询渠道健康度和速率限制
- updateChannelStatus() — 更新健康度指标（成功/失败计数、延迟）

### **usage.ts** — 使用量记录
- recordUsage(userId, model, tokens, cost) — 记录 API 调用
- getUsageStats(userId, startDate, endDate) — 查询统计数据
- getUsageLogs(userId, limit, offset) — 分页查询调用日志

### **payment-config.ts** — 支付配置服务
- getPaymentConfig() — 查询支付方式配置（Stripe、讯虎、支付宝等）
- updatePaymentConfig() — 更新配置（管理后台）
- validatePaymentMethod() — 校验支付方式

### **stripe.ts** — Stripe 集成
- createPaymentIntent(userId, amount) — 创建支付意图
- handleWebhook(event) — 处理 Stripe webhook
- confirmPayment(intentId) — 确认支付

### **xunhupay.ts** — 讯虎支付集成
- createOrder(userId, amount) — 创建订单
- handleCallback(orderId, signature) — 验证回调签名
- queryOrderStatus(orderId) — 查询订单状态

### **email.ts** — 邮件发送
- sendVerificationEmail(email, token) — 验证邮件
- sendPasswordResetEmail(email, token) — 密码重置邮件
- sendNotification(email, type, data) — 通知邮件
- 支持多个邮件提供商（SMTP、SendGrid 等）

### **redeem-code.ts** — 兑换码服务
- validateRedeemCode(code) — 校验兑换码有效性
- applyRedeemCode(userId, code) — 应用兑换码（添加积分）
- createRedeemCode(name, credits, maxUses, expiresAt) — 创建兑换码

### **period-card.ts** — 期卡服务
- getUserPeriodCards(userId) — 查询用户期卡列表
- createPeriodCard(userId, planId) — 创建新期卡
- extendPeriodCard(cardId) — 延期
- getQuotaRemaining(cardId, date) — 查询当日剩余额度
- deductQuota(cardId, amount, date) — 扣减额度

### **config.ts** — 系统配置缓存
- getSystemConfig(key) — 查询单个配置（缓存）
- getSystemConfigNumber(key, defaultValue) — 查询数值配置
- getSystemConfigBool(key, defaultValue) — 查询布尔配置
- updateSystemConfig(key, value) — 更新配置
- refreshConfigCache() — 刷新缓存

### **discount.ts** — 优惠码服务
- validateDiscountCode(code) — 校验优惠码
- applyDiscount(userId, code, amount) — 应用优惠

### **referral.ts** — 邀请系统
- generateInviteLink(userId) — 生成邀请链接
- trackReferral(referrerUserId, newUserId) — 记录邀请关系
- getRewards(userId) — 查询邀请奖励

### **checkin.ts** — 签到系统
- recordCheckin(userId) — 记录今日签到
- getCheckinStreak(userId) — 查询连续签到天数
- getCheckinRewards(days) — 查询签到奖励

### **password-reset.ts** — 密码重置
- generateResetToken(email) — 生成重置令牌
- verifyResetToken(token) — 校验令牌
- resetPassword(token, newPassword) — 重置密码

### **fraud.ts** — 反欺诈服务
- checkFraud(userId, ip, email) — 欺诈检测
- markSuspicious(userId, reason) — 标记可疑账户
- getSuspiciousAccounts() — 查询可疑列表

### **webhook.ts** — Webhook 队列管理
- enqueueWebhook(provider, eventType, payload) — 入队
- processWebhookQueue() — 定期处理
- retryFailedWebhooks() — 重试失败的 webhook

### **cron-tasks.ts** — 定时任务
- startCronTasks() — 启动所有定时任务
- stopCronTasks() — 停止所有定时任务
- 任务包括：期卡过期通知、webhook 重试、配置刷新、统计数据更新等

### **health-check.ts** — 健康检查
- checkDatabaseHealth() — 数据库连接检查
- checkExternalServices() — 外部 API 检查

### **security-audit.ts** — 安全审计
- recordAuditLog(type, userId, details) — 记录操作
- queryAuditLogs(filters) — 查询审计日志

### **supabase.ts** — 已弃用，保留兼容性

## Integration
- **依赖**：db、pool、env、utils (errors、crypto 等)
- **被依赖**：routes (auth、proxy、billing、admin 等)
- **数据库事务**：复杂操作使用 db.transaction() 保证一致性
