/**
 * 系统全局配置类型
 */
export interface SystemConfig {
  siteName: string
  siteDescription: string
  siteUrl: string
  logoUrl?: string
  faviconUrl?: string
  maintenanceMode: boolean
  maintenanceMessage: string
  registrationEnabled: boolean
  emailVerificationRequired: boolean
  defaultBalance: number
  minRechargeAmount: number
  maxRechargeAmount: number
  inviteBonus: number
  inviteRewardRate: number
  rateLimitPerMinute: number
  maxRequestsPerDay: number
  sessionTimeout: number
  enableInviteSystem: boolean
  enableReferralSystem: boolean
  termsOfServiceUrl?: string
  privacyPolicyUrl?: string
  supportEmail: string
  globalPriceMultiplier: number
  defaultDailyLimitCents: number
  defaultMonthlyLimitCents: number
  defaultRpmLimit: number
  defaultTpmLimit: number
  lowBalanceThresholdCents: number
  notifyOnLowBalance: boolean
  welcomeBonusCents: number
  toolModelId: string
  smallFastModelId?: string
  enableCodexProvider?: boolean
  enableRuntimeDimension?: boolean
  defaultAgentProvider?: string
  enabledAgentProviders?: string
  checkinEnabled?: boolean
  checkinBaseCredits?: number
  checkinConsecutiveBonus?: number
  checkinMaxConsecutiveBonus?: number
  captchaEnabled?: boolean
  captchaSecretId?: string
  captchaSecretKey?: string
  captchaAppId?: string
  captchaAppSecretKey?: string
  updatedAt: string
  updatedBy?: string
}

/**
 * SMTP 邮件配置类型
 */
export interface EmailConfig {
  enabled: boolean
  provider: 'smtp' | 'sendgrid' | 'mailgun' | 'aws-ses'
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  fromEmail: string
  fromName: string
  replyToEmail?: string
  testEmailSent?: boolean
  lastTestedAt?: string
  updatedAt: string
  updatedBy?: string
}

/**
 * 支付渠道配置类型
 */
export interface PaymentChannel {
  id: string
  name: string
  provider: 'alipay' | 'wechat' | 'stripe' | 'paypal' | 'manual'
  enabled: boolean
  isDefault: boolean
  priority: number
  config: {
    // 支付宝配置
    alipayAppId?: string
    alipayPrivateKey?: string
    alipayPublicKey?: string
    alipayNotifyUrl?: string

    // 微信支付配置
    wechatAppId?: string
    wechatMchId?: string
    wechatApiKey?: string
    wechatCertPath?: string
    wechatNotifyUrl?: string

    // Stripe配置
    stripePublishableKey?: string
    stripeSecretKey?: string
    stripeWebhookSecret?: string

    // PayPal配置
    paypalClientId?: string
    paypalClientSecret?: string
    paypalMode?: 'sandbox' | 'live'

    // 手动转账配置
    manualBankName?: string
    manualAccountName?: string
    manualAccountNumber?: string
    manualQrCodeUrl?: string
  }
  supportedMethods: ('qrcode' | 'redirect' | 'manual')[]
  minAmount: number
  maxAmount: number
  feeRate: number
  fixedFee: number
  totalTransactions: number
  totalAmount: number
  successRate: number
  avgProcessTime: number
  lastUsedAt?: string
  testMode: boolean
  testResult?: {
    success: boolean
    message: string
    testedAt: string
  }
  createdAt: string
  updatedAt: string
  updatedBy?: string
}

/**
 * 支付配置更新参数
 */
export interface PaymentConfigUpdate {
  enabled?: boolean
  isDefault?: boolean
  priority?: number
  config?: Partial<PaymentChannel['config']>
  supportedMethods?: PaymentChannel['supportedMethods']
  minAmount?: number
  maxAmount?: number
  feeRate?: number
  fixedFee?: number
  testMode?: boolean
}

/**
 * 配置测试结果
 */
export interface ConfigTestResult {
  success: boolean
  message: string
  details?: Record<string, unknown>
  timestamp: string
}

/**
 * 系统配置更新参数
 */
export type SystemConfigUpdate = Partial<SystemConfig>

/**
 * 邮件配置更新参数
 */
export type EmailConfigUpdate = Partial<EmailConfig>
