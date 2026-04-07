# src/types/

## Responsibility
TypeScript 类型定义集中管理，包括 API 响应格式、数据模型（User、Channel、Transaction 等）、请求参数、枚举类型。保证前后端类型一致性。

## Design
**类型分类：**

1. **API 响应格式：**
   - ApiResponse<T> — 统一 API 响应结构（success, data, error, message, meta）
   - 支持错误对象：`{ code, message, details }`

2. **通用参数：**
   - PaginationParams — 分页请求（page, limit, sortBy, sortOrder）

3. **核心数据模型：**
   - User — 用户（id, email, nickname, balance, status, role, inviteCode）
   - UserFilters — 用户筛选条件（search, status, role, dateFrom, dateTo）
   - Transaction — 交易记录（id, userId, type, amount, balance, createdAt）
   - ApiKey — API 密钥（id, name, maskedKey, status, expiresAt）
   - Channel — 渠道（id, name, provider, baseUrl, status, priority, models）
   - Model — 模型（配置、限制）
   - RechargeRecord — 充值记录（金额、方式、状态）
   - Withdrawal — 提现记录（金额、状态、审核）
   - Discount — 优惠券
   - RedeemCode — 兑换码
   - PeriodCard — 周期卡
   - Skill — 技能
   - Announcement — 公告
   - 等（持续扩展）

4. **枚举类型：**
   - User status：'active' | 'suspended' | 'banned'
   - User role：'user' | 'vip' | 'enterprise'
   - Transaction type：'recharge' | 'consumption' | 'refund' | 'bonus' | 'withdrawal'
   - Channel status：'active' | 'disabled' | 'error'
   - ApiKey status：'active' | 'disabled' | 'expired'

## Flow
**使用流：**
1. 组件导入所需类型（如 User, Channel）
2. 在 props、state、API 调用中使用类型
3. TypeScript 编译期检查类型安全
4. 运行时 API 响应与类型对应

**后端同步：**
- types/index.ts 应与后端 schema 保持一致
- API 响应通过 ApiResponse<T> 统一，前端自动推导类型

## Integration
- **依赖：** 无（纯 TypeScript 定义）
- **被依赖：** 所有组件、页面、services、store
- **关键接口：** ApiResponse<T>, User, Channel, Transaction, PaginationParams, UserFilters
