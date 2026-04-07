/**
 * 全局类型定义文件
 * 为 Electron 主进程和预加载脚本提供类型支持
 */

// 统计信息类型
declare type Statistics = {
  cpuUsage: number;
  ramUsage: number;
  storageData: number;
};

// 静态数据类型
declare type StaticData = {
  totalStorage: number;
  cpuModel: string;
  totalMemoryGB: number;
};

// 取消订阅函数类型
declare type UnsubscribeFunction = () => void;

// OAuth 提供商类型
declare type OAuthProvider = 'google' | 'github';

// 用户记忆数据
declare interface UserMemoryData {
  content: string;
  updatedAt: number | null;
}

// 认证相关类型
declare interface AuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

declare interface AuthStatus {
  isAuthenticated: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  expiresAt?: number;
  isExpired?: boolean;
}

declare interface UserInfo {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
}

declare interface AuthCallbackData {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: UserInfo;
}

declare interface LoginResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: UserInfo;
}

declare interface BalanceInfo {
  amount: number;
  currency?: string;
}

declare interface RefreshTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

// 认证 API 接口
declare interface AuthAPI {
  login: (accessToken: string) => Promise<{ success: boolean; user?: UserInfo; error?: string }>;
  loginWithCode: (code: string, state?: string) => Promise<{ success: boolean; user?: UserInfo; error?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<{ success: boolean; error?: string }>;
  getStatus: () => Promise<AuthStatus>;
  getCredentials: () => Promise<AuthCredentials | null>;
  isAuthenticated: () => Promise<boolean>;
  syncTokens: (tokens: { accessToken: string; refreshToken?: string }) => Promise<{ success: boolean; error?: string }>;

  onAuthCallback: (callback: (data: AuthCallbackData) => void) => UnsubscribeFunction;
  closeOAuthWindows: () => Promise<void>;

  getUser: () => Promise<{ success: boolean; user?: UserInfo; error?: string }>;

  // OAuth PKCE 流程方法
  createOAuthConfig: (provider: OAuthProvider) => Promise<{ success: boolean; data?: any; error?: string }>;
  startOAuthFlow: (config: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  cancelOAuthFlow: () => Promise<{ success: boolean; error?: string }>;
  hasActiveOAuthFlow: () => Promise<{ active: boolean }>;
  openOAuthWindow: (provider: OAuthProvider) => Promise<{ success: boolean; data?: any; error?: string }>;
}

// 标签类型
declare interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  usageCount?: number;
}

// 标签 API 接口
declare interface TagsAPI {
  getAll: () => Promise<{ success: boolean; data?: Tag[]; error?: string }>;
  create: (name: string, color: string) => Promise<{ success: boolean; data?: Tag; error?: string }>;
  update: (id: string, updates: { name?: string; color?: string }) => Promise<{ success: boolean; data?: Tag; error?: string }>;
  delete: (id: string) => Promise<{ success: boolean; error?: string }>;
  getUsageCount: (id: string) => Promise<{ success: boolean; data?: number; error?: string }>;
}

// 会话操作 API 接口
declare interface SessionOperationsAPI {
  addTag: (sessionId: string, tagId: string) => Promise<{ success: boolean; error?: string }>;
  removeTag: (sessionId: string, tagId: string) => Promise<{ success: boolean; error?: string }>;
  getTags: (sessionId: string) => Promise<{ success: boolean; data?: Tag[]; error?: string }>;
  togglePinned: (sessionId: string) => Promise<{ success: boolean; data?: { isPinned: boolean }; error?: string }>;
  toggleArchived: (sessionId: string) => Promise<{ success: boolean; data?: { isArchived: boolean }; error?: string }>;
  search: (query: string, options?: { includeArchived?: boolean; tagId?: string }) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  listWithOptions: (options?: { includeArchived?: boolean; tagId?: string; query?: string }) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  getArchivedSessions: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
  getPinnedSessions: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
  updateTitle: (sessionId: string, title: string) => Promise<{ success: boolean; error?: string }>;
  generateTitle: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  update: (sessionId: string, updates: { activeSkillIds?: string[]; skillMode?: "manual" | "auto"; title?: string; permissionMode?: string }) => Promise<{ success: boolean; error?: string }>;
  fullSearch: (query: string, options?: any) => Promise<{ success: boolean; data?: any[]; error?: string }>;
}

// 工作区 API 接口
declare interface WorkspaceAPI {
  watch: (path: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  unwatch: () => Promise<{ success: boolean; error?: string }>;
  exists: (path: string) => Promise<{ success: boolean; data?: { path: string; exists: boolean }; error?: string }>;
  getStatus: () => Promise<{ success: boolean; data?: any; error?: string }>;
  getRecent: (limit?: number) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  addRecent: (path: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  removeRecent: (path: string) => Promise<{ success: boolean; data?: { removed: boolean }; error?: string }>;
  getCommonDirs: () => Promise<{ success: boolean; data?: string[]; error?: string }>;
  getTempDir: () => Promise<{ success: boolean; data?: { path: string }; error?: string }>;
  listDir: (path: string, options?: { ignorePatterns?: string[]; limit?: number }) => Promise<{ success: boolean; data?: { path: string; items: Array<{ name: string; path: string; relativePath: string; type: 'file' | 'directory' }> }; error?: string }>;
  onWorkspaceEvent: (callback: (event: any) => void) => UnsubscribeFunction;
}

// 更新信息类型
declare interface UpdateInfoType {
  version: string;
  releaseNotes?: string | null;
  releaseDate?: string;
  changelog?: Array<{
    version: string;
    date: string;
    changes: Array<{
      type: 'feature' | 'fix' | 'improvement' | 'breaking';
      description: string;
    }>;
  }>;
}

// 下载进度类型
declare interface DownloadProgressType {
  total: number;
  delta: number;
  transferred: number;
  percent: number;
  bytesPerSecond: number;
}

// 更新状态类型
declare type UpdateStatusType = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

// 更新 API 接口
declare interface UpdateAPI {
  check: () => Promise<{ success: boolean; data?: { updateAvailable: boolean; info?: UpdateInfoType }; error?: string }>;
  download: () => Promise<{ success: boolean; error?: string }>;
  install: () => Promise<{ success: boolean; error?: string }>;
  getStatus: () => Promise<{ success: boolean; data?: { status: UpdateStatusType; updateInfo: UpdateInfoType | null; downloadProgress: DownloadProgressType | null; error: string | null }; error?: string }>;
  onStatus: (callback: (data: { status: UpdateStatusType; info?: UpdateInfoType; error?: string }) => void) => UnsubscribeFunction;
  onProgress: (callback: (progress: DownloadProgressType) => void) => UnsubscribeFunction;
}

// 应用 API 接口
declare interface AppAPI {
  getVersion: () => Promise<{ success: boolean; data?: { version: string; name: string; isPackaged: boolean }; error?: string }>;
  getPlatform: () => string;
  getArch: () => string;
  bootstrap: () => Promise<{ isAuthenticated: boolean; user?: UserInfo; accessToken?: string; [key: string]: any }>;
}

// 数据导出/导入 API 接口
declare interface DataAPI {
  export: (options?: {
    outputDir?: string;
    fileName?: string;
    include?: {
      sessions?: boolean;
      messages?: boolean;
      tags?: boolean;
      memories?: boolean;
      archivalMemories?: boolean;
      skills?: boolean;
      settings?: boolean;
    };
  }) => Promise<{ success: boolean; data?: { filePath: string; stats: any }; error?: string }>;
  exportSimple: () => Promise<{ success: boolean; data?: { filePath: string }; error?: string }>;
  import: (filePath: string, options?: {
    strategy?: 'merge' | 'overwrite' | 'add_only';
    conflictResolution?: 'keep_local' | 'keep_remote' | 'keep_newer';
    include?: {
      sessions?: boolean;
      messages?: boolean;
      tags?: boolean;
      memories?: boolean;
      archivalMemories?: boolean;
      skills?: boolean;
      settings?: boolean;
    };
    dryRun?: boolean;
  }) => Promise<{ success: boolean; data?: { stats: any }; error?: string }>;
  validate: (filePath: string) => Promise<{ success: boolean; data?: { valid: boolean; errors: string[] }; error?: string }>;
}

// 同步 API 接口
declare interface SyncAPI {
  push: () => Promise<{ success: boolean; data?: any; error?: string }>;
  pull: () => Promise<{ success: boolean; data?: any; error?: string }>;
  sync: (options?: { accessToken?: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
  getStatus: () => Promise<{ success: boolean; data?: any; error?: string }>;
  enable: () => Promise<{ success: boolean; error?: string }>;
  disable: () => Promise<{ success: boolean; error?: string }>;
  setAccessToken: (token: string | null) => Promise<{ success: boolean; error?: string }>;
  getConflicts: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
  resolveConflict: (conflictId: string, resolution: 'keep_local' | 'keep_remote' | 'manual_merge') => Promise<{ success: boolean; error?: string }>;
  getConfig: () => Promise<{ success: boolean; data?: any; error?: string }>;
  updateConfig: (updates: {
    apiBaseUrl?: string;
    syncInterval?: number;
    autoSync?: boolean;
    enabledEntities?: Array<'session' | 'tag' | 'memory_block' | 'skill' | 'setting'>;
    conflictStrategy?: 'keep_local' | 'keep_remote' | 'manual_merge';
  }) => Promise<{ success: boolean; error?: string }>;
  getPendingChanges: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
  getLastSyncTime: () => Promise<{ success: boolean; data?: { lastSyncTime: number | null }; error?: string }>;
}

// 记忆块类型
declare interface MemoryBlock {
  id: string;
  label: string;
  value: string;
  createdAt: number;
  updatedAt: number;
}

// 记忆块创建输入
declare interface MemoryBlockCreateInput {
  label: string;
  value: string;
}

// 记忆提取结果
declare interface MemoryExtraction {
  content: string;
  category?: string;
  importance?: 'high' | 'medium' | 'low';
}

// 敏感信息检查结果
declare interface SensitiveCheckResult {
  isSensitive: boolean;
  matches?: Array<{ type: string; match: string; line?: number }>;
}

// 记忆 API 接口
declare interface MemoryAPI {
  get: () => Promise<{ success: boolean; data?: UserMemoryData; error?: string }>;
  set: (content: string) => Promise<{ success: boolean; error?: string }>;
  clear: () => Promise<{ success: boolean; error?: string }>;
  getAll: () => Promise<{ success: boolean; data?: MemoryBlock[]; error?: string }>;
  getBlock: (labelOrId: string) => Promise<{ success: boolean; data?: MemoryBlock | null; error?: string }>;
  updateBlock: (labelOrId: string, value: string) => Promise<{ success: boolean; data?: MemoryBlock; error?: string }>;
  replaceInBlock: (labelOrId: string, oldText: string, newText: string) => Promise<{ success: boolean; data?: MemoryBlock; error?: string }>;
  createBlock: (input: MemoryBlockCreateInput) => Promise<{ success: boolean; data?: MemoryBlock; error?: string }>;
  deleteBlock: (id: string) => Promise<{ success: boolean; error?: string }>;
  clearBlock: (labelOrId: string) => Promise<{ success: boolean; data?: MemoryBlock; error?: string }>;
  appendToBlock: (labelOrId: string, content: string, separator?: string) => Promise<{ success: boolean; data?: MemoryBlock; error?: string }>;
  getContext: (options?: { includeEmpty?: boolean; maxBlocks?: number }) => Promise<{ success: boolean; data?: string; error?: string }>;
  extractFromSession: (sessionId: string) => Promise<{ success: boolean; data?: MemoryExtraction[]; error?: string }>;
  checkSensitive: (content: string) => Promise<{ success: boolean; data?: SensitiveCheckResult; error?: string }>;
}

// 技能类型
declare interface Skill {
  id: string;
  name: string;
  description?: string;
  category: 'code' | 'git' | 'debug' | 'refactor' | 'docs' | 'test' | 'review' | 'custom';
  content: string;
  enabled: boolean;
  isSystem: boolean;
  createdAt: number;
  updatedAt: number;
  usageCount?: number;
  variables?: string[];
}

// 技能创建输入
declare interface SkillCreateInput {
  name: string;
  description?: string;
  category?: 'code' | 'git' | 'debug' | 'refactor' | 'docs' | 'test' | 'review' | 'custom';
  content: string;
  isEnabled?: boolean;
}

// 技能更新输入
declare interface SkillUpdateInput {
  name?: string;
  description?: string;
  category?: 'code' | 'git' | 'debug' | 'refactor' | 'docs' | 'test' | 'review' | 'custom';
  content?: string;
  isEnabled?: boolean;
}

// 技能搜索选项
declare interface SkillSearchOptions {
  query?: string;
  category?: 'code' | 'git' | 'debug' | 'refactor' | 'docs' | 'test' | 'review' | 'custom';
  isEnabled?: boolean;
  isSystem?: boolean;
}

// 技能验证结果
declare interface ValidationResult {
  isValid: boolean;
  errors?: Array<{ line: number; message: string }>;
  warnings?: Array<{ line: number; message: string }>;
}

// 技能统计
declare interface SkillStats {
  total: number;
  enabled: number;
  disabled: number;
  system: number;
  custom: number;
  byCategory: Record<string, number>;
}

// 技能 API 接口
declare interface SkillAPI {
  getAll: () => Promise<{ success: boolean; data?: Skill[]; error?: string }>;
  getEnabled: () => Promise<{ success: boolean; data?: Skill[]; error?: string }>;
  get: (id: string) => Promise<{ success: boolean; data?: Skill | null; error?: string }>;
  create: (input: SkillCreateInput) => Promise<{ success: boolean; data?: Skill; error?: string }>;
  update: (id: string, input: SkillUpdateInput) => Promise<{ success: boolean; data?: Skill; error?: string }>;
  delete: (id: string) => Promise<{ success: boolean; error?: string }>;
  toggle: (id: string) => Promise<{ success: boolean; data?: { isEnabled: boolean }; error?: string }>;
  validate: (content: string) => Promise<{ success: boolean; data?: ValidationResult; error?: string }>;
  search: (options: SkillSearchOptions) => Promise<{ success: boolean; data?: Skill[]; error?: string }>;
  getByCategory: (category: string) => Promise<{ success: boolean; data?: Skill[]; error?: string }>;
  getStats: () => Promise<{ success: boolean; data?: SkillStats; error?: string }>;
  export: (id: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  import: (content: string, options?: { name?: string; overwrite?: boolean }) => Promise<{ success: boolean; data?: Skill; error?: string }>;
  getContext: (options?: { skillIds?: string[]; maxSkills?: number }) => Promise<{ success: boolean; data?: string; error?: string }>;
  getPrompt: (skillId: string, variables?: Record<string, string>) => Promise<{ success: boolean; data?: string; error?: string }>;
}

// 计费余额信息
declare interface BillingBalance {
  balance: string;
  currency: string;
  totalDeposited: string;
  totalSpent: string;
}

// 充值状态
declare type RechargeStatus = 'pending' | 'processing' | 'succeeded' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded' | 'needs_review';

// 充值结果
declare interface RechargeResult {
  orderId: string;
  method: 'stripe' | 'xunhupay';
  url: string;
  qrcodeUrl?: string;
  paymentUrl?: string;
}

// @deprecated 使用 RechargeResult 替代
declare interface RechargeOrder {
  id: string;
  amount: number;
  currency: string;
  channel: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay';
  status: RechargeStatus;
  createdAt: number;
  expiresAt: number;
  paymentUrl?: string;
  qrCodeUrl?: string;
}

// 充值状态结果
declare interface RechargeStatusResult {
  orderId: string;
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  amount?: number;
  currency?: string;
  paidAt?: string;
  paymentMethod?: string;
}

// 计费使用记录
declare interface BillingUsageRecord {
  id: string;
  createdAt: string;
  timestamp?: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  status: string;
  latencyMs?: number;
  currency?: string;
  sessionId?: string;
}

// 计费交易记录
declare interface BillingTransactionRecord {
  id: string;
  createdAt: string;
  type: 'deposit' | 'usage' | 'refund' | 'bonus';
  amount: number;
  currency: string;
  description?: string;
  timestamp?: number;
  balanceBefore?: string;
  balanceAfter?: number;
  channel?: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay';
}

// 使用统计
declare interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: string;
  currency: string;
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
  byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
  period: {
    start: string;
    end: string;
  };
}

// 定价信息
declare interface PricingInfo {
  multiplier: number;
  models: Record<string, { inputPerMillion: number; outputPerMillion: number }>;
  currency: string;
  note?: string;
}

// 计费 API 接口
declare interface BillingAPI {
  getBalance: (forceRefresh?: boolean) => Promise<{ success: boolean; data?: BillingBalance; error?: string }>;
  recharge: (
    amount: number,
    method: 'stripe' | 'xunhupay',
    options?: {
      currency?: string;
      paymentType?: 'wechat' | 'alipay';
      returnUrl?: string;
    }
  ) => Promise<{ success: boolean; data?: RechargeResult; error?: string }>;
  getRechargeStatus: (orderId: string) => Promise<{ success: boolean; data?: RechargeStatusResult; error?: string }>;
  getUsageHistory: (params?: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    model?: string;
  }) => Promise<{ success: boolean; data?: { records: BillingUsageRecord[]; total: number; meta?: any; summary?: any; pagination?: any }; error?: string }>;
  getUsageStats: (params?: {
    startDate?: string;
    endDate?: string;
  }) => Promise<{ success: boolean; data?: UsageStats; error?: string }>;
  getTransactionHistory: (params?: {
    page?: number;
    limit?: number;
    type?: string;
  }) => Promise<{ success: boolean; data?: { records: BillingTransactionRecord[]; total: number; pagination?: any }; error?: string }>;
  getPricing: () => Promise<{ success: boolean; data?: PricingInfo; error?: string }>;
  exportUsage: (params: {
    format: 'csv' | 'json';
    fileName?: string;
    startDate?: string;
    endDate?: string;
    model?: string;
  }) => Promise<{ success: boolean; data?: { filePath: string }; error?: string }>;
  openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
  getPeriodCard: () => Promise<{ success: boolean; data?: any; error?: string }>;
  getPeriodCardPlans: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
  purchasePeriodCard: (planId: string, paymentType: 'wechat' | 'alipay') => Promise<{ success: boolean; data?: any; error?: string }>;
  upgradePeriodCard: (planId: string, paymentType: 'wechat' | 'alipay') => Promise<{ success: boolean; data?: any; error?: string }>;
  getPeriodCardHistory: (page?: number, limit?: number) => Promise<{ success: boolean; data?: any[]; error?: string }>;
}
declare interface EventPayloadMapping {
  statistics: Statistics;
  getStaticData: StaticData;
  'client-event-dispatch': { success: boolean; error?: string };
  'generate-session-title': string;
  'get-recent-cwds': string[];
  'select-directory': string | null;
  'get-api-config': any;
  'save-api-config': { success: boolean; error?: string };
  'check-api-config': { hasConfig: boolean; config: any };
  'renderer-error-log': void;
}

// Shell API 接口
declare interface ShellAPI {
  showItemInFolder: (filePath: string, cwd: string) => Promise<{ success: boolean; error?: string }>;
  openPath: (filePath: string, cwd?: string) => Promise<{ success: boolean; error?: string }>;
}

// 通知 API 接口
declare interface NotificationAPI {
  show: (payload: { title: string; body?: string; silent?: boolean; sessionId?: string }) => Promise<{ success: boolean; error?: string }>;
  check: () => Promise<{ supported: boolean; error?: string }>;
  onClick: (callback: (data: { sessionId?: string | null }) => void) => () => void;
}

// 桌面窗口 API 接口
declare interface DesktopWindowAPI {
  onFullscreen: (callback: (isFullscreen: boolean) => void) => UnsubscribeFunction;
  isFullscreen: () => Promise<boolean>;
  setTitleBarOverlayTheme: (theme: 'light' | 'dark') => Promise<{ success: boolean; reason?: string }>;
}

// Electron API 接口
declare interface ElectronAPI {
  subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
  getStaticData: () => Promise<StaticData>;
  sendClientEvent: (event: any) => void;
  dispatchClientEvent: (event: any) => Promise<{ success: boolean; error?: string }>;
  onServerEvent: (callback: (event: any) => void) => UnsubscribeFunction;
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on?: (event: string, callback: (...args: any[]) => void) => () => void;
  removeListener?: (event: string, callback: (...args: any[]) => void) => void;
  generateSessionTitle: (userInput: string | null) => Promise<string>;
  getRecentCwds: (limit?: number) => Promise<string[]>;
  selectDirectory: () => Promise<string | null>;
  getApiConfig: () => Promise<any>;
  saveApiConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
  checkApiConfig: () => Promise<{ hasConfig: boolean; config: any }>;
  openExternal: (url: string) => Promise<void>;
  reportError: (error: { message: string; stack?: string; context?: any }) => Promise<void>;
  auth: AuthAPI;
  tags: TagsAPI;
  session: SessionOperationsAPI;
  workspace: WorkspaceAPI;
  shell: ShellAPI;
  update: UpdateAPI;
  notifications: NotificationAPI;
  window: DesktopWindowAPI;
  app: AppAPI;
  memory: MemoryAPI;
  skill: SkillAPI;
  data: DataAPI;
  sync: SyncAPI;
  billing: BillingAPI;

  // 认证相关的便捷方法
  getUserInfo?: (accessToken: string) => Promise<UserInfo | null>;
  loginWithEmail?: (email: string, password: string) => Promise<LoginResult | null>;
  openOAuthWindow?: (provider: 'google' | 'github') => Promise<void>;
  openLoginWindow?: () => void;
  openRegisterWindow?: () => void;
  openForgotPasswordWindow?: () => void;
  onAuthCallback?: (callback: (data: AuthCallbackData) => void) => UnsubscribeFunction;
  logout?: () => void;
  refreshToken?: (refreshToken: string) => Promise<RefreshTokenResult | null>;
  getBalance?: (accessToken: string) => Promise<BalanceInfo | null>;
}

// 扩展 Window 接口
interface Window {
  electron: ElectronAPI;
}
