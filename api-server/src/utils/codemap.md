# src/utils/

## Responsibility
跨模块通用工具函数和基础设施：环境变量读取、错误定义、密码加密、OAuth 状态签名、国际化等。

## Design
集中管理常用工具，避免重复代码。每个工具函数职责单一、无副作用。

## Files & Functions

### **env.ts** — 环境变量管理
- 通过 dotenv 加载 .env 文件
- 导出 env 对象，包含所有系统配置：
  - NODE_ENV、PORT、DATABASE_URL、JWT_SECRET
  - CORS_ORIGINS、API_BASE_URL、LANDING_URL、FRONTEND_URL
  - STRIPE_SECRET_KEY、STRIPE_WEBHOOK_SECRET
  - SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS（邮件）
  - 其他第三方服务凭据
- 支持带默认值的类型化读取

### **errors.ts** — 自定义错误类定义
统一应用错误体系：
- `AppError` — 基础应用错误（statusCode、code、message、details）
- `AuthenticationError` — 认证失败（401）
- `AuthorizationError` — 权限不足（403）
- `NotFoundError` — 资源不存在（404）
- `ConflictError` — 冲突/唯一约束冲突（409）
- `ValidationError` — 输入校验失败（400）
- `QuotaExceededError` — 额度不足（402）
- `ExternalServiceError` — 外部服务错误（502/503）
- 每个错误类有对应的 HTTP 状态码和错误代码（for API 返回）

### **response.ts** — API 响应格式
统一响应格式：
- `successResponse<T>(data, meta)` — 成功响应
  ```json
  { "success": true, "data": {...}, "meta": {...} }
  ```
- `errorResponse(code, message, details, requestId)` — 错误响应
  ```json
  { "success": false, "error": { "code": "...", "message": "..." }, "requestId": "..." }
  ```
- ErrorCodes 枚举：定义所有错误代码（INVALID_INPUT、AUTH_FAILED、QUOTA_EXCEEDED 等）

### **crypto.ts** — 密码和加密
- `hashPassword(password)` — 密码 bcrypt 哈希
- `comparePassword(password, hash)` — 密码验证
- `generateSecureToken()` — 生成加密令牌（用于邮件验证、密码重置等）
- `encryptSensitive(data, key)` — AES 加密敏感数据（如 API Key）
- `decryptSensitive(ciphertext, key)` — 解密

### **oauth-state.ts** — OAuth 状态签名与验证
用于防止 OAuth 攻击（CSRF、重放、状态修改）：
- `signOAuthState(state, provider, redirectUri)` — 签名 OAuth state 参数
  - 包含原始 state + provider + redirectUri 的 HMAC-SHA256 签名
- `verifyOAuthState(signedState, provider, redirectUri, maxAge)` — 验证
  - 检查签名有效性、过期时间、provider 和 redirectUri 匹配
- `generateOAuthStateToken()` — 生成随机 state（PKCE）

### **i18n.ts** — 国际化
- `t(key, lang, params)` — 翻译函数
- `loadTranslations(lang)` — 加载语言文件
- `detectLanguage(acceptLanguage)` — 从 Accept-Language 检测用户语言
- 支持多语言错误信息、邮件内容等

### **legal-contents.ts** — 法律内容管理
- `getLegalContent(type, lang)` — 获取法律文本（ToS、Privacy Policy 等）
- `cacheLegalContents()` — 缓存法律文本

## Integration
- **依赖**：dotenv、bcrypt、jsonwebtoken、crypto（Node.js 内置）、undici（fetch polyfill）
- **被依赖**：所有 routes、services、middleware 均使用这些工具
- **关键导入**：
  ```typescript
  import { env } from './utils/env.js'
  import { AuthenticationError, NotFoundError } from './utils/errors.js'
  import { successResponse, errorResponse } from './utils/response.js'
  import { hashPassword, comparePassword } from './utils/crypto.js'
  ```
