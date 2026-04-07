# 统一 API 客户端

统一前端 UI 的 API 调用方式，提供类型安全、自动认证、错误处理、重试和缓存等功能。

## 目录结构

```
src/ui/lib/api/
├── index.ts          # 统一导出入口
├── types.ts          # 类型定义
├── error.ts          # 错误处理类
├── cache.ts          # 缓存管理器
├── interceptors.ts   # 拦截器管理器
├── client.ts         # 核心 API 客户端
├── config.ts         # 环境配置
├── auth.ts           # 认证 API 模块
├── billing.ts        # 计费 API 模块
└── session.ts        # 会话 API 模块
```

## 快速开始

### 安装

无需额外安装，已集成在项目中。

### 基础使用

```typescript
import { authApi, billingApi, sessionApi } from '@/ui/lib/api';

// 登录
const result = await authApi.login('user@example.com', 'password');

// 获取余额
const balance = await authApi.getBalance();

// 创建充值订单
const order = await billingApi.createRecharge({
  amount: 5000,
  channel: 'xunhu_wechat'
});

// 获取会话列表
const sessions = await sessionApi.list({ page: 1, pageSize: 20 });
```

## 核心特性

- ✅ **统一接口**：所有 API 调用使用一致的方式
- ✅ **自动认证**：自动添加 Authorization 头
- ✅ **Token 刷新**：Token 过期自动刷新并重试
- ✅ **错误处理**：统一的错误类型和处理
- ✅ **请求重试**：网络错误自动重试
- ✅ **请求缓存**：减少重复请求
- ✅ **请求取消**：支持 AbortController
- ✅ **拦截器**：请求/响应/错误拦截器
- ✅ **类型安全**：100% TypeScript 类型覆盖
- ✅ **环境配置**：支持多环境配置

## 文档

- [完整使用指南](../../../docs/API_CLIENT_GUIDE.md) - 详细的使用文档和示例
- [迁移指南](../../../docs/API_MIGRATION_GUIDE.md) - 从旧代码迁移的指南
- [快速参考](../../../docs/API_QUICK_REFERENCE.md) - 一页纸速查表
- [完成报告](../../../docs/TASK_D05_COMPLETION_REPORT.md) - 任务实现详情

## API 模块

### 认证 API (authApi)

```typescript
authApi.login(email, password)          // 登录
authApi.logout()                        // 登出
authApi.getUserInfo()                   // 获取用户信息
authApi.getBalance()                    // 获取余额
authApi.refreshToken(refreshToken)      // 刷新令牌
authApi.verifyToken()                   // 验证令牌
authApi.getOAuthUrl(provider)           // 获取 OAuth URL
authApi.handleOAuthCallback(...)        // 处理 OAuth 回调
```

### 计费 API (billingApi)

```typescript
billingApi.createRecharge(params)       // 创建充值订单
billingApi.checkPaymentStatus(orderId)  // 查询支付状态
billingApi.getBalance()                 // 获取余额
billingApi.getUsage(params)             // 获取使用记录
billingApi.getTransactions(params)      // 获取交易记录
billingApi.cancelRecharge(orderId)      // 取消充值订单
```

### 会话 API (sessionApi)

```typescript
sessionApi.list(params)                 // 获取会话列表
sessionApi.get(sessionId)               // 获取会话详情
sessionApi.create(data)                 // 创建会话
sessionApi.update(sessionId, data)      // 更新会话
sessionApi.delete(sessionId)            // 删除会话
sessionApi.search(params)               // 搜索会话
sessionApi.getTags()                    // 获取标签列表
```

## 高级功能

### 请求重试

```typescript
const response = await apiClient.get('/endpoint', {
  retry: {
    maxRetries: 3,
    retryDelay: 1000,
    retryDelayMultiplier: 2
  }
});
```

### 请求缓存

```typescript
const response = await apiClient.get('/endpoint', {
  cache: {
    enabled: true,
    ttl: 60000, // 1 分钟
    key: 'custom-key'
  }
});
```

### 请求取消

```typescript
const controller = new AbortController();
const promise = apiClient.get('/endpoint', {
  signal: controller.signal
});
controller.abort(); // 取消请求
```

### 自定义拦截器

```typescript
// 请求拦截器
apiClient.interceptor.addRequestInterceptor((url, config) => {
  config.headers['X-Custom-Header'] = 'value';
  return { url, config };
});

// 响应拦截器
apiClient.interceptor.addResponseInterceptor((response, data) => {
  console.log('Response:', data);
  return data;
});

// 错误拦截器
apiClient.interceptor.addErrorInterceptor((error) => {
  console.error('Error:', error);
  return error;
});
```

## 错误处理

```typescript
import { ApiError } from '@/ui/lib/api';

try {
  const data = await authApi.login(email, password);
} catch (error) {
  if (error instanceof ApiError) {
    console.log('状态码:', error.status);
    console.log('错误代码:', error.code);
    console.log('错误消息:', error.message);

    // 判断错误类型
    if (error.isAuthError) {
      // 401/403 认证错误
    } else if (error.isNetworkError) {
      // 网络错误
    } else if (error.isServerError) {
      // 500+ 服务器错误
    }
  }
}
```

## 环境配置

### .env 配置

```bash
# .env.development
VITE_API_BASE_URL=http://localhost:3000/api
VITE_ENV=development

# .env.production
VITE_API_BASE_URL=https://api.example.com/api
VITE_ENV=production
```

### 代码配置

```typescript
import { envConfig, env } from '@/ui/lib/api/config';

// 检查环境
if (env.isDevelopment) {
  console.log('Running in development');
}

// 获取配置
console.log('API URL:', envConfig.apiBaseURL);
console.log('Enable Logging:', envConfig.enableLogging);
```

## 最佳实践

### 在 Store 中使用

```typescript
import { create } from 'zustand';
import { authApi, ApiError } from '@/ui/lib/api';

export const useAuthStore = create((set) => ({
  user: null,
  loading: false,
  error: null,

  fetchUser: async () => {
    set({ loading: true, error: null });
    try {
      const user = await authApi.getUserInfo();
      set({ user, loading: false });
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : '获取失败';
      set({ error: msg, loading: false });
    }
  }
}));
```

### 在组件中使用

```typescript
import { useState } from 'react';
import { billingApi, ApiError } from '@/ui/lib/api';

function Component() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecharge = async (amount: number) => {
    setLoading(true);
    setError(null);

    try {
      const order = await billingApi.createRecharge({
        amount,
        channel: 'xunhu_wechat'
      });
      // 处理订单
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    // ...
  );
}
```

## 迁移指南

如果你正在从旧的 API 调用方式迁移，请参考 [迁移指南](../../../docs/API_MIGRATION_GUIDE.md)。

### 迁移对照表

| 旧方式 | 新方式 |
|-------|-------|
| `fetch('/auth/login')` | `authApi.login(email, password)` |
| `window.electron.getBalance()` | `authApi.getBalance()` |
| `window.electron.createRechargeOrder()` | `billingApi.createRecharge()` |
| `window.electron.getSessions()` | `sessionApi.list()` |

## 贡献

如有问题或建议，请提交 Issue 或 Pull Request。

## License

MIT
