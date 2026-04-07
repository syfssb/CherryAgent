# src/lib/

## Responsibility
应用核心工具库。包含 API 网络层、常量定义、分析埋点模块。

## Design

### api.ts
- **请求函数**: request<T>() 通用 fetch 包装，处理 Content-Type + 返回 JSON
- **API 基址**: VITE_API_BASE_URL 环境变量注入（Zeabur 通过 nginx 路由 `/api` 到后端）
- **响应格式**:
  ```typescript
  { success: boolean, data?: T, error?: { code, message, details } }
  ```
- **Endpoints**:
  - POST /api/auth/register → RegisterData（用户、Token、API Key、余额、邀请奖励）
  - POST /api/referrals/apply → 邀请码兑换
  - GET /api/admin/versions/latest/check → 最新版本信息（Download URL 用于自动更新）
  - GET /api/configs/welcome-credits → 新注册用户欢迎奖励额度

### constants.ts
- **平台检测**:
  - detectPlatform()：优先 WebGL renderer 检测 Mac 芯片（arm64/x64），次优 userAgentData，兜底保守返回 x64
  - 3 级 WebGL GPU 识别：Apple M/Apple GPU → arm64，Intel/AMD/Radeon → x64
- **下载 URL**: 指向 COS（香港）的最新版本链接（dmg / exe）
- **Platform 类型**: mac_arm64 / mac_x64 / win_x64 / linux_x64（枚举）

### analytics.ts
- **埋点事件类型**:
  - lp_view（页面加载）
  - lp_click_download（点击下载）
  - lp_click_register（点击注册）
  - lp_select_provider_interest（选择 LLM 偏好）
  - lp_register_success（注册成功）
- **发送机制**: navigator.sendBeacon() 优先（可在页面卸载时发送），fallback fetch fire-and-forget
- **不阻塞 UI**: 所有失败静默忽略，仅 dev 环境 console.debug

## Flow
1. 组件导入 API 函数 → 调用 register() / getLatestVersion() 等
2. 请求被 fetch 拦截，自动添加 Content-Type header + API_BASE 前缀
3. 响应解析为 JSON → 返回 ApiResponse<T>，调用方检查 success 字段
4. 埋点在关键转化节点调用 trackEvent()，异步 sendBeacon 发送，不影响前台逻辑

## Integration
- 依赖：
  - 环境变量：VITE_API_BASE_URL
  - Web API：fetch / navigator.sendBeacon / WebGL / localStorage
- 被依赖：
  - pages/Landing (trackPageView)
  - pages/Register (register / getLatestVersion / getWelcomeCredits / trackRegisterSuccess)
  - components/Header (trackDownloadClick / detectPlatform / getDownloadUrl)
  - components/LanguageSwitcher (trackEvent 调用)
- 关键接口：
  - `request<T>(path, options) → Promise<ApiResponse<T>>`
  - `register(email, password, name?, referralCode?) → Promise<ApiResponse<RegisterData>>`
  - `detectPlatform() → 'mac_arm64' | 'mac_x64' | 'win_x64'`
  - `getDownloadUrl(platform?) → string (COS URL)`
  - `trackEvent(event) → void (fire-and-forget)`
