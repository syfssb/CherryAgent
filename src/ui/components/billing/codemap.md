# src/ui/components/billing/

计费系统前端层，展示用户积分余额、充值、消费账单、订阅管理。

## Responsibility

- **余额展示** (`BalanceDisplay`)：显示当前积分余额、快捷充值入口
- **充值弹窗** (`RechargeModal`)：支付方式选择、二维码/链接支付、充值流程
- **二维码支付** (`QRCodePayment`)：展示微信/支付宝二维码、支付状态轮询
- **期卡展示** (`ActivePeriodCard`)：显示当前生效的订阅期卡（套餐名、日额度、到期时间）
- **期卡管理** (`PeriodCardSection`)：期卡列表、续费、升级操作

## Design

### 核心模式

1. **Zustand 计费状态管理** (`useBillingStore`)
   - 单一真值源：余额、期卡列表、消费记录、订单状态等
   - 异步操作：`fetchBalance()`, `fetchPeriodCard()`, `createRechargeOrder()`
   - UI 状态：loading、error、支付等待等

2. **支付集成架构**
   - 支付方式：微信、支付宝、云支付（多渠道）
   - 流程：
     1. 后端生成订单 + 二维码/支付链接
     2. 前端轮询 `/api/billing/order/:orderId` 检查支付状态
     3. 支付成功 → 更新 balance、期卡信息
     4. 支付超时 → 清除订单、显示重试提示

3. **期卡状态机**
   ```
   Idle (无期卡)
     ↓ 购买期卡
   Active (生效中)
     ├─ 可升级：购买更高套餐
     ├─ 可续费：延长到期时间
     └─ 自动过期
   Expired (已过期)
     ├─ 可续费：重新激活
     └─ 归档
   ```

4. **按量计费 vs 期卡混合**
   - 期卡优先：如果有有效期卡，优先扣期卡日额度
   - 余额备用：期卡额度用尽或无期卡，扣积分余额
   - 明细分离：消费记录中分别记录期卡消耗和积分消耗

## Flow

### 用户进入应用

```
AppInitializer 完成认证
  ↓
自动调用 useBillingStore.fetchBalance()
  ↓
获取 { balance, periodCards, creditExpiry }
  ↓
<BalanceDisplay> 显示余额
<ActivePeriodCard> 显示当前期卡
<PeriodCardSection> 列出所有期卡
```

### 充值流程

```
1. 用户点击 BalanceDisplay 或 RechargeModal 中的"充值"按钮
2. RechargeModal 弹出
   ├─ 选择充值金额：¥30, ¥98, ¥298 等
   ├─ 选择支付方式：微信 / 支付宝
   └─ 点击"生成二维码"
3. 后端 POST /api/billing/recharge 返回：
   {
     orderId: "ord_xxx",
     amount: 30,
     qrCode: "data:image/png;base64,...",  // 微信二维码
     paymentUrl: "https://...",             // 支付宝链接
     expiresAt: 1234567890
   }
4. 前端 QRCodePayment 组件显示二维码 + 倒计时
5. 前端轮询 /api/billing/order/:orderId 每 2 秒检查支付状态
6. 支付成功 → 响应 { status: "paid" }
7. UI 显示"充值成功"，关闭弹窗，更新 balance
```

### 期卡购买流程

```
1. 用户查看期卡选项，点击"购买" / "升级"
2. 弹出期卡确认对话框
   ├─ 套餐名：Standard / Pro / Enterprise
   ├─ 月额度：1000 / 5000 / 20000 tokens
   ├─ 价格：¥99 / ¥299 / ¥999
   ├─ 有效期：1 个月
   └─ 确认购买
3. 后端处理：
   - 创建订单（待支付）
   - 如果是升级，调整旧期卡状态（"cancelled" / "upgraded"）
4. 跳转到充值流程（同上 3~7 步）
5. 支付成功 → 期卡立即生效
6. fetchPeriodCard() 刷新期卡信息
   ├─ ActivePeriodCard 显示新的期卡
   ├─ 日额度、到期时间更新
   └─ 旧期卡从列表中移除或标记为历史
```

### 消费扣费流程

```
用户发送 Agent 请求
  ↓
Electron 主进程评估成本（模型 tokens + 操作数）
  ↓
计费服务后端扣费：
  1. 如果有有效期卡，扣期卡日额度
  2. 如果期卡用尽，扣积分余额
  3. 如果余额不足，返回错误（前端停止请求）
  ↓
响应消费记录给前端
  ↓
BalanceDisplay 自动更新（订阅事件或轮询 fetchBalance）
```

## Integration

### 依赖

- **Stores**：
  - `useAuthStore` — 获取用户 ID、accessToken
  - `useBillingStore` — 计费数据中心

- **API Routes**：
  - `GET /api/billing/balance` — 获取用户余额和期卡信息
  - `GET /api/billing/period-cards` — 期卡列表及详情
  - `POST /api/billing/recharge` — 创建充值订单
  - `GET /api/billing/order/:orderId` — 查询订单状态（轮询）
  - `POST /api/billing/period-card/purchase` — 购买或升级期卡
  - `POST /api/billing/period-card/:id/renew` — 续费期卡
  - `GET /api/billing/usage` — 用户消费记录（可选，在单独的账单页）

- **Electron IPC**：
  - `billing:openExternalUrl` — 在浏览器打开支付宝链接（macOS Safari 不支持 OAuth）

- **Localization** (`react-i18next`)：
  - 期卡名称、价格、按钮文本等 i18n

- **UI 库**：
  - `Button`, `Dialog`, `Input`, `Select` 组件
  - `cn()` 样式合并工具

### 被依赖

- **Sidebar** / **Header**：`<BalanceDisplay>` 显示余额
- **Settings 页面**：`<PeriodCardSection>` 显示期卡管理
- **新建任务流程**：检查余额（实现后继续扣费逻辑）
- **Electron 主进程** (`agent-runner/`)：查询用户当前期卡和余额，评估成本

### 关键接口

```typescript
// useBillingStore 核心状态
interface BillingState {
  // 静态数据
  balance: number                    // 积分余额
  currency: 'CNY' | 'USD'
  periodCards: PeriodCard[]           // 期卡列表
  
  // 动态状态
  periodCardLoading: boolean
  rechargeModalOpen: boolean
  currentOrder: Order | null
  paymentPollingActive: boolean
  
  // 操作
  fetchBalance: () => Promise<void>
  fetchPeriodCard: () => Promise<void>
  createRechargeOrder: (amount: number, method: 'wechat' | 'alipay') => Promise<Order>
  checkOrderStatus: (orderId: string) => Promise<Order>
  purchasePeriodCard: (cardId: string) => Promise<void>
  renewPeriodCard: (cardId: string) => Promise<void>
}

// 期卡数据结构
interface PeriodCard {
  id: string
  name: string                  // 'Standard' / 'Pro' / 'Enterprise'
  monthlyQuota: number          // 月 token 额度
  dailyQuota: number            // 日额度（自动分配）
  usedToday: number
  price: number
  currency: string
  period: 'monthly' | 'yearly'
  status: 'active' | 'expiring' | 'expired' | 'cancelled'
  startDate: Date
  endDate: Date
  autoRenew: boolean
}

// 订单数据结构
interface Order {
  id: string
  userId: string
  type: 'recharge' | 'period_card'
  amount: number
  currency: string
  status: 'pending' | 'paid' | 'expired'
  paymentMethod: 'wechat' | 'alipay'
  qrCode?: string
  paymentUrl?: string
  createdAt: Date
  expiresAt: Date
}
```

### 文件清单

| 文件 | 职责 | 关键导出 |
|------|------|--------|
| `BalanceDisplay.tsx` | 余额展示 + 快捷充值按钮 | `BalanceDisplay`, `type BalanceDisplayProps` |
| `RechargeModal.tsx` | 充值弹窗（金额选择、方式选择） | `RechargeModal`, `type RechargeModalProps` |
| `QRCodePayment.tsx` | 二维码显示 + 支付轮询 | `QRCodePayment`, `type QRCodePaymentProps` |
| `ActivePeriodCard.tsx` | 当前生效期卡展示 | `ActivePeriodCard`, `type ActivePeriodCardProps` |
| `PeriodCardSection.tsx` | 期卡列表管理（购买、升级、续费） | `PeriodCardSection` |
| `index.ts` | Barrel export | 所有组件和类型 |

## 关键 Bug 修复历史

1. **账单显示 bug**（2026-02-26 修复，v0.2.11）
   - 根因：`PeriodCardSection` 与 `ActivePeriodCard` 重复渲染同一期卡
   - 修复：重构期卡展示逻辑，明确职责划分

2. **积分消耗不结算**（2026-02-27 修复，v0.2.11）
   - 根因：`billing:settleCredits` handler 未在 Agent 运行完后触发
   - 修复：`session-event-handlers.ts` 监听 `session.status='idle'` 事件后调用结算

3. **充值后余额不更新**（2026-02-10 修复）
   - 根因：支付成功后未刷新 `useBillingStore.balance`
   - 修复：`RechargeModal` 支付成功后调用 `fetchBalance()`

4. **期卡过期展示错误**（v0.2.15 修复）
   - 根因：`calculateDaysLeft()` 没有处理已过期的期卡（负数）
   - 修复：增加边界检查，过期期卡显示"已过期"而不是负天数
