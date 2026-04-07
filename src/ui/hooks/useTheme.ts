import { useCallback, useEffect, useState } from 'react'

// 主题类型定义
export type Theme = 'light' | 'dark' | 'system'

// 本地存储的 key
const THEME_STORAGE_KEY = 'theme-preference'

// 获取系统主题偏好
const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// 从本地存储获取主题
const getStoredTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

type ThemeListener = (theme: Theme) => void

let currentTheme: Theme = getStoredTheme()
const themeListeners = new Set<ThemeListener>()

const subscribeTheme = (listener: ThemeListener) => {
  themeListeners.add(listener)
  return () => themeListeners.delete(listener)
}

const notifyTheme = (theme: Theme) => {
  themeListeners.forEach((listener) => listener(theme))
}

const setGlobalTheme = (theme: Theme) => {
  currentTheme = theme
  if (typeof window !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
  notifyTheme(theme)
}

const syncTitleBarOverlayTheme = (effectiveTheme: 'light' | 'dark'): void => {
  const setOverlayTheme = window.electron?.window?.setTitleBarOverlayTheme
  if (typeof setOverlayTheme !== 'function') return

  void setOverlayTheme(effectiveTheme).catch((error) => {
    console.warn('[Theme] Failed to sync title bar overlay theme:', error)
  })
}

// 应用主题到 DOM
const applyTheme = (theme: Theme): void => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const effectiveTheme = theme === 'system' ? getSystemTheme() : theme

  // 移除所有主题类
  root.classList.remove('theme-light', 'theme-dark', 'theme-system')

  // 添加生效主题类（确保 dark: 变体可用）
  root.classList.add(`theme-${effectiveTheme}`)

  // 记录是否为系统主题（用于调试或未来扩展）
  if (theme === 'system') {
    root.classList.add('theme-system')
  }

  // 更新 meta theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute(
      'content',
      effectiveTheme === 'dark' ? '#0f0f0f' : '#ffffff'
    )
  }
}

/**
 * useTheme Hook
 *
 * 管理应用的主题状态，支持浅色、深色和跟随系统三种模式。
 *
 * @example
 * ```tsx
 * function ThemeToggle() {
 *   const { theme, setTheme, effectiveTheme } = useTheme()
 *
 *   return (
 *     <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
 *       <option value="light">浅色</option>
 *       <option value="dark">深色</option>
 *       <option value="system">跟随系统</option>
 *     </select>
 *   )
 * }
 * ```
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme)
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(
    currentTheme === 'system' ? getSystemTheme() : currentTheme
  )

  // 设置主题并保存到本地存储
  const setTheme = useCallback((newTheme: Theme) => {
    if (newTheme === currentTheme) return
    setGlobalTheme(newTheme)
  }, [])

  // 切换主题 (light -> dark -> system -> light)
  const toggleTheme = useCallback(() => {
    const nextTheme: Theme =
      theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(nextTheme)
  }, [theme, setTheme])

  // 同步全局主题变更
  useEffect(() => {
    const unsubscribe = subscribeTheme(setThemeState)
    return () => { unsubscribe() }
  }, [])

  // 初始化时应用主题
  useEffect(() => {
    const nextEffectiveTheme = theme === 'system' ? getSystemTheme() : theme
    applyTheme(theme)
    setEffectiveTheme(nextEffectiveTheme)
    syncTitleBarOverlayTheme(nextEffectiveTheme)
  }, [theme])

  // 监听系统主题变化
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      const nextEffectiveTheme = e.matches ? 'dark' : 'light'
      setEffectiveTheme(nextEffectiveTheme)
      applyTheme('system')
      syncTitleBarOverlayTheme(nextEffectiveTheme)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  return {
    /** 当前主题设置 (light/dark/system) */
    theme,
    /** 设置主题 */
    setTheme,
    /** 切换到下一个主题 */
    toggleTheme,
    /** 实际生效的主题 (light/dark) */
    effectiveTheme,
    /** 是否为深色模式 */
    isDark: effectiveTheme === 'dark',
  }
}

export default useTheme
