import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import zh from './locales/zh.json'
import en from './locales/en.json'

// 定义支持的语言
export const SUPPORTED_LANGUAGES = {
  zh: { name: '中文', nativeName: '中文' },
  'zh-TW': { name: '繁体中文', nativeName: '繁體中文' },
  en: { name: 'English', nativeName: 'English' },
  ja: { name: '日本語', nativeName: '日本語' },
} as const

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES

// 默认语言
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en'

// 需要按需加载的语言
const LAZY_LANGUAGES = new Set<string>(['zh-TW', 'ja'])

// 语言资源（仅包含静态导入的语言）
const resources = {
  zh: { translation: zh },
  en: { translation: en },
}

// 按需加载语言资源
async function loadLanguageBundle(lng: string): Promise<void> {
  if (!LAZY_LANGUAGES.has(lng)) return
  if (i18n.hasResourceBundle(lng, 'translation')) return

  try {
    let mod: { default: Record<string, unknown> }
    if (lng === 'zh-TW') {
      mod = await import('./locales/zh-TW.json')
    } else if (lng === 'ja') {
      mod = await import('./locales/ja.json')
    } else {
      return
    }
    i18n.addResourceBundle(lng, 'translation', mod.default)
  } catch (error) {
    console.error(`[i18n] Failed to load language bundle: ${lng}`, error)
  }
}

// 初始化 i18next
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: Object.keys(SUPPORTED_LANGUAGES),
    fallbackLng: DEFAULT_LANGUAGE,
    debug: import.meta.env.DEV,

    interpolation: {
      escapeValue: false, // React 已经处理 XSS
    },

    detection: {
      // 语言检测顺序
      order: ['localStorage', 'navigator', 'htmlTag'],
      // 缓存用户语言选择
      caches: ['localStorage'],
      // localStorage key
      lookupLocalStorage: 'i18nextLng',
    },

    // React 相关配置
    react: {
      useSuspense: true,
    },
  })

// 语言切换时按需加载资源
i18n.on('languageChanged', (lng) => {
  if (LAZY_LANGUAGES.has(lng) && !i18n.hasResourceBundle(lng, 'translation')) {
    loadLanguageBundle(lng)
  }
})

// 初始化时如果检测到的语言需要按需加载，立即加载
if (LAZY_LANGUAGES.has(i18n.language)) {
  loadLanguageBundle(i18n.language)
}

// 切换语言的工具函数
export const changeLanguage = async (language: SupportedLanguage): Promise<void> => {
  // 先加载资源再切换，避免闪烁
  await loadLanguageBundle(language)
  await i18n.changeLanguage(language)
}

const supportedLanguageList = Object.keys(SUPPORTED_LANGUAGES) as SupportedLanguage[]

export const resolveSupportedLanguage = (lang?: string): SupportedLanguage | null => {
  if (!lang) return null

  const lower = lang.toLowerCase()
  const exactMatch = supportedLanguageList.find((code) => code.toLowerCase() === lower)
  if (exactMatch) return exactMatch

  const base = lower.split('-')[0]
  const baseMatch = supportedLanguageList.find((code) => code.toLowerCase() === base)
  if (baseMatch) return baseMatch

  return null
}

export const normalizeLanguage = (lang?: string): SupportedLanguage => {
  return resolveSupportedLanguage(lang) || DEFAULT_LANGUAGE
}

// 获取当前语言
export const getCurrentLanguage = (): SupportedLanguage => {
  return normalizeLanguage(i18n.language)
}

// 获取当前语言对应的 locale（用于日期/数字格式化）
export const getLocaleFromLanguage = (language?: string): string => {
  const normalized = normalizeLanguage(language || i18n.language)
  if (normalized === 'zh') return 'zh-CN'
  if (normalized === 'zh-TW') return 'zh-TW'
  if (normalized === 'ja') return 'ja-JP'
  return 'en-US'
}

// 检查是否是支持的语言
export const isSupportedLanguage = (lang: string): lang is SupportedLanguage => {
  return lang in SUPPORTED_LANGUAGES
}

export default i18n
