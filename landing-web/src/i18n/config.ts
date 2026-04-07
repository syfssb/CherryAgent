import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './locales/zh.json';
import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

function detectBrowserLanguage(): LanguageCode {
  const browserLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || '';
  const lower = browserLang.toLowerCase();

  if (lower.startsWith('ja')) return 'ja';
  if (
    lower.startsWith('zh-tw') ||
    lower.startsWith('zh-hk') ||
    lower.startsWith('zh-mo') ||
    lower.startsWith('zh-hant')
  ) {
    return 'zh-TW';
  }
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en';

  return 'zh-CN';
}

function getInitialLanguage(): LanguageCode {
  const stored = localStorage.getItem('i18nextLng');
  if (stored) {
    // 兼容旧值迁移
    if (stored === 'zh') {
      localStorage.setItem('i18nextLng', 'zh-CN');
      return 'zh-CN';
    }
    const valid = SUPPORTED_LANGUAGES.find(l => l.code === stored);
    if (valid) return valid.code;
  }
  return detectBrowserLanguage();
}

const initialLang = getInitialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zh },
      en: { translation: en },
      'zh-TW': { translation: zhTW },
      ja: { translation: ja },
    },
    lng: initialLang,
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', (lng: string) => {
  localStorage.setItem('i18nextLng', lng);
  document.documentElement.lang = lng;
});

// Set initial html lang
document.documentElement.lang = initialLang;

export default i18n;
