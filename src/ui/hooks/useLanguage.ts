/**
 * 语言切换 Hook
 * 管理应用的多语言状态，支持动态切换和持久化
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  changeLanguage as i18nChangeLanguage,
  getCurrentLanguage,
  isSupportedLanguage,
  resolveSupportedLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/ui/i18n/config';

// 重新导出 SupportedLanguage 类型
export type { SupportedLanguage } from '@/ui/i18n/config';

// 语言存储的 key
const LANGUAGE_STORAGE_KEY = 'i18nextLng';

async function syncDesktopLanguage(lang: SupportedLanguage): Promise<void> {
  try {
    await window.electron?.app?.setLanguage?.(lang);
  } catch (error) {
    console.warn('[useLanguage] Failed to sync desktop language:', error);
  }
}

// 语言信息类型
export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
}

// Hook 返回类型
export interface UseLanguageReturn {
  /** 当前语言代码 */
  language: SupportedLanguage;
  /** 当前语言信息 */
  languageInfo: LanguageInfo;
  /** 所有支持的语言列表 */
  supportedLanguages: LanguageInfo[];
  /** 是否正在切换语言 */
  isChanging: boolean;
  /** 切换语言 */
  changeLanguage: (lang: SupportedLanguage) => Promise<void>;
  /** 切换到下一个语言 */
  toggleLanguage: () => Promise<void>;
  /** 检查是否是当前语言 */
  isCurrentLanguage: (lang: string) => boolean;
  /** t 函数 */
  t: ReturnType<typeof useTranslation>['t'];
}

/**
 * 获取语言信息
 */
function getLanguageInfo(code: SupportedLanguage): LanguageInfo {
  const info = SUPPORTED_LANGUAGES[code];
  return {
    code,
    name: info.name,
    nativeName: info.nativeName,
  };
}

/**
 * 获取所有支持的语言列表
 */
function getSupportedLanguagesList(): LanguageInfo[] {
  return (Object.keys(SUPPORTED_LANGUAGES) as SupportedLanguage[]).map(
    getLanguageInfo
  );
}

/**
 * 语言切换 Hook
 *
 * @example
 * ```tsx
 * function LanguageSelector() {
 *   const { language, supportedLanguages, changeLanguage, t } = useLanguage();
 *
 *   return (
 *     <select
 *       value={language}
 *       onChange={(e) => changeLanguage(e.target.value as SupportedLanguage)}
 *     >
 *       {supportedLanguages.map((lang) => (
 *         <option key={lang.code} value={lang.code}>
 *           {lang.nativeName}
 *         </option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 */
export function useLanguage(): UseLanguageReturn {
  const { t, i18n: i18nInstance } = useTranslation();
  const [language, setLanguage] = useState<SupportedLanguage>(getCurrentLanguage);
  const [isChanging, setIsChanging] = useState(false);

  // 语言信息
  const languageInfo = getLanguageInfo(language);

  // 所有支持的语言
  const supportedLanguages = getSupportedLanguagesList();

  // 监听 i18n 语言变化
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      const langCode = resolveSupportedLanguage(lng);
      if (langCode) {
        setLanguage(langCode);
        setStoredLanguage(langCode);
        document.documentElement.lang = langCode;
        void syncDesktopLanguage(langCode);
      }
    };

    i18nInstance.on('languageChanged', handleLanguageChanged);

    return () => {
      i18nInstance.off('languageChanged', handleLanguageChanged);
    };
  }, [i18nInstance]);

  // 初始化时同步语言状态
  useEffect(() => {
    const currentLang = getCurrentLanguage();
    if (currentLang !== language) {
      setLanguage(currentLang);
    }
    document.documentElement.lang = currentLang;
    void syncDesktopLanguage(currentLang);
  }, []);

  /**
   * 切换语言
   */
  const changeLanguage = useCallback(async (lang: SupportedLanguage) => {
    if (!isSupportedLanguage(lang)) {
      console.warn(`[useLanguage] Unsupported language: ${lang}`);
      return;
    }

    if (lang === language) return;

    setIsChanging(true);

    try {
      await i18nChangeLanguage(lang);
      setLanguage(lang);
      setStoredLanguage(lang);
      await syncDesktopLanguage(lang);

      // 更新 html lang 属性
      document.documentElement.lang = lang;

      // 触发自定义事件，方便其他组件监听
      window.dispatchEvent(
        new CustomEvent('languagechange', { detail: { language: lang } })
      );

      // 兜底：确保 i18n 实例语言一致并触发更新
      if (i18nInstance.language !== lang) {
        i18nInstance.language = lang;
        i18nInstance.emit('languageChanged', lang);
      }
    } catch (error) {
      console.error('[useLanguage] Failed to change language:', error);
    } finally {
      setIsChanging(false);
    }
  }, [language, i18nInstance]);

  /**
   * 切换到下一个语言
   */
  const toggleLanguage = useCallback(async () => {
    const currentIndex = supportedLanguages.findIndex(
      (l) => l.code === language
    );
    const nextIndex = (currentIndex + 1) % supportedLanguages.length;
    const nextLang = supportedLanguages[nextIndex].code;
    await changeLanguage(nextLang);
  }, [language, supportedLanguages, changeLanguage]);

  /**
   * 检查是否是当前语言
   */
  const isCurrentLanguage = useCallback(
    (lang: string) => {
      return lang === language || lang.startsWith(`${language}-`);
    },
    [language]
  );

  return {
    language,
    languageInfo,
    supportedLanguages,
    isChanging,
    changeLanguage,
    toggleLanguage,
    isCurrentLanguage,
    t,
  };
}

/**
 * 获取浏览器首选语言
 */
export function getBrowserLanguage(): SupportedLanguage {
  if (typeof navigator === 'undefined') return 'zh';

  // 获取浏览器语言列表
  const browserLanguages = navigator.languages || [navigator.language];

  // 尝试匹配支持的语言
  for (const browserLang of browserLanguages) {
    const resolved = resolveSupportedLanguage(browserLang);
    if (resolved) {
      return resolved;
    }
  }

  // 默认返回中文
  return 'zh';
}

/**
 * 获取存储的语言偏好
 */
export function getStoredLanguage(): SupportedLanguage | null {
  if (typeof localStorage === 'undefined') return null;

  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && isSupportedLanguage(stored)) {
    return stored as SupportedLanguage;
  }

  return null;
}

/**
 * 设置语言偏好到存储
 */
export function setStoredLanguage(lang: SupportedLanguage): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

/**
 * 清除存储的语言偏好
 */
export function clearStoredLanguage(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
}

/**
 * 语言切换按钮组件 Hook
 * 提供更简洁的语言切换 UI 接口
 */
export function useLanguageToggle() {
  const { language, languageInfo, toggleLanguage, isChanging } = useLanguage();

  return {
    /** 当前语言代码 */
    code: language,
    /** 当前语言名称（原生名称） */
    name: languageInfo.nativeName,
    /** 切换语言 */
    toggle: toggleLanguage,
    /** 是否正在切换 */
    isChanging,
  };
}

export default useLanguage;
