# src/ui/lib/

## Responsibility
提供 HTTP 客户端、API 通信、时间格式化、语法高亮、会话标题生成、错误处理等核心库函数，是 UI 层与后端 API 交互的桥梁。

## Design
- **API 客户端**：`api-client.ts` 统一 HTTP 请求管理，自动处理 token 刷新和错误拦截
- **API 错误标准化**：`chat-error.ts` 解析复杂错误消息，分类为登录过期、余额、模型不可用、可重试等
- **认证 API**：`auth-api.ts` 包装认证相关请求（登录、OAuth、token 刷新等）
- **配置 API**：`config-api.ts` 获取后端配置（模型、渠道、定价等）
- **时间格式化**：`time.ts` 提供相对时间、智能日期格式化（不依赖 i18n）
- **语法高亮**：`hljs-configured.ts` + `rehype-highlight-languages.ts` 配置代码块渲染
- **会话标题生成**：`session-title.ts` 从首条消息生成合适的标题
- **Checkin API**：`checkin-api.ts` 打卡系统相关请求

## Flow
```
组件 → HttpClient.request()
  → 检查 token 过期 → 触发刷新 → 订阅者回调
  → 添加认证头 + 业务参数
  → fetch() 真实请求
  → 解析 ApiResponse<T>
  → 错误分类 (ApiError)
  → 返回结果或抛异常

错误消息 → normalizeChatErrorText()
  → parseErrorPayload() 提取结构化信息
  → 登录过期检测 (isLoginRequiredErrorText: LOGIN_REQUIRED_PATTERNS)
  → 匹配模式 (BALANCE, PERMANENT, RETRYABLE)
  → 返回本地化错误文本 + isBalanceError / isLoginError 标记
```

## Integration
- **依赖**：fetch API、React Zustand store (useAuthStore)、react-i18next
- **被依赖**：ChatView、UsageHistory、TransactionHistory、SkillMarket、Settings 等页面和服务层
- **关键接口**：
  - `ApiClient.request<T>(path, config)` → 统一请求入口
  - `normalizeChatErrorText(text)` → 错误消息标准化（返回 isBalanceError / isLoginError）
  - `isLoginRequiredErrorText(text)` → 检测登录过期错误（LOGIN_REQUIRED_PATTERNS 模式匹配）
  - `formatRelativeTime(timestamp, locale)` → 相对时间格式化
  - `generateSessionTitle(content)` → 生成会话标题
