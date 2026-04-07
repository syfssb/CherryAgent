# src/

## Responsibility
admin-web 应用的核心入口和路由层。通过 React Router 建立完整的后台管理系统路由树，支持代码分割、认证保护、权限管理，提供统一的 UI 布局框架和加载状态处理。

## Design
**入口架构：**
- `main.tsx` — 初始化 React + React Query（5min staleTime, 30min gcTime）+ BrowserRouter + Toaster
- `App.tsx` — 路由根组件，支持 Suspense 代码分割、auth guard（ProtectedRoute）、404 处理

**认证流：**
- 所有非登录页面被 ProtectedRoute 保护，检查 useAdminStore 的 isAuthenticated + isLoading
- 未认证 → Navigate to /login；加载中 → FullScreenLoader；认证成功 → AdminLayout + 嵌套路由

**路由分层（Suspense + lazy()）：**
- 顶层 Suspense fallback：FullScreenLoader（全屏加载）
- 内层 Suspense fallback：PageLoader（部分页面加载）
- 每个页面通过 lazy() 动态导入，实现代码分割

## Flow
1. **启动流程：** main.tsx → React.StrictMode → QueryClientProvider → BrowserRouter → App
2. **路由流程：** /login（公开）→ 其他路由通过 ProtectedRoute 检查认证 → 进入 AdminLayout → 嵌套路由
3. **加载流程：** isLoading=true → FullScreenLoader → auth check 完成 → isLoading=false → 正常渲染
4. **数据获取：** React Query 统一管理，默认 5 分钟过期，30 分钟缓存清理，单次重试

## Integration
- **依赖：** pages/*（所有页面）、components/layout/AdminLayout、@tanstack/react-query、zustand store
- **被依赖：** 无
- **关键接口：** ProtectedRoute（认证守卫）、PageLoader/FullScreenLoader（加载态）、404 NotFoundPage
