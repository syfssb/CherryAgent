# src/middleware/

## Responsibility
请求级别的横切关注点：认证、授权、速率限制、校验、余额检查、日志、错误处理。

## Design
Express middleware 链式模式。每个 middleware 职责单一，可组合使用。

## Files & Functions

### **auth.ts** — JWT 认证与授权
- `authenticate(req, res, next)` — 必需认证，验证 Bearer Token
- `optionalAuth()` — 可选认证，Token 存在则验证，否则跳过
- `authorize(...roles)` — 角色授权工厂
- `generateToken()` — 签发 JWT (accessToken + refreshToken)
- `verifyRefreshToken()` — 验证刷新令牌

### **auth-compat.ts** — 向后兼容认证
旧版 API Key 认证、Clerk 兼容层等。

### **admin-auth.ts** — 管理员专用认证
限制管理后台路由仅管理员可访问。

### **balance-check.ts** — 余额检查
请求前预检用户余额，不足则拒绝（防止欠账）。

### **rate-limiter.ts** — 速率限制
基于 IP/用户的请求频率限制，防止滥用。

### **validate.ts** — Zod 请求体校验
验证 req.body 符合指定 schema，失败返回 400。

### **error-handler.ts** — 全局错误处理
捕捉所有异常，统一返回 error response（支持 ZodError、AppError、PG 错误等）。

### **not-found.ts** — 404 处理
无匹配路由时返回。

### **request-logger.ts** — 请求日志
记录请求级别的元数据（method、path、ip、latency 等）。

### **admin-logger.ts** — 管理员操作审计
记录所有管理后台操作，支持追溯。

### **rbac.ts** — 角色权限控制
细粒度 RBAC 实现（如果有的话）。

## Flow
**典型请求处理链**：
```
request
  → helmet (安全头)
  → cors (跨域检查)
  → json 解析
  → morgan (HTTP 日志)
  → requestLogger (自定义日志)
  → rateLimiter (限流)
  → [路由特定中间件：auth、balance-check、validate]
  → 业务处理器
  → errorHandler (异常捕捉)
  → 404 (无匹配路由)
```

## Integration
- **依赖**：Express、JWT、Zod、utils/errors、utils/response
- **被依赖**：所有 routes 在挂载时应用相应 middleware
- **关键接口**：
  - authenticate — 强制认证
  - optionalAuth — 可选认证
  - authorize('admin') — 管理员验证
  - balanceCheck() — 余额预检
  - validateBody(schema) — 请求校验
  - errorHandler — 全局异常处理
