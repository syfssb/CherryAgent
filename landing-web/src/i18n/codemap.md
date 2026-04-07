# src/i18n/

## Responsibility
多语言国际化系统。支持 4 种语言（中文简/繁、英文、日文），自动侦测浏览器偏好，localStorage 持久化。

## Design
- **i18next 框架**: 标准 i18next + react-i18next，declarative 配置
- **语言支持**:
  - zh-CN (简体中文)
  - en (English)
  - zh-TW (繁體中文)
  - ja (日本語)
- **自动检测流程**:
  1. 优先读 localStorage `i18nextLng` 值（兼容旧 'zh' 值迁移）
  2. 无存储时读 navigator.language 并映射到支持的语言代码
  3. 默认兜底为 zh-CN
- **持久化**: 语言变化后自动保存到 localStorage、更新 `document.documentElement.lang` 属性
- **资源加载**: 4 个 JSON 文件（locales/ 目录）静态导入，避免动态加载

## Flow
1. config.ts 初始化时调用 getInitialLanguage() 读取初始语言
2. i18n.init() 配置翻译资源 + 回调监听器
3. 应用中 useTranslation() 返回 { t: function } Hook
4. 组件调用 t('nav.features') 读对应语言的翻译文本
5. 用户切换语言 → LanguageSwitcher 调用 i18n.changeLanguage() → 自动触发 listener 保存 localStorage + 更新 html lang

## Integration
- 依赖：
  - i18next + react-i18next (npm 包)
  - locales/*.json (翻译文件)
- 被依赖：main.tsx 导入 config.ts / 所有组件的 useTranslation()
- 关键接口：
  - `useTranslation()` → { t: (key: string) => string, i18n: I18n }
  - i18n.changeLanguage(lang) → Promise
  - localStorage key: `i18nextLng` → value: 语言代码
  - HTML attribute: `<html lang="zh-CN">` 自动更新
