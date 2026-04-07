# src/pages/

## Responsibility
应用两大页面：Landing（产品展示）和 Register（用户注册），处理页面级别的状态与流程。

## Design

### Landing.tsx
- **职责**: 落地页聚合器，组织 18+ UI 组件成完整的营销流程
- **事件**: 页面加载调用 trackPageView() 埋点
- **结构**: Header + Hero + 若干中间段落 + Footer
- **无复杂逻辑**: 纯展示型页面，不涉及表单、网络请求

### Register.tsx
- **职责**: 用户注册流程，包含表单验证、网络请求、邀请码、密码强度、多平台下载
- **状态管理**:
  - 表单字段：email / password / confirmPassword / name / referralCode
  - UI 状态：loading / error / success / showModal / selectedProvider / downloadInfo / welcomeCredits
  - 邀请码预填：从 URL query `?ref=CODE` 读取，禁用编辑
- **表单验证**:
  - email：格式校验（RFC5322 简化版）
  - password：长度 ≥ 8 + 大写 + 小写 + 数字（强度 0-5 级）
  - confirmPassword：必须匹配
- **密码强度指示**：实时显示 5 级进度条 + 文本标签（弱/中/强）
- **API 调用**:
  - register()：注册用户 → 返回 Token / API Key / 欢迎奖励
  - getLatestVersion()：获取最新版本号、下载 URL 用于展示
  - getWelcomeCredits()：获取新用户欢迎额度（通常 $3）
- **多平台下载**:
  - detectPlatform() 自动检测用户系统 → 推荐对应版本
  - Windows 用户点击下载 → AntivirusModal 弹提示（防病毒软件可能误杀）
  - 注册成功后显示所有平台下载链接（mac_arm64 / mac_x64 / win_x64）
- **成功页面**:
  - 庆祝动画（🎉✨🎊）
  - 欢迎奖励卡片展示（$3 额度）
  - Provider 偏好选择（Claude / Codex / Both）
  - 多平台下载按钮
  - 返回首页链接
- **埋点**:
  - trackRegisterClick('register_page') → 点击提交时
  - trackRegisterSuccess(hasReferral) → 注册成功
  - trackProviderInterest(provider) → 选择 Provider 时

## Flow
**Register 表单流程**:
```
表单加载
  ├─ 读 URL query 邀请码
  ├─ 并行调用 getLatestVersion() + getWelcomeCredits()
  └─ 填充 downloadInfo / welcomeCredits state

用户输入
  ├─ 实时更新 email / password / ... state
  └─ password 变化 → 计算强度指示器

提交表单
  ├─ validateForm() 检验所有字段
  ├─ register() 发送请求
  ├─ 成功 → setSuccess(true) 显示成功页
  └─ 失败 → 显示 error message

注册成功页
  ├─ 展示欢迎奖励
  ├─ 用户选择 Provider 偏好（可选）
  ├─ 推荐当前平台下载链接 + 其他平台备选
  └─ 返回首页按钮

下载交互**:
  ├─ Windows 用户 → AntivirusModal 弹提示确认
  └─ Mac/Linux → 直接 window.location.href

```

## Integration
- 依赖：
  - components/AntivirusModal（Windows 下载提示）
  - lib/api（register / getLatestVersion / getWelcomeCredits）
  - lib/constants（detectPlatform / getDownloadUrl / PLATFORM_LABELS）
  - lib/analytics（trackRegisterClick / trackRegisterSuccess / trackProviderInterest）
  - react-router-dom（useSearchParams / useNavigate）
  - react-i18next（useTranslation）
  - lucide-react（Download / Sparkles / Gift 等图标）
- 被依赖：App.tsx 路由
- 关键接口：
  - Landing：无 props，纯展示
  - Register：
    - URL query: `?ref=REFERRAL_CODE` 预填邀请码
    - 成功后 navigate('/') 返回首页
