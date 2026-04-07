# 支付系统问题调研报告

## 一、核心发现

### 1. 幂等性机制（已实现）

**项目实现**：
- ✅ 使用 `webhookService.processWebhook()` 统一处理
- ✅ 数据库唯一约束（provider + eventId）防止重复记录
- ✅ 乐观锁 `markAsProcessing()` 防止并发
- ✅ 业务层检查：`if (payment.status === 'succeeded') return;`

**Stripe 官方最佳实践**：
- 记录已处理事件 ID，避免重复处理
- 快速返回 2xx 状态码，异步处理复杂逻辑
- 签名验证 + 时间戳防重放攻击（5分钟容忍）
- 双触发架构：Webhook（保证履行）+ 落地页（即时体验）

### 2. 回调重试机制

**项目实现**：
- 最多重试 3 次
- 状态流转：pending → processing → completed/failed

**Stripe 官方**：
- 生产环境：指数退避，最长重试 3 天
- 沙盒环境：重试 3 次，间隔数小时

### 3. 充值记录同步

**Stripe**：前端轮询，每 3 秒一次
**虎皮椒**：使用 QRCodePayment 组件，无明确轮询

---

## 二、问题根因分析

### 🔴 高优先级：虎皮椒重复发货

**可能原因**：
1. **并发竞争**：虎皮椒重试间隔短，并发请求绕过乐观锁
2. **乐观锁不够强**：`markAsProcessing()` 在高并发下可能失败
3. **事务隔离级别**：PostgreSQL 默认 READ COMMITTED 可能不够

**证据**：
- 代码已有完善幂等性机制（webhook.ts + xunhupay.ts）
- `markAsProcessing()` 使用 `WHERE status = 'pending'` 条件更新
- 但未使用 PostgreSQL Advisory Lock 或 FOR UPDATE

### 🟡 中优先级：Stripe 跳转路由错误

**可能原因**：
1. `FRONTEND_URL` 环境变量未配置或错误
2. `shouldRedirectToFrontendBilling()` 判断逻辑问题
3. Electron 环境 `openExternalUrl` 实现问题

**证据**：
- billing.ts:21-36 有判断逻辑
- 如果不重定向，返回 HTML 页面

### 🟡 中优先级：充值记录不显示

**可能原因**：
1. 轮询间隔太长（3秒）
2. 虎皮椒支付无轮询机制
3. `fetchBalance()` 未正确刷新

**证据**：
- RechargeModal.tsx:629-654 有 Stripe 轮询
- 虎皮椒使用 QRCodePayment，无明确轮询

---

## 三、解决方案建议

### 🔴 方案 1：修复虎皮椒重复发货（高优先级）

**推荐方案：使用 PostgreSQL Advisory Lock**

```typescript
// api-server/src/services/xunhupay.ts
// 在 processXunhupayCallback 中添加
await db.transaction(async (tx) => {
  // 使用 advisory lock 串行化同一订单的处理
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${localOrderId})::bigint)`
  );

  // 现有的处理逻辑...
});
```

**优点**：
- 完全串行化同一订单的处理
- 零死锁风险（事务级锁）
- 性能影响小（只锁定特定订单）

**备选方案**：
- 方案 B：使用 `SELECT FOR UPDATE` 行级锁
- 方案 C：提升事务隔离级别到 SERIALIZABLE

### 🟡 方案 2：修复 Stripe 跳转路由（中优先级）

**检查清单**：
1. 验证 `FRONTEND_URL` 环境变量
2. 添加日志记录跳转决策
3. 测试 Electron `openExternalUrl` 实现

**修复代码**：
```typescript
// api-server/src/routes/billing.ts
function shouldRedirectToFrontendBilling(): boolean {
  console.log('[Billing] FRONTEND_URL:', env.FRONTEND_URL);
  console.log('[Billing] NODE_ENV:', env.NODE_ENV);

  if (!env.FRONTEND_URL) {
    console.log('[Billing] 不重定向：FRONTEND_URL 未配置');
    return false;
  }
  // ... 现有逻辑
}
```

### 🟡 方案 3：优化充值记录同步（中优先级）

**方案 A：缩短轮询间隔**
```typescript
// src/ui/components/billing/RechargeModal.tsx:651
const timer = setInterval(async () => {
  // ...
}, 1000); // 从 3000ms 改为 1000ms
```

**方案 B：为虎皮椒添加轮询**
```typescript
// 在 RechargeModal.tsx 添加虎皮椒轮询逻辑
useEffect(() => {
  if (step !== 'payment' || activeTab !== 'recharge' ||
      (selectedChannel !== 'xunhu_wechat' && selectedChannel !== 'xunhu_alipay') ||
      !currentOrder) return;

  const timer = setInterval(async () => {
    try {
      const status = await pollPaymentStatus(currentOrder.orderId);
      if (status === 'paid' || status === 'succeeded') {
        clearInterval(timer);
        handlePaymentSuccess();
      }
    } catch {
      // 继续轮询
    }
  }, 1000);

  return () => clearInterval(timer);
}, [step, activeTab, selectedChannel, currentOrder]);
```

**方案 C：添加最大轮询次数**
```typescript
let pollCount = 0;
const maxPolls = 60; // 最多 60 次（1 分钟）

const timer = setInterval(async () => {
  pollCount++;
  if (pollCount >= maxPolls) {
    clearInterval(timer);
    // 提示用户手动刷新
    return;
  }
  // ...
}, 1000);
```

---

## 四、优先级排序

| 优先级 | 问题 | 影响 | 修复难度 | 建议时间 |
|--------|------|------|----------|----------|
| 🔴 高 | 虎皮椒重复发货 | 资金损失 | 低 | 立即修复 |
| 🟡 中 | Stripe 跳转错误 | 用户体验 | 低 | 1-2天 |
| 🟡 中 | 充值记录不显示 | 用户体验 | 低 | 1-2天 |

---

## 五、关键代码位置

### 幂等性机制
- `api-server/src/services/webhook.ts:70-132` - recordWebhookEvent()
- `api-server/src/services/webhook.ts:218-313` - processWebhook()
- `api-server/src/services/webhook.ts:178-194` - markAsProcessing()

### 虎皮椒支付
- `api-server/src/services/xunhupay.ts:316-356` - handleCallback()
- `api-server/src/services/xunhupay.ts:361-518` - processXunhupayCallback()
- `api-server/src/services/xunhupay.ts:299-312` - verifyCallback()

### Stripe 支付
- `api-server/src/services/stripe.ts:476-500` - handleWebhook()
- `api-server/src/services/stripe.ts:564-710` - handleCheckoutSessionCompleted()
- `api-server/src/routes/billing.ts:116-193` - 跳转处理逻辑

### 前端同步
- `src/ui/components/billing/RechargeModal.tsx:629-654` - Stripe 轮询
- `src/ui/components/billing/RechargeModal.tsx:659-684` - 期卡轮询

---

## 六、参考资料

### Stripe 官方文档
- Webhook 最佳实践：https://docs.stripe.com/webhooks/best-practices
- 订单履行：https://docs.stripe.com/payments/checkout/fulfill-orders

### 关键概念
- **幂等性**：同一操作执行多次结果相同
- **乐观锁**：通过版本号或状态检查防止并发冲突
- **Advisory Lock**：PostgreSQL 应用级锁，用于串行化业务逻辑
- **双触发架构**：Webhook（可靠）+ 落地页（即时）

---

## 七、测试建议

### 虎皮椒重复发货测试
1. 使用 Postman 模拟并发回调（10个并发请求）
2. 检查数据库是否只有一条 succeeded 记录
3. 检查用户余额是否只增加一次

### Stripe 跳转测试
1. 测试不同环境变量配置
2. 测试 Electron 和 Web 环境
3. 检查日志输出

### 充值记录同步测试
1. 测试 Stripe 支付后的轮询
2. 测试虎皮椒支付后的显示
3. 测试网络延迟情况

---

**调研完成时间**：2026-02-21
**调研人员**：支付系统架构侦探（AI Agent）
