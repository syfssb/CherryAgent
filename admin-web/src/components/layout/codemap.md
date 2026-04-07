# src/components/layout/

## Responsibility
页面布局组件，提供统一的后台管理页面框架，包括侧边栏导航、顶部栏、主内容区域、登出功能、主题切换等。所有受保护页面都通过 AdminLayout 包装。

## Design
**主要组件：**
- AdminLayout — 主框架组件，包含 sidebar + top bar + main content area
  - 侧边栏：导航菜单、收起/展开动画
  - 顶部栏：用户信息、主题切换、登出
  - 主内容区：响应式 padding，支持深色模式

**状态管理：**
- useAdminStore（Zustand）— admin 信息、token、认证状态、侧边栏折叠状态、主题
- localStorage 持久化 — 侧边栏折叠状态、主题选择

**响应式设计：**
- 手机端：侧边栏收起、菜单 dropdown
- 平板/桌面：侧边栏展开/收起切换

## Flow
1. ProtectedRoute 验证认证 → AdminLayout 显示页面框架
2. AdminLayout 从 useAdminStore 读取 admin、token、侧边栏状态、主题
3. 顶部栏提供：用户菜单（个人资料、设置、登出）、主题切换（light/dark/system）
4. 侧边栏显示导航菜单，当前路由高亮
5. 登出 → useAdminStore.logout() → 清空 token + admin → Navigate to /login

## Integration
- **依赖：** useAdminStore（Zustand store）、useNavigate/useLocation（React Router）、UI components、lucide-react（图标）
- **被依赖：** App.tsx（所有受保护路由的包装容器）
- **关键接口：** AdminLayout({ children })、导航菜单配置（可从常量或 API 获取）
