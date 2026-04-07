# src/ui/i18n/

## Responsibility
集中管理国际化（i18n）配置，支持中文、繁体中文、英文、日文四种语言，并提供语言切换和检测机制。

## Design
- **i18next 集成**：`config.ts` 初始化 i18next，配置语言检测、资源加载、React 集成
- **语言检测顺序**：localStorage (用户选择) → navigator.language (浏览器设置) → htmlTag (文档属性)
- **资源管理**：从 `locales/*.json` 加载各语言翻译资源
- **导出接口**：统一通过 `index.ts` 暴露 `useTranslation` hook 和切换函数

## Flow
```
应用启动
  → i18n.use(LanguageDetector, initReactI18next)
  → i18n.init({ resources, supportedLngs, fallbackLng })
  → 浏览器语言检测 (localStorage → navigator → htmlTag)

用户切换语言
  → changeLanguage(lang)
  → i18n.changeLanguage() 切换
  → 保存到 localStorage (key: i18nextLng)
  → 所有组件自动更新 (useTranslation hook)

组件使用
  → useTranslation() 或 Trans 组件
  → 自动从当前语言资源获取翻译
```

## Integration
- **依赖**：i18next、i18next-browser-languagedetector、react-i18next、本地 JSON 资源文件
- **被依赖**：整个应用（几乎所有展示文本都通过 i18n）
- **关键接口**：
  - `changeLanguage(lang: SupportedLanguage)` → 切换语言
  - `getCurrentLanguage()` → 获取当前语言
  - `isSupportedLanguage(lang)` → 验证语言代码
  - `SUPPORTED_LANGUAGES` → 支持的语言列表 (zh, zh-TW, en, ja)
  - `DEFAULT_LANGUAGE` → 默认语言 (en)
