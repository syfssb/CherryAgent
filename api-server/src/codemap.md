# src/

## Responsibility
定义 API 服务的核心应用入口、环境配置、中间件管理和路由组织。支持认证、计费、代理、Webhook、管理后台等完整业务模块。

## Design
Express 应用以 app.ts 为核心，应用 middleware→logging→routes→error-handling 分层架构。支持全局代理（undici ProxyAgent）、CORS 白名单验证、速率限制、JWT 认证等。

## Flow
1. **启动阶段**：app.ts 创建 Express 应用，注册 middleware、CORS、JSON 解析、日志、速率限制
2. **请求处理**：请求依次通过 middleware（auth、balance-check、validate）→ routes（auth/proxy/billing/admin 等）
3. **错误处理**：所有异常被全局 error-handler 捕捉，返回统一格式 response
4. **资源清理**：关闭时调用 db.closeConnection()、stopCronTasks()，支持优雅关闭

## Integration
- **依赖**：Express、Zod、JWT、helmet、morgan、cors、express-async-errors
- **被依赖**：所有 routes、middleware、services 均由此层整合
- **关键接口**：
  - GET / — 根路由，返回服务基本信息
  - /api/* — 所有 API 前缀
  - /api/health — 健康检查
  - /api/auth — 用户认证（JWT、Google OAuth、邮箱密码）
  - /api/proxy — AI 模型代理（Claude、OpenAI 兼容等）
  - /api/admin/* — 管理后台（需管理员权限）
  - /api/billing — 计费和余额管理
  - /api/sync — Electron 端数据同步
