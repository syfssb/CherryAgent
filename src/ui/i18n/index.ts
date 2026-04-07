// i18n configuration exports
export { default } from './config'
export {
  changeLanguage,
  getCurrentLanguage,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
} from './config'
export type { SupportedLanguage } from './config'

// Re-export react-i18next hooks for convenience
export { useTranslation, Trans } from 'react-i18next'
