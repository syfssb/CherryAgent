# src/services/

## Responsibility
API 调用层，封装所有与后端的 HTTP 通信。包括通用 API 客户端（request、ApiError）、各模块业务 API（users、channels、finance 等）、错误处理、token 管理。

## Design
**API 客户端架构：**
- `api.ts` — 基础 HTTP client
  - ApiError class — 统一错误处理
  - request<T>() — 通用请求函数，自动注入 token、处理 401、解析响应
  - buildUrl() — 构建带查询参数的 URL

- 业务模块 API（各自独立文件）：
  - `auth.ts` — 登录、登出
  - `users.ts` — 用户列表、详情、修改状态等
  - `channels.ts` — 渠道 CRUD、配置
  - `finance.ts` — 充值、消费、提现记录
  - `models.ts` — 模型列表、配置
  - `dashboard.ts` — 仪表盘数据
  - `skills.ts` — 技能管理
  - 等等（见服务列表）

**错误处理策略：**
- 401 Unauthorized → logout() + 重定向 /login
- 其他错误 → 抛出 ApiError(message, status, code)
- 组件层使用 try-catch 或 react-query 的 onError 处理

**Token 管理：**
- 自动从 useAdminStore.getState() 获取 token
- 通过 Authorization: Bearer <token> 传递
- token 过期 → useAdminStore.logout() 清空

## Flow
**请求流：**
1. 组件通过 useQuery/useMutation 调用服务函数（如 fetchUsers、createChannel）
2. 服务函数调用 request<T>(path, config)
3. request 自动注入 Authorization 头 + 构建 URL
4. fetch 请求后端 → 处理响应
5. 401 → logout；其他错误 → throw ApiError；成功 → return 数据

**token 注入流：**
useAdminStore.getState().token → request 自动添加到 Authorization 头

## Integration
- **依赖：** useAdminStore（token、logout）、fetch API、types（ApiResponse 等）
- **被依赖：** 所有页面（通过 react-query hooks）
- **关键接口：** request<T>()、ApiError、fetchUsers()、fetchChannels()、等 20+ 业务 API 函数
