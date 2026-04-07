# src/pages/settings/

## Responsibility

系统设置模块，提供后台全局配置管理。包括系统配置（API 端点、速率限制）、支付配置（Stripe、支付宝、微信）、邮件配置（SMTP）、Clerk 认证配置、内容配置（静态页面）。

## Design

- **多页面结构（index.ts 导出）**：
  - `SystemConfig.tsx`：系统全局配置
  - `PaymentConfig.tsx`：支付网关配置
  - `EmailConfig.tsx`：邮件服务配置
  - `ClerkConfig.tsx`：Clerk 认证配置
  - `ContentConfig.tsx`：内容页面配置

- **SystemConfig 特性**：
  - API 基础 URL：用户端 API 地址、AI 代理 API 地址
  - 速率限制：请求限制、并发限制
  - 日志级别：debug/info/warn/error
  - 功能开关：启用/禁用特定功能

- **PaymentConfig 特性**：
  - Stripe 配置：Public Key、Secret Key、Webhook Secret
  - 支付宝配置：应用 ID、应用私钥、支付宝公钥
  - 微信配置：商户 ID、商户密钥、应用 ID、应用密钥
  - 支付方式启用状态开关

- **EmailConfig 特性**：
  - SMTP 服务器：主机、端口、用户名、密码
  - 发件人：邮箱地址、显示名
  - 模板配置：重置密码、验证邮箱、通知邮件模板

- **ClerkConfig 特性**：
  - Publishable Key：前端使用
  - Secret Key：后端使用
  - 签名密钥：验证 webhook 签名

- **ContentConfig 特性**：
  - 隐私政策：编辑 Markdown 内容
  - 服务条款：编辑 Markdown 内容
  - 关于我们：编辑文本和图片
  - 多语言支持：每个页面支持多语言编辑

- **状态管理**：
  - useQuery 加载各类配置
  - useMutation 保存配置修改
  - useState 管理表单临时数据
  - MarkdownEditor 编辑 Markdown 内容
  - I18nEditor 编辑多语言内容

## Flow

**SystemConfig 流程：**
1. 挂载 → useQuery 加载系统配置
2. 显示各个配置项：API URL、速率限制、日志级别、功能开关
3. 用户修改配置 → 输入新值 → 实时校验（URL 格式、数字范围等）
4. 点"保存"按钮 → useMutation updateSystemConfig(data) → 成功提示
5. 某些配置修改可能需要重启服务，提示用户

**PaymentConfig 流程：**
1. 挂载 → useQuery 加载支付配置
2. 显示多个支付网关配置块（Stripe、支付宝、微信）
3. 用户编辑某个网关的密钥：
   - 隐藏敏感信息显示（用 •••）
   - 编辑时需输入完整密钥
4. 编辑完成 → 点该网关下的"保存"按钮 → useMutation updatePaymentConfig(provider, data)
5. 支持测试连接：点"测试"按钮 → 验证密钥有效性 → 显示结果
6. 支持启用/禁用某个支付方式 → 开关即时保存

**EmailConfig 流程：**
1. 挂载 → useQuery 加载邮件配置
2. 显示 SMTP 参数：主机、端口、用户名、密码
3. 用户修改 → 输入 SMTP 信息
4. 点"保存" → useMutation updateEmailConfig(data)
5. 支持"发送测试邮件"：输入测试邮箱地址 → 点"发送" → 验证配置是否正确

**ContentConfig 流程：**
1. 挂载 → useQuery 加载所有内容页面配置
2. 显示标签页：隐私政策、服务条款、关于我们
3. 点击标签页 → 切换到对应页面的编辑器
4. 多语言编辑：
   - I18nEditor 显示语言选项卡
   - 用户在各语言选项卡下编辑内容
5. Markdown 预览：实时显示编辑内容的渲染效果
6. 点"保存" → useMutation updateContent(pageId, i18nData)

## Integration

- **Services**：
  - `settingsService.getSystemConfig()`：获取系统配置
  - `settingsService.updateSystemConfig(data)`：更新系统配置
  - `settingsService.getPaymentConfig()`：获取支付配置
  - `settingsService.updatePaymentConfig(provider, data)`：更新支付配置
  - `settingsService.testPaymentConnection(provider)`：测试支付连接
  - `settingsService.getEmailConfig()`：获取邮件配置
  - `settingsService.updateEmailConfig(data)`：更新邮件配置
  - `settingsService.sendTestEmail(email)`：发送测试邮件
  - `settingsService.getClerkConfig()`：获取 Clerk 配置
  - `settingsService.updateClerkConfig(data)`：更新 Clerk 配置
  - `settingsService.getContentConfig(pageId)`：获取内容配置
  - `settingsService.updateContentConfig(pageId, data)`：更新内容配置

- **UI 组件**：
  - Card + CardContent：配置块容器
  - Input：文本、数字、密码输入
  - Toggle/Switch：开关
  - Tabs：多页面切换（PaymentConfig、ContentConfig 等）
  - MarkdownEditor：Markdown 编辑器
  - MarkdownPreview：Markdown 预览
  - I18nEditor：多语言编辑器
  - Button：保存、测试、发送等操作按钮
  - Alert/Toast：提示和错误信息

- **敏感信息处理**：
  - 列表显示时用 `•••` 遮挡真实密钥
  - 编辑时需输入完整值（不支持部分编辑）
  - 保存时在后端加密存储（不在前端存储）

- **配置分类**：
  - **SystemConfig**：API URL、速率限制、日志、功能开关
  - **PaymentConfig**：Stripe、支付宝、微信、虎皮椒等
  - **EmailConfig**：SMTP 参数、发件人、模板
  - **ClerkConfig**：认证密钥
  - **ContentConfig**：隐私政策、服务条款、关于我们（多语言）

- **多语言内容支持**：
  - 每个内容页面支持多语言编辑
  - 数据格式：`{ contentI18n: { "zh": "...", "en": "..." } }`
  - 前端渲染时根据用户语言选择对应版本
