/// <reference types="vite/client" />

// 环境变量类型定义
interface ImportMetaEnv {
  // API 配置
  readonly VITE_API_BASE_URL: string

  // 可选配置
  readonly VITE_DEBUG?: string
  readonly VITE_APP_ENV?: 'development' | 'staging' | 'production'
  readonly VITE_ANALYTICS_ID?: string
  readonly VITE_FEATURE_PAYMENTS?: string
  readonly VITE_FEATURE_DARK_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// 认证凭证类型
interface AuthCredentials {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

// 认证状态类型
interface AuthStatus {
  isAuthenticated: boolean
  hasAccessToken: boolean
  hasRefreshToken: boolean
  expiresAt?: number
  isExpired?: boolean
}

// 用户信息类型
interface UserInfo {
  id: string
  email: string
  name?: string
  avatar?: string
}

// 认证回调数据类型
interface AuthCallbackData {
  code?: string
  state?: string
  error?: string
  errorDescription?: string
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  user?: UserInfo
}

// 登录结果类型
interface LoginResult {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  user?: UserInfo
}

// 余额信息类型
interface BalanceInfo {
  amount: number
  currency?: string
}

// 刷新令牌结果类型
interface RefreshTokenResult {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
}

// OAuth 提供商类型
type OAuthProvider = 'google' | 'github'

// OAuth 流程配置
interface OAuthFlowConfig {
  provider: {
    name: string
    authorizationEndpoint: string
    tokenEndpoint: string
    clientId: string
    scopes: string[]
  }
}

// OAuth 流程结果
interface OAuthFlowResult {
  success: boolean
  error?: string
  errorDescription?: string
  user?: UserInfo
}

// PKCE 状态信息
interface PKCEStateInfo {
  state: string
  redirectUri: string
  startedAt: number
}

// 认证 API 接口
interface AuthAPI {
  login: (accessToken: string) => Promise<{ success: boolean; user?: UserInfo; error?: string }>
  loginWithCode: (code: string, state?: string) => Promise<{ success: boolean; user?: UserInfo; error?: string }>
  logout: () => Promise<{ success: boolean; error?: string }>
  refresh: () => Promise<{ success: boolean; error?: string }>
  getStatus: () => Promise<AuthStatus>
  getCredentials: () => Promise<AuthCredentials | null>
  isAuthenticated: () => Promise<boolean>
  syncTokens: (tokens: { accessToken: string; refreshToken?: string }) => Promise<{ success: boolean; error?: string }>

  getUser: () => Promise<{ success: boolean; user?: UserInfo; error?: string }>
  onAuthCallback: (callback: (data: AuthCallbackData) => void) => () => void
  closeOAuthWindows: () => Promise<void>

  // OAuth PKCE 流程方法
  createOAuthConfig: (provider: OAuthProvider) => Promise<{ success: boolean; data?: OAuthFlowConfig; error?: string }>
  startOAuthFlow: (config: OAuthFlowConfig) => Promise<{ success: boolean; data?: PKCEStateInfo; error?: string }>
  cancelOAuthFlow: () => Promise<{ success: boolean; error?: string }>
  hasActiveOAuthFlow: () => Promise<{ active: boolean }>
  openOAuthWindow: (provider: OAuthProvider) => Promise<{ success: boolean; data?: PKCEStateInfo; error?: string }>
}

// 标签类型
interface Tag {
  id: string
  name: string
  color: string
  createdAt: number
  usageCount?: number
}

// 标签 API 接口
interface TagsAPI {
  getAll: () => Promise<{ success: boolean; data?: Tag[]; error?: string }>
  create: (name: string, color: string) => Promise<{ success: boolean; data?: Tag; error?: string }>
  update: (id: string, updates: { name?: string; color?: string }) => Promise<{ success: boolean; data?: Tag; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
  getUsageCount: (id: string) => Promise<{ success: boolean; data?: number; error?: string }>
}

// 会话操作 API 接口
interface SessionOperationsAPI {
  addTag: (sessionId: string, tagId: string) => Promise<{ success: boolean; error?: string }>
  removeTag: (sessionId: string, tagId: string) => Promise<{ success: boolean; error?: string }>
  getTags: (sessionId: string) => Promise<{ success: boolean; data?: Tag[]; error?: string }>
  togglePinned: (sessionId: string) => Promise<{ success: boolean; data?: { isPinned: boolean }; error?: string }>
  toggleArchived: (sessionId: string) => Promise<{ success: boolean; data?: { isArchived: boolean }; error?: string }>
  search: (query: string, options?: { includeArchived?: boolean; tagId?: string }) => Promise<{ success: boolean; data?: any[]; error?: string }>
  listWithOptions: (options?: { includeArchived?: boolean; tagId?: string; query?: string }) => Promise<{ success: boolean; data?: any[]; error?: string }>
  getArchivedSessions: () => Promise<{ success: boolean; data?: any[]; error?: string }>
  getPinnedSessions: () => Promise<{ success: boolean; data?: any[]; error?: string }>
  updateTitle: (sessionId: string, title: string) => Promise<{ success: boolean; error?: string }>
  generateTitle: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  update: (sessionId: string, updates: { activeSkillIds?: string[]; skillMode?: "manual" | "auto"; title?: string; permissionMode?: string }) => Promise<{ success: boolean; error?: string }>
}

// 工作区 API 接口
interface WorkspaceAPI {
  watch: (path: string) => Promise<{ success: boolean; data?: any; error?: string }>
  unwatch: () => Promise<{ success: boolean; error?: string }>
  exists: (path: string) => Promise<{ success: boolean; data?: { path: string; exists: boolean }; error?: string }>
  getStatus: () => Promise<{ success: boolean; data?: any; error?: string }>
  getRecent: (limit?: number) => Promise<{ success: boolean; data?: any[]; error?: string }>
  addRecent: (path: string) => Promise<{ success: boolean; data?: any; error?: string }>
  removeRecent: (path: string) => Promise<{ success: boolean; data?: { removed: boolean }; error?: string }>
  getCommonDirs: () => Promise<{ success: boolean; data?: Array<{ path: string; name: string; type: string }>; error?: string }>
  getTempDir: () => Promise<{ success: boolean; data?: { path: string }; error?: string }>
  setDefaultCwd: (path: string) => Promise<{ success: boolean; error?: string }>
  listDir: (path: string, options?: { ignorePatterns?: string[]; limit?: number }) => Promise<{ success: boolean; data?: { path: string; items: Array<{ name: string; path: string; relativePath: string; type: 'file' | 'directory' }> }; error?: string }>
  searchFiles: (query: string, options?: { ignorePatterns?: string[]; limit?: number }) => Promise<{ success: boolean; data?: { items: Array<{ name: string; path: string; relativePath: string; type: 'file' | 'directory' }> }; error?: string }>
  copyEntry: (path: string) => Promise<{ success: boolean; data?: { sourcePath: string; relativePath: string; name: string }; error?: string }>
  pasteEntry: (targetDirPath?: string) => Promise<{ success: boolean; data?: { path: string; relativePath: string; name: string }; error?: string }>
  deleteEntry: (path: string) => Promise<{ success: boolean; data?: { path: string; relativePath: string }; error?: string }>
  onWorkspaceEvent: (callback: (event: any) => void) => () => void
}

// Shell API 接口
interface ShellAPI {
  showItemInFolder: (filePath: string, cwd: string) => Promise<{ success: boolean; error?: string }>
  openPath: (filePath: string, cwd?: string) => Promise<{ success: boolean; error?: string }>
}

// Clipboard API 接口
interface ClipboardAPI {
  writeImage: (base64Data: string, mediaType: string) => Promise<{ success: boolean; error?: string }>
}

// 更新信息类型
interface UpdateInfo {
  version: string
  releaseNotes?: string | null
  releaseDate?: string
  changelog?: Array<{
    version: string
    date: string
    changes: Array<{
      type: 'feature' | 'fix' | 'improvement' | 'breaking'
      description: string
    }>
  }>
}

// 下载进度类型
interface DownloadProgress {
  total: number
  delta: number
  transferred: number
  percent: number
  bytesPerSecond: number
}

// 更新状态类型
type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

// 更新 API 接口
interface UpdateAPI {
  check: () => Promise<{ success: boolean; data?: { updateAvailable: boolean; info?: UpdateInfo; error?: string }; error?: string }>
  download: () => Promise<{ success: boolean; error?: string }>
  install: (silent?: boolean) => Promise<{ success: boolean; error?: string }>
  getStatus: () => Promise<{ success: boolean; data?: { status: UpdateStatus; updateInfo: UpdateInfo | null; downloadProgress: DownloadProgress | null; error: string | null }; error?: string }>
  onStatus: (callback: (data: { status: UpdateStatus; info?: UpdateInfo; error?: string }) => void) => () => void
  onProgress: (callback: (progress: DownloadProgress) => void) => () => void
  onAvailable: (callback: (info: { version: string; releaseNotes?: string | null; releaseDate?: string }) => void) => () => void
  onDownloaded: (callback: (info: { version: string; releaseDate?: string; isInApplications: boolean }) => void) => () => void
}

// 通知 API 接口
interface NotificationAPI {
  show: (payload: { title: string; body?: string; silent?: boolean; sessionId?: string }) => Promise<{ success: boolean; error?: string }>
  check: () => Promise<{ supported: boolean; error?: string }>
  onClick: (callback: (data: { sessionId?: string | null }) => void) => () => void
}

// 应用 API 接口
interface DesktopFeatureFlags {
  desktop: {
    enableCodexRunner: boolean
    enableProviderSwitch: boolean
  }
}

interface AppAPI {
  bootstrap: () => Promise<any>
  setLanguage: (language: string) => Promise<{ success: boolean; data?: { language: string }; error?: string }>
  getFeatureFlags: () => Promise<{ success: boolean; data?: DesktopFeatureFlags; error?: string }>
  setFeatureFlag: (
    path: 'desktop.enableCodexRunner' | 'desktop.enableProviderSwitch',
    value: boolean
  ) => Promise<{ success: boolean; data?: DesktopFeatureFlags; error?: string }>
  resetFeatureFlags: () => Promise<{ success: boolean; data?: DesktopFeatureFlags; error?: string }>
  getVersion: () => Promise<{ success: boolean; data?: { version: string; name: string; isPackaged: boolean }; error?: string }>
  getPlatform: () => string
  getArch: () => string
}

// 用户记忆数据
interface UserMemoryData {
  content: string
  updatedAt: number | null
}

// 记忆 API 接口
interface MemoryAPI {
  get: () => Promise<{ success: boolean; data?: UserMemoryData; error?: string }>
  set: (content: string) => Promise<{ success: boolean; error?: string }>
  clear: () => Promise<{ success: boolean; error?: string }>
}

// 技能类型
interface Skill {
  id: string
  name: string
  description?: string
  category: 'code' | 'git' | 'debug' | 'refactor' | 'docs' | 'test' | 'review' | 'custom'
  content: string
  isEnabled: boolean
  isSystem: boolean
  createdAt: number
  updatedAt: number
  usageCount?: number
  variables?: string[]
}

// 技能创建输入
interface SkillCreateInput {
  name: string
  description?: string
  category?: 'code' | 'git' | 'debug' | 'refactor' | 'docs' | 'test' | 'review' | 'custom'
  content: string
  isEnabled?: boolean
}

// 技能更新输入
interface SkillUpdateInput {
  name?: string
  description?: string
  category?: 'code' | 'git' | 'debug' | 'refactor' | 'docs' | 'test' | 'review' | 'custom'
  content?: string
  isEnabled?: boolean
}

// 技能搜索选项
interface SkillSearchOptions {
  query?: string
  category?: 'code' | 'git' | 'debug' | 'refactor' | 'docs' | 'test' | 'review' | 'custom'
  isEnabled?: boolean
  isSystem?: boolean
}

// 技能验证结果
interface ValidationResult {
  isValid: boolean
  errors?: Array<{ line: number; message: string }>
  warnings?: Array<{ line: number; message: string }>
}

// 技能统计
interface SkillStats {
  total: number
  enabled: number
  disabled: number
  system: number
  custom: number
  byCategory: Record<string, number>
}

// 技能 API 接口
interface SkillAPI {
  getAll: () => Promise<{ success: boolean; data?: Skill[]; error?: string }>
  getEnabled: () => Promise<{ success: boolean; data?: Skill[]; error?: string }>
  get: (id: string) => Promise<{ success: boolean; data?: Skill | null; error?: string }>
  create: (input: SkillCreateInput) => Promise<{ success: boolean; data?: Skill; error?: string }>
  update: (id: string, input: SkillUpdateInput) => Promise<{ success: boolean; data?: Skill; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
  toggle: (id: string) => Promise<{ success: boolean; data?: { isEnabled: boolean }; error?: string }>
  validate: (content: string) => Promise<{ success: boolean; data?: ValidationResult; error?: string }>
  search: (options: SkillSearchOptions) => Promise<{ success: boolean; data?: Skill[]; error?: string }>
  getByCategory: (category: string) => Promise<{ success: boolean; data?: Skill[]; error?: string }>
  getStats: () => Promise<{ success: boolean; data?: SkillStats; error?: string }>
  export: (id: string) => Promise<{ success: boolean; data?: string; error?: string }>
  import: (content: string, options?: { name?: string; overwrite?: boolean }) => Promise<{ success: boolean; data?: Skill; error?: string }>
  getContext: (options?: { skillIds?: string[]; maxSkills?: number }) => Promise<{ success: boolean; data?: string; error?: string }>
  getPrompt: (skillId: string, variables?: Record<string, string>) => Promise<{ success: boolean; data?: string; error?: string }>
}

// 数据导出选项
interface DataExportOptions {
  outputDir?: string
  fileName?: string
  include?: {
    sessions?: boolean
    messages?: boolean
    tags?: boolean
    memories?: boolean
    archivalMemories?: boolean
    skills?: boolean
    settings?: boolean
  }
}

// 数据导出结果
interface DataExportResult {
  filePath: string
  stats: {
    sessions?: number
    messages?: number
    tags?: number
    memories?: number
    archivalMemories?: number
    skills?: number
    settings?: number
  }
  duration: number
}

// 数据导入选项
interface DataImportOptions {
  strategy?: 'merge' | 'overwrite' | 'add_only'
  conflictResolution?: 'keep_local' | 'keep_remote' | 'keep_newer'
  include?: {
    sessions?: boolean
    messages?: boolean
    tags?: boolean
    memories?: boolean
    archivalMemories?: boolean
    skills?: boolean
    settings?: boolean
  }
  dryRun?: boolean
}

// 数据导入结果
interface DataImportResult {
  stats: {
    sessions?: number
    messages?: number
    tags?: number
    memories?: number
    archivalMemories?: number
    skills?: number
    settings?: number
  }
  warnings?: string[]
  conflicts?: Array<{ entity: string; id: string; reason: string }>
  duration: number
  dryRun: boolean
}

// 数据验证结果
interface DataValidationResult {
  warnings?: string[]
  duration: number
}

// 简单导出数据格式
interface SimpleExportData {
  version: string
  exportedAt: string
  data: {
    sessions: Array<{
      id: string
      title: string
      claudeSessionId: string | null
      status: string
      cwd: string | null
      permissionMode?: string | null
      skillMode?: string | null
      activeSkillIds?: string[]
      provider?: string | null
      providerThreadId?: string | null
      runtime?: string | null
      createdAt: number
      updatedAt: number
    }>
    messages?: Array<{
      id: string
      sessionId: string
      data: unknown
      createdAt: number
    }>
    tags?: Array<{
      id: string
      name: string
      color: string
      createdAt: number
    }>
    sessionTags?: Array<{
      sessionId: string
      tagId: string
      createdAt: number
    }>
    memories: Array<{
      id: string
      label: string
      description: string
      value: string
      charLimit: number
      createdAt: number
      updatedAt: number
    }>
    skills: Array<{
      id: string
      name: string
      description: string
      content: string
      source: string
      isEnabled: boolean
      icon: string | null
      category: string
      createdAt: number
      updatedAt: number
    }>
    settings: Record<string, { value: string; updatedAt: number }>
  }
}

// 数据 API 接口
interface DataAPI {
  export: (options?: DataExportOptions) => Promise<{ success: boolean; data?: DataExportResult; error?: string }>
  import: (filePath: string, options?: DataImportOptions) => Promise<{ success: boolean; data?: DataImportResult; error?: string }>
  importSimple: (data: unknown, options?: DataImportOptions) => Promise<{ success: boolean; data?: DataImportResult; error?: string }>
  validate: (filePath: string) => Promise<{ success: boolean; data?: DataValidationResult; error?: string }>
  exportSimple: () => Promise<{ success: boolean; data?: SimpleExportData; error?: string }>
}

// 同步状态类型
type SyncStatus = 'idle' | 'syncing' | 'pulling' | 'pushing' | 'resolving_conflicts' | 'error' | 'disabled'

// 同步结果
interface SyncResult {
  pushed: number
  pulled: number
  conflicts: number
  duration: number
  timestamp: number
}

// 同步状态信息
interface SyncStatusInfo {
  status: SyncStatus
  isEnabled: boolean
  lastSyncTime: number | null
  pendingChanges: number
  error: string | null
}

// 同步冲突
interface SyncConflict {
  id: string
  entityType: 'session' | 'tag' | 'memory_block' | 'skill' | 'setting'
  entityId: string
  localVersion: any
  remoteVersion: any
  conflictType: 'update' | 'delete'
  timestamp: number
}

// 同步配置
interface SyncConfig {
  apiBaseUrl: string
  syncInterval: number
  autoSync: boolean
  enabledEntities: Array<'session' | 'tag' | 'memory_block' | 'skill' | 'setting'>
  conflictStrategy: 'keep_local' | 'keep_remote' | 'manual_merge'
  autoResolveStrategy?: 'manual' | 'keep_latest' | 'keep_local' | 'keep_remote'
}

// 待同步变更
interface PendingChange {
  entityType: 'session' | 'tag' | 'memory_block' | 'skill' | 'setting'
  entityId: string
  operation: 'create' | 'update' | 'delete'
  timestamp: number
}

// 同步 API 接口
interface SyncAPI {
  push: () => Promise<{ success: boolean; data?: SyncResult; error?: string }>
  pull: () => Promise<{ success: boolean; data?: SyncResult; error?: string }>
  sync: (options?: { accessToken?: string }) => Promise<{ success: boolean; data?: SyncResult; error?: string }>
  getStatus: () => Promise<{ success: boolean; data?: SyncStatusInfo; error?: string }>
  enable: () => Promise<{ success: boolean; error?: string }>
  disable: () => Promise<{ success: boolean; error?: string }>
  setAccessToken: (token: string | null) => Promise<{ success: boolean; error?: string }>
  getConflicts: () => Promise<{ success: boolean; data?: SyncConflict[]; error?: string }>
  resolveConflict: (conflictId: string, resolution: 'keep_local' | 'keep_remote' | 'manual_merge') => Promise<{ success: boolean; error?: string }>
  getConfig: () => Promise<{ success: boolean; data?: SyncConfig; error?: string }>
  updateConfig: (updates: Partial<SyncConfig>) => Promise<{ success: boolean; error?: string }>
  getPendingChanges: () => Promise<{ success: boolean; data?: PendingChange[]; error?: string }>
  getLastSyncTime: () => Promise<{ success: boolean; data?: { lastSyncTime: number | null }; error?: string }>
}

// 计费余额信息
interface BillingBalance {
  balance: string
  currency: string
  totalDeposited: string
  totalSpent: string
}

// 充值结果
interface RechargeResult {
  orderId: string
  method: 'stripe' | 'xunhupay'
  url: string
  qrcodeUrl?: string
}

// 充值状态
type RechargeStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'needs_review'

// 充值状态查询结果
interface RechargeStatusResult {
  orderId: string
  status: RechargeStatus
  amount?: number
  currency?: string
  paidAt?: string
  paymentMethod: 'stripe' | 'xunhupay'
  transactionId?: string
}

// 使用记录
interface BillingUsageRecord {
  id: string
  timestamp?: number
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  cost: number
  status: string
  latencyMs: number | null
  createdAt: string | Date
  currency?: string
  quotaUsed?: number
  balanceCreditsConsumed?: number
}

// 使用统计
interface UsageStats {
  totalRequests: number
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: string
  currency: string
  byModel: Record<string, {
    requests: number
    tokens: number
    cost: number
  }>
  byProvider: Record<string, {
    requests: number
    tokens: number
    cost: number
  }>
  period: {
    start: string
    end: string
  }
}

// 余额变动记录
interface BillingTransactionRecord {
  id: string
  type: string
  timestamp?: number
  amount: number
  balanceBefore: string
  balanceAfter: number
  description: string | null
  createdAt: string | Date
  currency?: string
}

// 定价信息
interface PricingInfo {
  multiplier: number
  models: Record<string, {
    inputPerMillion: number
    outputPerMillion: number
  }>
  currency: string
  note: string
}

// 期卡信息
interface PeriodCardInfo {
  id: string
  status: string
  planName: string
  periodType: string
  periodDays: number
  dailyCredits: number
  dailyQuotaRemaining: number
  quotaResetDate: string | null
  startsAt: string
  expiresAt: string
}

// 期卡套餐
interface PeriodCardPlanInfo {
  id: string
  name: string
  description: string | null
  periodType: string
  periodDays: number
  dailyCredits: number
  priceCents: number
  priceYuan: string
  currency: string
}

// 期卡购买结果
interface PurchasePeriodCardResult {
  orderId: string
  payUrl: string
  qrcodeUrl?: string
  plan: {
    id: string
    name: string
    periodType: string
    periodDays: number
    dailyCredits: number
    priceCents: number
    priceYuan: string
  }
}

// 计费 API 接口
interface BillingAPI {
  getBalance: (forceRefresh?: boolean) => Promise<{ success: boolean; data?: BillingBalance; error?: string }>
  recharge: (
    amount: number,
    method: 'stripe' | 'xunhupay',
    options?: {
      currency?: string
      paymentType?: 'wechat' | 'alipay'
      returnUrl?: string
      discountCode?: string
    }
  ) => Promise<{ success: boolean; data?: RechargeResult; error?: string }>
  getRechargeStatus: (orderId: string) => Promise<{ success: boolean; data?: RechargeStatusResult; error?: string }>
  getUsageHistory: (params?: {
    page?: number
    limit?: number
    startDate?: string
    endDate?: string
    model?: string
  }) => Promise<{ success: boolean; data?: {
    records: BillingUsageRecord[]
    total: number
    meta?: any
    summary?: UsageSummary
    pagination?: Pagination
  }; error?: string }>
  getUsageStats: (params?: {
    startDate?: string
    endDate?: string
  }) => Promise<{ success: boolean; data?: UsageStats; error?: string }>
  getTransactionHistory: (params?: {
    page?: number
    limit?: number
    type?: string
  }) => Promise<{ success: boolean; data?: {
    records: BillingTransactionRecord[]
    total: number
    pagination?: Pagination
  }; error?: string }>
  getPricing: () => Promise<{ success: boolean; data?: PricingInfo; error?: string }>
  exportUsage: (params: {
    format: 'csv' | 'json'
    fileName?: string
    startDate?: string
    endDate?: string
    model?: string
  }) => Promise<{ success: boolean; data?: { filePath: string }; error?: string }>
  openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>
  getPeriodCard: () => Promise<{ success: boolean; data?: PeriodCardInfo[]; error?: string }>
  getPeriodCardPlans: () => Promise<{ success: boolean; data?: PeriodCardPlanInfo[]; error?: string }>
  purchasePeriodCard: (planId: string, paymentType: 'wechat' | 'alipay') => Promise<{ success: boolean; data?: PurchasePeriodCardResult; error?: string }>
}

// ===== 向后兼容的旧类型 (已废弃) =====

// @deprecated 使用 BillingUsageRecord 替代
interface UsageRecord {
  id: string
  timestamp: number
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
  currency: string
  sessionId?: string
  balanceCreditsConsumed?: number
}

// @deprecated
type TransactionType = 'deposit' | 'usage' | 'refund' | 'bonus'

// @deprecated 使用 BillingTransactionRecord 替代
interface Transaction {
  id: string
  timestamp: number
  type: TransactionType
  amount: number
  balanceAfter: number
  currency: string
  description?: string
  orderId?: string
  channel?: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay'
}

// @deprecated 使用 RechargeResult 替代
interface RechargeOrder {
  id: string
  amount: number
  currency: string
  channel: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay'
  status: RechargeStatus
  createdAt: number
  expiresAt: number
  paymentUrl?: string
  qrCodeUrl?: string
}

// @deprecated
interface UsageFilters {
  startTime?: number
  endTime?: number
  model?: string
  page?: number
  pageSize?: number
}

// @deprecated
interface TransactionFilters {
  startTime?: number
  endTime?: number
  type?: TransactionType
  page?: number
  pageSize?: number
}

// @deprecated 使用 UsageStats 替代
interface UsageSummary {
  totalRequests: number
  totalTokens: number
  totalCost: number
  currency: string
}

// 分页信息
interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// Electron API 接口
interface ElectronAPI {
  subscribeStatistics: (callback: (stats: any) => void) => () => void
  getStaticData: () => Promise<any>
  sendClientEvent: (event: any) => void
  dispatchClientEvent: (event: any) => Promise<{ success: boolean; error?: string; code?: string }>
  onServerEvent: (callback: (event: any) => void) => () => void
  invoke: (channel: string, ...args: any[]) => Promise<any>
  on?: (event: string, callback: (...args: any[]) => void) => () => void
  removeListener?: (event: string, callback: (...args: any[]) => void) => void
  generateSessionTitle: (userInput: string | null) => Promise<string>
  getRecentCwds: (limit?: number) => Promise<string[]>
  selectDirectory: () => Promise<string | null>
  getApiConfig: () => Promise<any>
  saveApiConfig: (config: any) => Promise<{ success: boolean; error?: string }>
  checkApiConfig: () => Promise<{ hasConfig: boolean; config: any }>
  auth: AuthAPI
  tags: TagsAPI
  session: SessionOperationsAPI
  workspace: WorkspaceAPI
  shell: ShellAPI
  clipboard: ClipboardAPI
  update: UpdateAPI
  notifications: NotificationAPI
  app: AppAPI
  memory: MemoryAPI
  skill: SkillAPI
  data: DataAPI
  sync: SyncAPI
  billing: BillingAPI
  // 认证相关的便捷方法（已废弃或可选）
  getUserInfo?: (accessToken: string) => Promise<UserInfo | null>
  loginWithEmail?: (email: string, password: string) => Promise<LoginResult | null>
  openOAuthWindow?: (provider: 'google' | 'github') => Promise<void>
  openLoginWindow?: () => void
  openRegisterWindow?: () => void
  openForgotPasswordWindow?: () => void
  onAuthCallback?: (callback: (data: AuthCallbackData) => void) => () => void
  logout?: () => void
  refreshToken?: (refreshToken: string) => Promise<RefreshTokenResult | null>
  getBalance?: (accessToken: string) => Promise<BalanceInfo | null>
}

// 事件载荷映射类型
interface EventPayloadMapping {
  statistics: any
  getStaticData: any
  'client-event-dispatch': { success: boolean; error?: string; code?: string }
  'generate-session-title': string
  'get-recent-cwds': string[]
  'select-directory': string | null
  'get-api-config': any
  'save-api-config': { success: boolean; error?: string }
  'check-api-config': { hasConfig: boolean; config: any }
  'renderer-error-log': void
}

// 扩展 Window 接口
declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: ElectronAPI
    on?: (event: string, callback: (...args: any[]) => void) => void
    removeListener?: (event: string, callback: (...args: any[]) => void) => void
  }
}

export {}
