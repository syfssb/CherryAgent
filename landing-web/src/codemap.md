# src/

## Responsibility
落地页 UI 入口层。聚合 App.tsx 路由导出、ThemeProvider 主题上下文、i18n 国际化配置、样式与组件库。

## Design
- **架构**: React SPA，路由由 App.tsx 管理，两个主页面（Landing / Register）
- **主题系统**: ThemeProvider 提供 light/dark 切换，localStorage 持久化 + 系统偏好侦测
- **国际化**: i18next 统一配置，支持 4 种语言（中文简/繁、英文、日文）
- **样式**: Tailwind CSS 基础 + 自定义 dark 模式，index.css 提供全局样式

## Flow
1. main.tsx 初始化：StrictMode + ThemeProvider + BrowserRouter 嵌套
2. App.tsx 声明两条路由：`/` → Landing / `/register` → Register
3. 每个页面顶部调用 trackPageView() 埋点，下层组件通过 useTranslation() 读 i18n

## Integration
- 依赖：components/ (UI 组件) / contexts/ (ThemeContext) / i18n/ (多语言) / lib/ (API、常量、埋点) / pages/ (页面)
- 被依赖：main.tsx、package.json scripts
- 关键接口：
  - `useTheme()` → { theme, toggleTheme }
  - `i18n.t(key)` → 翻译字符串
  - `trackPageView()` → 埋点
  - `register() / getLatestVersion() / getWelcomeCredits()` → API
