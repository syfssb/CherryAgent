# src/components/

## Responsibility
落地页展示型组件库。包含导航、Hero、产品展示、常见问题、页脚等 18+ UI 组件，支持主题切换 + 国际化。

## Design
- **模块化**: 每个组件独立文件，单一职责（Header / Hero / Features / FAQ 等）
- **响应式**: Tailwind 响应式类（hidden md:flex lg:w-1/2 等），移动优先
- **交互**: 
  - Header：固定导航 + 移动汉堡菜单 + 主题/语言切换器
  - Hero：视差滚动示意、CTA 按钮
  - Footer：多列链接、社交图标
  - 模态框：AntivirusModal（Windows 下载前提示）
- **主题系统**: 使用 `useTheme()` Hook，dark 类切换，Tailwind 的 dark: 前缀支持

## Flow
Landing 页组件栈：
```
Header (导航、下载、主题切换)
  ├─ Hero (引入 + 大 CTA)
  ├─ PainPoints (痛点列表)
  ├─ ProductShowcase (产品演示)
  ├─ WhatItIs (功能定义)
  ├─ Features (特性卡片)
  ├─ ProviderCapabilities (LLM 提供商能力)
  ├─ UseCases (应用场景)
  ├─ Steps (上手步骤)
  ├─ UserGuide (用户指南)
  ├─ Testimonials (用户评价)
  ├─ SecurityTransparency (安全透明)
  ├─ FAQ (常见问题)
  ├─ BottomCTA (底部 CTA)
  └─ Footer (页脚)
```
每个组件内部：useTranslation() → t(key) 翻译、useTheme() 适配主题

## Integration
- 依赖：
  - contexts/ThemeContext (useTheme hook)
  - i18n (useTranslation)
  - lib/constants (detectPlatform / getDownloadUrl)
  - lib/analytics (trackDownloadClick / trackRegisterClick)
  - lucide-react (图标库)
- 被依赖：pages/Landing、pages/Register
- 关键接口：
  - AntivirusModal：props { open, onConfirm, onClose }
  - Header：内部 state 管理（scrolled / mobileOpen / showModal）
  - 通用事件：href + onClick 处理 detectPlatform() 逻辑
