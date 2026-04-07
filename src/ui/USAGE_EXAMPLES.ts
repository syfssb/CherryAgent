/**
 * 前端基础设施使用示例
 *
 * 本文件展示如何在项目中使用 i18n 国际化和主题系统
 */

// ============================================
// 1. 在应用入口初始化 i18n
// ============================================
//
// 在 main.tsx 中:
//
// ```tsx
// import { StrictMode, Suspense } from 'react'
// import { createRoot } from 'react-dom/client'
// import './i18n/config' // 初始化 i18n
// import './styles/themes.css' // 导入主题样式
// import './index.css'
// import App from './App'
//
// createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <Suspense fallback={<div>Loading...</div>}>
//       <App />
//     </Suspense>
//   </StrictMode>
// )
// ```

// ============================================
// 2. 在组件中使用翻译
// ============================================
//
// ```tsx
// import { useTranslation } from '../i18n'
//
// export function Sidebar() {
//   const { t } = useTranslation()
//
//   return (
//     <aside>
//       <button>{t('sidebar.newTask')}</button>
//       <div>{t('sidebar.noSessions')}</div>
//     </aside>
//   )
// }
// ```

// ============================================
// 3. 使用带参数的翻译
// ============================================
//
// ```tsx
// // 翻译文件: "time.minutesAgo": "{{count}} 分钟前"
//
// function TimeAgo({ minutes }: { minutes: number }) {
//   const { t } = useTranslation()
//   return <span>{t('time.minutesAgo', { count: minutes })}</span>
// }
// ```

// ============================================
// 4. 语言切换组件
// ============================================
//
// ```tsx
// import { useTranslation } from 'react-i18next'
// import { SUPPORTED_LANGUAGES, changeLanguage, type SupportedLanguage } from '../i18n'
//
// export function LanguageSwitcher() {
//   const { i18n, t } = useTranslation()
//
//   const handleChange = async (lang: SupportedLanguage) => {
//     await changeLanguage(lang)
//   }
//
//   return (
//     <select
//       value={i18n.language}
//       onChange={(e) => handleChange(e.target.value as SupportedLanguage)}
//     >
//       {Object.entries(SUPPORTED_LANGUAGES).map(([code, { nativeName }]) => (
//         <option key={code} value={code}>
//           {nativeName}
//         </option>
//       ))}
//     </select>
//   )
// }
// ```

// ============================================
// 5. 主题切换组件
// ============================================
//
// ```tsx
// import { useTheme } from '../hooks/useTheme'
//
// export function ThemeSwitcher() {
//   const { theme, setTheme, isDark } = useTheme()
//
//   return (
//     <div className="flex gap-2">
//       <button
//         onClick={() => setTheme('light')}
//         className={theme === 'light' ? 'active' : ''}
//       >
//         浅色
//       </button>
//       <button
//         onClick={() => setTheme('dark')}
//         className={theme === 'dark' ? 'active' : ''}
//       >
//         深色
//       </button>
//       <button
//         onClick={() => setTheme('system')}
//         className={theme === 'system' ? 'active' : ''}
//       >
//         跟随系统
//       </button>
//     </div>
//   )
// }
// ```

// ============================================
// 6. 使用 CSS 变量
// ============================================
//
// ```css
// .card {
//   background-color: var(--color-surface);
//   border: 1px solid var(--color-border-primary);
//   border-radius: var(--radius-xl);
//   box-shadow: var(--shadow-md);
//   color: var(--color-text-primary);
// }
//
// .button-primary {
//   background-color: var(--color-accent);
//   color: var(--color-text-inverse);
// }
//
// .button-primary:hover {
//   background-color: var(--color-accent-hover);
// }
//
// .error-message {
//   background-color: var(--color-error-bg);
//   color: var(--color-error);
//   border: 1px solid var(--color-error);
// }
// ```

// ============================================
// 7. 在 Tailwind 中使用 CSS 变量
// ============================================
//
// 可以在 tailwind.config.js 中扩展颜色:
//
// ```js
// export default {
//   theme: {
//     extend: {
//       colors: {
//         surface: 'var(--color-surface)',
//         'surface-secondary': 'var(--color-surface-secondary)',
//         accent: {
//           DEFAULT: 'var(--color-accent)',
//           hover: 'var(--color-accent-hover)',
//           subtle: 'var(--color-accent-subtle)',
//         },
//       },
//     },
//   },
// }
// ```
//
// 然后使用: className="bg-surface text-primary border-accent"

// ============================================
// 8. 环境变量使用
// ============================================
//
// ```tsx
// // 获取 API 基础 URL
// const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
//
// // 检查是否为开发环境
// if (import.meta.env.DEV) {
//   console.log('Running in development mode')
// }
// ```

export {}
