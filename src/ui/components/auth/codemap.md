# src/ui/components/auth/

认证与授权层，管理用户登录、注册、会话恢复和受保护路由。

## Responsibility

- **应用初始化** (`AppInitializer`)：启动时检验 token 有效性、自动刷新过期 token、恢复用户会话
- **登录界面** (`LoginModal`)：邮箱密码登录、Google OAuth、注册流程
- **受保护路由** (`ProtectedRoute`)：条件性渲染，未认证用户重定向到登录
- **认证守卫** (`AuthGuard`)：基于认证状态的内容渲染（`<AuthOnly>` / `<GuestOnly>`）
- **用户菜单** (`UserMenu`)：显示用户信息、登出、账户设置入口
- **Clerk Provider** (`ClerkProvider`)：包装 Clerk 认证库（暂未启用）

## Design

### 核心模式

1. **Zustand 状态管理** (`useAuthStore`)
   - 单一真值源：`isAuthenticated`, `accessToken`, `refreshToken`, `user` 等
   - 状态操作：`login()`, `logout()`, `refresh()`, `updateProfile()`
   - 低敏持久化：仅持久化 `user` / `welcomeBonus`；认证凭据仅保留在内存 + 主进程 secure-storage

2. **Token 生命周期**
   - 存储：主进程 `secure-storage` 保存 access/refresh token；渲染进程只保留运行时内存副本
   - 校验：`isTokenExpired()` 检查过期时间
   - 刷新：`refresh()` 调用 `/api/auth/refresh` 获取新 token
   - 清空：`logout()` 清除 token 和用户数据

3. **OAuth 流程** (Google)
   - 前端：`LoginModal` 打开 OAuth popup → 监听 `popupwindow.location` 回调 URL
   - Popup 检测：IPC `auth:closeOAuthWindows` 强制关闭子窗口
   - 后端：`/api/auth/oauth/:provider/callback` 验证 code 并返回 token

4. **条件渲染模式**
   - `<ProtectedRoute>`：基于 `isAuthenticated` 条件式渲染
   - `<AuthOnly>`：仅显示给已认证用户
   - `<GuestOnly>`：仅显示给未认证用户（登录/注册页面）

## Flow

```
应用启动 (App.tsx)
  ↓
<AppInitializer>
  ↓
检查主进程 secure-storage + 内存态
  ├─ 有有效 token → restoreSession() 后设置 isAuthenticated = true
  ├─ token 过期 + 有 refreshToken → 调用 refresh() 自动刷新
  └─ 无有效 token → 设置 isAuthenticated = false
  ↓
渲染 children (加载完整应用)
  ↓
<AuthGuard>（可选包装）
  ├─ isAuthenticated = true → 渲染受保护内容
  └─ isAuthenticated = false → 渲染 LoginModal / GuestOnly
  ↓
<ProtectedRoute>（路由级保护）
  ├─ 已认证 → 渲染目标组件
  └─ 未认证 → 重定向 / 显示登录
```

### 登录流程

```
1. 用户点击 LoginModal 中的"邮箱登录"或"Google 登录"
2. 邮箱登录：POST /api/auth/login → 获取 { accessToken, refreshToken, user }
3. Google OAuth：
   - 生成 state + PKCE code_challenge，签名 state
   - 打开 Google 授权 URL
   - 用户授权后 redirect_uri 捕获 code + state
   - POST /api/auth/oauth/google/callback 验证 state、交换 token
4. store.login() 保存 token 到主进程 secure-storage，并在渲染进程保留内存态
5. isAuthenticated 变 true → 应用重新渲染保护内容
```

### Token 刷新流程

```
发送请求时检测 token 过期
  ↓
if (isTokenExpired()) {
  await refresh()  // POST /api/auth/refresh
  ↓
  成功 → 更新 accessToken，重试原请求
  失败 → logout()，跳转登录页
}
```

## Integration

### 依赖

- **Stores**：
  - `useAuthStore` — 认证状态中心
  - `useBillingStore` — 取决于 AppInitializer 的初始化完成（获取余额）

- **IPC Handlers** (`src/electron/ipc-handlers.ts`)：
  - `auth:closeOAuthWindows` — 关闭 OAuth popup 窗口
  - `billing:openExternalUrl` — 在浏览器打开支付链接

- **API Routes**：
  - `POST /api/auth/login` — 邮箱密码登录
  - `POST /api/auth/logout` — 服务端登出（清除 session）
  - `POST /api/auth/refresh` — 刷新 token
  - `GET /api/auth/oauth/:provider` — 获取 OAuth 授权 URL
  - `POST /api/auth/oauth/:provider/callback` — OAuth 回调处理

- **Localization** (`react-i18next`)：
  - 登录界面、错误提示、用户菜单文本 i18n

### 被依赖

- **App.tsx**：`<AppInitializer>` 作为最外层包装
- **路由配置**：`<ProtectedRoute>` 包装需要认证的页面
- **侧边栏**：`<UserMenu>` 显示当前用户
- **页面组件**：`<AuthGuard>` / `<AuthOnly>` 条件渲染

### 关键接口

```typescript
// useAuthStore 核心状态
interface AuthState {
  // 状态
  isAuthenticated: boolean
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  balance: number
  isTokenExpired: () => boolean
  
  // 操作
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<boolean>
  updateProfile: (data: Partial<User>) => void
  fetchBalance: () => Promise<void>
}

// LoginModal props
interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

// ProtectedRoute props
interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

// AuthGuard props
interface AuthGuardProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}
```

### 文件清单

| 文件 | 职责 | 关键导出 |
|------|------|--------|
| `AppInitializer.tsx` | 应用启动时的 token 校验和恢复 | `AppInitializer`, `withAppInitializer` |
| `LoginModal.tsx` | 登录和注册界面 | `LoginModal`, `type LoginModalProps` |
| `AuthGuard.tsx` | 条件式认证内容守卫 | `AuthGuard`, `AuthOnly`, `GuestOnly`, `withAuthGuard` |
| `ProtectedRoute.tsx` | 路由级认证保护 | `ProtectedRoute`, `withProtectedRoute` |
| `UserMenu.tsx` | 用户菜单（显示用户信息、登出） | `UserMenu`, `type UserMenuProps` |
| `LogoutConfirmDialog.tsx` | 登出确认对话框 | `LogoutConfirmDialog` |
| `ClerkProvider.tsx` | Clerk OAuth 库包装（未启用） | `ClerkProvider` |
| `index.ts` | Barrel export | 所有组件和类型 |

## 关键 Bug 修复历史

1. **OAuth popup 不自动关闭**（2026-02-10 修复）
   - Electron 窗口管理：`main.ts` 的 `setWindowOpenHandler` + `did-create-window` 事件追踪
   - 回调 URL 检测：监听 `will-navigate` / `did-navigate` 后调用 `window.destroy()`
   - 前端 IPC 强制关闭：`LoginModal` 登录成功后 IPC `auth:closeOAuthWindows` 清空所有 OAuth 窗口

2. **state 回放攻击防护**（2026-03-01 修复）
   - `oauth-state.ts` 生成签名 state（包含 provider + redirect_uri 信息）
   - 回调处强制校验：provider、redirect_uri、过期时间（5分钟）、重放检测、PKCE
   - state 改为必填字段，拒绝无 state 的请求
