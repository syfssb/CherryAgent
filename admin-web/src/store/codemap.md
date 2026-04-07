# src/store/

## Responsibility
全局状态管理，使用 Zustand 管理管理员认证信息、UI 状态（侧边栏、主题）。支持 localStorage 持久化、权限检查、主题切换。

## Design
**状态结构（useAdminStore）：**
- `admin: AdminUser | null` — 登录用户信息（id, username, email, role, permissions）
- `token: string | null` — JWT token
- `isAuthenticated: boolean` — 认证状态
- `isLoading: boolean` — auth check 进行中
- `sidebarCollapsed: boolean` — 侧边栏折叠状态
- `theme: 'light' | 'dark' | 'system'` — 主题

**核心方法：**
- setAdmin(admin, token) — 登录后设置用户和 token，isAuthenticated = true
- logout() — 清空用户、token、认证状态
- setLoading(loading) — 设置加载状态
- toggleSidebar() → 切换侧边栏
- setSidebarCollapsed(boolean) → 设置侧边栏状态
- hasPermission(permission) → boolean（检查权限或 super_admin）
- setTheme(theme) → 设置主题并应用到 DOM

**持久化配置：**
- 持久化字段：admin, token, isAuthenticated, sidebarCollapsed, theme
- 存储媒介：localStorage（key: "admin-storage"）
- 初始化时恢复存储状态，isLoading = false

**主题系统：**
- applyTheme() — 将主题应用到 document.documentElement
  - 'system' → 检查 prefers-color-scheme 媒体查询
  - 'dark' → 添加 dark class
  - 'light' → 移除 dark class
- 监听系统主题变化：window.matchMedia('prefers-color-scheme: dark') change 事件

## Flow
**认证流：**
1. 用户登录 → 后端返回 token + user info
2. 组件调用 setAdmin(user, token)
3. store 更新状态 + 自动存储到 localStorage
4. App.tsx ProtectedRoute 检查 isAuthenticated → true → 显示页面
5. 登出 → logout() → token + admin 清空 → isAuthenticated = false → 重定向 /login

**主题流：**
1. 用户选择主题 → setTheme(theme)
2. store 更新 theme 状态 + 调用 applyTheme()
3. applyTheme() 修改 document.documentElement 的 dark class
4. Tailwind dark: prefix 样式自动生效
5. 状态自动保存到 localStorage

## Integration
- **依赖：** zustand、zustand/middleware (persist, createJSONStorage)
- **被依赖：** App.tsx (ProtectedRoute)、AdminLayout（显示用户信息、侧边栏、主题）、services/api.ts（获取 token）、所有需要主题/权限检查的组件
- **关键接口：** useAdminStore.getState()、useAdminStore()(hook 形式)、setAdmin、logout、setTheme、hasPermission
