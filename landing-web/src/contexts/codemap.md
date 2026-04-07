# src/contexts/

## Responsibility
应用级全局状态管理。提供主题（light/dark）切换能力，localStorage 持久化 + 系统偏好侦测。

## Design
- **Context API**: createContext + useContext 模式，避免 prop drilling
- **主题检测**:
  1. 优先读 localStorage 中的 `theme` 值
  2. 无存储时读系统偏好 `prefers-color-scheme: dark`
  3. 默认兜底为 `light`
- **样式应用**: theme 变化时自动添加/移除 `dark` 类到 `document.documentElement`，由 Tailwind 的 dark: 前缀响应
- **类型安全**: TypeScript Interface ThemeContextType 确保 Hook 返回值结构

## Flow
1. ThemeProvider 组件包装应用根部（main.tsx）
2. 初始化时调用 getInitialTheme() 读取初始值
3. 用户点击 toggleTheme() → setTheme 更新 state → useEffect 应用到 DOM + localStorage
4. 任何子组件调用 useTheme() 都能读取当前主题 + toggleTheme 函数

## Integration
- 依赖：React hooks (createContext / useContext / useState / useEffect)
- 被依赖：main.tsx (包装应用) / ThemeSwitcher.tsx / 所有需要响应主题的组件
- 关键接口：
  - `useTheme()` → { theme: 'light' | 'dark', toggleTheme: () => void }
  - localStorage key: `theme` → value: 'light' | 'dark'
