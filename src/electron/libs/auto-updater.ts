/**
 * 自动更新模块
 *
 * 所有平台均走 electron-updater 原生后台下载 + 自动安装：
 * 1. macOS（Squirrel.Mac）：autoDownload=true 后台下载 zip，退出时 ShipIt 自动安装
 * 2. Windows（NSIS）：autoDownload=true 后台下载，用户点"立即重启"后 quitAndInstall 静默安装
 *
 * 支持三种更新策略:
 * 1. silent - 静默检查，不打断用户
 * 2. optional - 可选更新，下载完成后提示用户，允许跳过
 * 3. forced - 强制更新，必须更新才能继续使用
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { EventEmitter } from 'events';
import { tDesktop } from './desktop-i18n.js';

// electron-updater 类型定义
type ElectronAutoUpdaterType = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  autoRunAppAfterInstall: boolean;
  logger: unknown | null;
  setFeedURL: (options: { provider: string; url: string; channel?: string }) => void;
  checkForUpdates: () => Promise<unknown>;
  checkForUpdatesAndNotify: () => Promise<unknown>;
  downloadUpdate: (cancellationToken?: unknown) => Promise<unknown>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  on: {
    (event: 'checking-for-update', callback: () => void): void;
    (event: 'update-available', callback: (info: UpdateInfo) => void): void;
    (event: 'update-not-available', callback: (info: UpdateInfo) => void): void;
    (event: 'download-progress', callback: (progress: DownloadProgress) => void): void;
    (event: 'update-downloaded', callback: (info: UpdateInfo) => void): void;
    (event: 'error', callback: (error: Error) => void): void;
    (event: string, callback: (...args: unknown[]) => void): void;
  };
  removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
  currentVersion: { version: string };
};

// 更新状态类型
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

// 更新策略类型
export type UpdateStrategy = 'silent' | 'optional' | 'forced';

// 更新渠道类型
export type UpdateChannel = 'stable' | 'beta' | 'alpha';

// 更新检查来源
export type UpdateCheckSource = 'manual' | 'background';

// 更新信息
export interface UpdateInfo {
  version: string;
  releaseNotes?: string | ReleaseNoteItem[] | null;
  releaseDate?: string;
  files?: UpdateFileInfo[];
  stagingPercentage?: number;
  path?: string;
  sha512?: string;
}

// 更新文件信息
export interface UpdateFileInfo {
  url: string;
  size?: number;
  sha512?: string;
}

// 发布说明项
export interface ReleaseNoteItem {
  version: string;
  note: string | null;
}

// 服务端更新检查响应
export interface ServerUpdateResponse {
  success: boolean;
  data?: {
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseDate: string;
    releaseNotes: string;
    strategy: UpdateStrategy;
    forceUpdate: boolean;
    downloadUrl: string | null;
    downloadSize: number | null;
    sha512: string | null;
    changelog: unknown[];
    supportedPlatform: boolean;
  };
  error?: string;
}

// 下载进度信息
export interface DownloadProgress {
  total: number;
  delta: number;
  transferred: number;
  percent: number;
  bytesPerSecond: number;
}

// 更新事件类型
export interface UpdateEvents {
  'checking-for-update': void;
  'update-available': UpdateInfo;
  'update-not-available': UpdateInfo;
  'download-progress': DownloadProgress;
  'update-downloaded': UpdateInfo;
  'error': Error;
  'status-change': { status: UpdateStatus; info?: UpdateInfo; error?: Error };
}

// 更新配置
export interface AutoUpdaterConfig {
  /** 更新服务器 URL */
  feedURL?: string;
  /** 更新策略 API 服务器 URL（可与 feedURL 分离） */
  serverApiURL?: string;
  /** 是否自动下载 */
  autoDownload?: boolean;
  /** 是否自动安装并退出 */
  autoInstallOnAppQuit?: boolean;
  /** 是否允许降级 */
  allowDowngrade?: boolean;
  /** 更新策略 */
  strategy?: UpdateStrategy;
  /** 更新渠道 */
  channel?: UpdateChannel;
  /** 是否启用日志 */
  enableLogging?: boolean;
}

interface CheckForUpdatesOptions {
  showPrompt?: boolean;
  source?: UpdateCheckSource;
}

interface FeedResolutionOptions {
  latestVersion: string;
  platform?: NodeJS.Platform;
  arch?: string;
}

// 默认配置
const DEFAULT_CONFIG: AutoUpdaterConfig = {
  autoDownload: true,              // 后台自动下载
  autoInstallOnAppQuit: true,      // macOS: 退出时 ShipIt 安装；Windows 在 initialize() 中覆盖为 false
  allowDowngrade: false,
  strategy: 'optional',
  channel: 'stable',
  enableLogging: true,
};

/**
 * 判断是否为"手动更新平台"（现已废弃，所有平台均走 electron-updater 原生流程）
 * 保留此函数仅为兼容外部可能的引用，始终返回 false
 * @deprecated 所有平台现在都用 electron-updater 原生下载安装
 */
export function isManualUpdatePlatform(_platform: NodeJS.Platform = process.platform): boolean {
  return false;
}

function sanitizeFeedValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/^['"]|['"]$/g, '');
}

export function extractDownloadUrlFromFeedText(
  text: string,
  {
    latestVersion,
    platform = process.platform,
    arch = process.arch,
  }: FeedResolutionOptions,
): string | undefined {
  const dmgUrl = sanitizeFeedValue(text.match(/^dmgUrl:\s*(.+)$/m)?.[1]);
  if (platform === 'darwin' && dmgUrl) {
    return dmgUrl;
  }

  const rawUrl = sanitizeFeedValue(
    text.match(/^path:\s*(.+)$/m)?.[1]
    || text.match(/^\s*- url:\s*(.+)$/m)?.[1],
  );

  if (!rawUrl) {
    return undefined;
  }

  if (platform === 'darwin' && rawUrl.startsWith('https://github.com/')) {
    const ghMatch = rawUrl.match(/https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/(v[^/]+)\//);
    if (ghMatch) {
      const repo = ghMatch[1];
      const tag = ghMatch[2];
      const dmgName = arch === 'arm64'
        ? `Cherry.Agent-${latestVersion}-arm64.dmg`
        : `Cherry.Agent-${latestVersion}.dmg`;
      return `https://github.com/${repo}/releases/download/${tag}/${dmgName}`;
    }
  }

  if (rawUrl.startsWith('https://')) {
    return rawUrl;
  }

  return undefined;
}

/**
 * 自动更新管理器
 */
export class AutoUpdaterManager extends EventEmitter {
  private status: UpdateStatus = 'idle';
  private updateInfo: UpdateInfo | null = null;
  private downloadProgress: DownloadProgress | null = null;
  private config: AutoUpdaterConfig;
  private lastError: Error | null = null;
  private autoUpdater: ElectronAutoUpdaterType | null = null;
  private isInitialized = false;
  private checkingForUpdates = false;
  private forceUpdateRequired = false;
  private serverUpdateData: ServerUpdateResponse['data'] | null = null;

  constructor(config: AutoUpdaterConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化更新器（延迟加载 electron-updater）
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 动态导入 electron-updater
      // electron-updater 是 CJS 模块，用 defineProperty getter 延迟导出 autoUpdater。
      // ESM 动态导入 CJS 时，getter 不会被提取为 named export，
      // 必须从 .default（即 module.exports 对象）上访问。
      const electronUpdater = await import('electron-updater') as any;
      this.autoUpdater = (electronUpdater.default?.autoUpdater ?? electronUpdater.autoUpdater) as ElectronAutoUpdaterType;

      if (!this.autoUpdater) {
        throw new Error('electron-updater loaded but autoUpdater is undefined');
      }

      // 配置 logger
      if (this.config.enableLogging) {
        try {
          const logMod = await import('electron-log') as any;
          this.autoUpdater.logger = logMod.default ?? logMod;
        } catch {
          // electron-log not available, use console as fallback
          this.autoUpdater.logger = console;
        }
      } else {
        this.autoUpdater.logger = null;
      }

      // 配置 autoUpdater
      this.autoUpdater.autoDownload = this.config.autoDownload ?? true;
      this.autoUpdater.autoInstallOnAppQuit = this.config.autoInstallOnAppQuit ?? true;
      this.autoUpdater.allowDowngrade = this.config.allowDowngrade ?? false;
      this.autoUpdater.autoRunAppAfterInstall = true;

      // Windows 不在 quit 时自动安装，避免关机中断导致 NSIS 安装损坏 App
      if (process.platform === 'win32') {
        this.autoUpdater.autoInstallOnAppQuit = false;
      }

      // 如果有自定义的更新服务器 URL
      if (this.config.feedURL) {
        // 注意：不传 channel，让 electron-updater 使用默认值（latest.yml）
        // 传 channel: 'stable' 会导致 electron-updater 请求 stable.yml（不存在，404），
        // 从而导致 Windows 上"无法检测更新"或显示"已是最新版"
        this.autoUpdater.setFeedURL({
          provider: 'generic',
          url: this.config.feedURL,
        });
      }

      // 绑定事件
      this.setupEventListeners();
      this.isInitialized = true;

      this.log('info', 'AutoUpdater initialized successfully');
    } catch (error) {
      this.log('error', 'Failed to initialize AutoUpdater:', error);
      // 在开发环境或没有 electron-updater 时，使用模拟模式
      this.isInitialized = true;
      this.log('info', 'Running in mock mode (development or electron-updater not available)');
    }
  }

  /**
   * 日志输出
   */
  private log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void {
    if (!this.config.enableLogging) return;
    const prefix = '[AutoUpdater]';
    if (level === 'error') {
      console.error(prefix, ...args);
    } else if (level === 'warn') {
      console.warn(prefix, ...args);
    } else {
      console.info(prefix, ...args);
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.autoUpdater) return;

    this.autoUpdater.on('checking-for-update', () => {
      this.setStatus('checking');
      this.emit('checking-for-update');
    });

    this.autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.updateInfo = info;
      this.setStatus('available');
      this.emit('update-available', info);
      // 广播给前端：有新版本正在后台下载（autoDownload=true 时 electron-updater 自动开始下载）
      this.broadcastAvailableUpdate(info);
    });

    this.autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.updateInfo = info;
      this.setStatus('not-available');
      this.emit('update-not-available', info);
    });

    this.autoUpdater.on('download-progress', (progress: DownloadProgress) => {
      this.downloadProgress = progress;
      this.setStatus('downloading');
      this.emit('download-progress', progress);
      this.broadcastToWindows('update:progress', progress);
    });

    this.autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.updateInfo = info;
      this.setStatus('downloaded');
      this.emit('update-downloaded', info);
      // 广播专用频道，触发前端全局通知卡片（区别于 update:status 的聚合事件）
      const exePath = app.getPath('exe');
      const isInApplications = process.platform !== 'darwin' ||
        exePath.startsWith('/Applications/') || exePath.includes('/Applications/');
      this.broadcastToWindows('update:downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        isInApplications,
      });
    });

    this.autoUpdater.on('error', (error: Error) => {
      this.lastError = error;
      this.setStatus('error');
      this.emit('error', error);
    });
  }

  /**
   * 设置状态并触发状态变更事件
   */
  private setStatus(status: UpdateStatus): void {
    if (status !== 'error') {
      this.lastError = null;
    }
    this.status = status;
    this.emit('status-change', {
      status,
      info: this.updateInfo ?? undefined,
      error: this.lastError ?? undefined,
    });
    this.broadcastToWindows('update:status', {
      status,
      info: this.updateInfo,
      error: this.lastError?.message,
    });
  }

  /**
   * 广播消息到所有窗口
   */
  private broadcastToWindows(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(channel, data);
    }
  }

  /**
   * @deprecated 所有平台现在都走 electron-updater 原生流程，始终返回 false
   */
  private usesManualUpdateFlow(): boolean {
    return false;
  }

  private broadcastAvailableUpdate(info: UpdateInfo): void {
    this.broadcastToWindows('update:available-optional', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  }

  /**
   * 从 feed yml 读取最新版本并与当前版本比对
   *
   * macOS：绕过 Squirrel.Mac（强制要求代码签名，未签名静默失败）
   * Windows：绕过 electron-updater（同样存在静默失败、不发网络请求问题）
   *
   * 两个平台统一走 fetch → 解析 yml → 比对版本 → 弹对话框引导下载安装包
   */
  private async checkFeedForUpdate(
    ymlFilename: string,
    options: CheckForUpdatesOptions = {},
  ): Promise<{
    updateAvailable: boolean;
    info?: UpdateInfo;
    error?: string;
  }> {
    const feedURL = this.config.feedURL;
    if (!feedURL) {
      return { updateAvailable: false, error: 'No feedURL configured' };
    }

    try {
      this.setStatus('checking');
      const ymlURL = feedURL.replace(/\/+$/, '') + '/' + ymlFilename;
      this.log('info', `Custom feed update check: ${ymlURL}`);

      // 强制绕过 CDN 缓存，确保获取最新 yml（GitHub Pages Fastly CDN 默认 max-age=600）
      // 设 15 秒超时，避免网络差时 UI 永久卡在"检查中"
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 15_000);
      const response = await fetch(ymlURL, {
        signal: abortController.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store',
          'Pragma': 'no-cache',
        },
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Feed request failed: ${response.status}`);
      }

      const text = await response.text();

      const versionMatch = text.match(/^version:\s*(.+)$/m);
      const dateMatch = text.match(/^releaseDate:\s*['"]?(.+?)['"]?$/m);
      if (!versionMatch) {
        throw new Error(`Could not parse version from ${ymlFilename}`);
      }

      const latestVersion = versionMatch[1].trim();
      const releaseDate = dateMatch?.[1]?.trim();
      const currentVersion = app.getVersion();
      const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0;

      this.log('info', `Feed check: current=${currentVersion}, latest=${latestVersion}, hasUpdate=${hasUpdate}`);

      if (!hasUpdate) {
        this.setStatus('not-available');
        return { updateAvailable: false, info: { version: latestVersion, releaseDate } };
      }

      const downloadUrl = extractDownloadUrlFromFeedText(text, {
        latestVersion,
        platform: process.platform,
        arch: process.arch,
      });

      const info: UpdateInfo = {
        version: latestVersion,
        releaseDate,
        ...(downloadUrl ? { files: [{ url: downloadUrl }] } : {}),
      };

      this.updateInfo = info;
      this.setStatus('available');

      // background 静默检查：广播轻提示
      // manual 手动检查：同样广播（更新通知卡片），让 GlobalDialogs 也能感知
      // 两者都不弹 native dialog（showPrompt=false 时），避免打断用户
      if (!options.showPrompt) {
        this.broadcastAvailableUpdate(info);
      }

      if (options.showPrompt) {
        await this.showManualUpdateDialog(info, downloadUrl);
      }

      return { updateAvailable: true, info };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('error', 'Custom feed update check failed:', msg);
      this.setStatus('error');
      return { updateAvailable: false, error: msg };
    }
  }

  /**
   * 更新提示对话框（macOS / Windows 通用）
   * 引导用户在浏览器中下载安装包手动安装
   */
  private async showManualUpdateDialog(info: UpdateInfo, downloadUrl?: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows[0];
    if (!mainWindow) return;

    this.broadcastAvailableUpdate(info);

    const { shell } = await import('electron');
    const buttons = downloadUrl
      ? [tDesktop('update.downloadNow'), tDesktop('update.remindLater')]
      : [tDesktop('update.remindLater')];
    const response = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: tDesktop('update.newVersionFound'),
      message: tDesktop('update.versionDetected', { version: info.version }),
      detail: tDesktop('update.browserDownloadDetail'),
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      noLink: true,
    });

    if (response.response === 0 && downloadUrl) {
      shell.openExternal(downloadUrl);
    }
  }

  /**
   * 检查更新
   */
  async checkForUpdates(options: CheckForUpdatesOptions = {}): Promise<{
    updateAvailable: boolean;
    info?: UpdateInfo;
    error?: string;
  }> {
    await this.initialize();

    if (this.checkingForUpdates) {
      return {
        updateAvailable: false,
        error: 'Update check already in progress',
      };
    }

    this.checkingForUpdates = true;

    try {
      // 优先走 electron-updater 原生流程（无感更新：后台下载 + 退出时安装）。
      // autoDownload=true 时，checkForUpdates() 检测到新版本后自动开始下载，
      // 下载完成触发 update-downloaded 事件 → 前端显示通知 → 用户点"立即重启"→ quitAndInstall。
      //
      // 仅在 electron-updater 不可用（未初始化、import 失败）时，
      // 回退到自定义 feed check（手动 fetch yml 比对版本）。
      if (this.autoUpdater) {
        this.setStatus('checking');
        const result = await this.autoUpdater.checkForUpdates() as { updateInfo?: UpdateInfo } | null;

        if (result?.updateInfo) {
          const hasUpdate = this.compareVersions(
            result.updateInfo.version,
            app.getVersion()
          ) > 0;

          // autoDownload=true 时 electron-updater 已自动开始后台下载，
          // 无需手动调用 downloadUpdate()。
          // update-downloaded 事件触发后前端会显示"下载完成"通知卡片。
          if (hasUpdate && options.showPrompt) {
            await this.handleUpdateStrategy(result.updateInfo);
          }

          return {
            updateAvailable: hasUpdate,
            info: result.updateInfo,
          };
        }

        // electron-updater 返回 null（Squirrel.Mac 未签名等）→ fallback
        this.log('warn', 'electron-updater returned no updateInfo, falling back to feed check');
      } else {
        this.log('warn', 'electron-updater not available, using feed check');
      }

      // Fallback：自定义 feed check（直接 HTTP 拉取 yml 比对版本）
      const ymlFilename = process.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml';
      return await this.checkFeedForUpdate(ymlFilename, options);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastError = error instanceof Error ? error : new Error(errorMessage);
      this.setStatus('error');
      return {
        updateAvailable: false,
        error: errorMessage,
      };
    } finally {
      this.checkingForUpdates = false;
    }
  }

  /**
   * 从服务端 API 检查更新
   */
  private async checkServerUpdate(): Promise<ServerUpdateResponse | null> {
    const apiBaseURL = this.config.serverApiURL;
    if (!apiBaseURL) {
      return null;
    }

    try {
      const currentVersion = app.getVersion();
      const platform = process.platform;
      const arch = process.arch;
      const channel = this.config.channel || 'stable';

      const baseURL = apiBaseURL.replace(/\/+$/, '');
      const url = `${baseURL}/api/updates/latest?platform=${platform}&arch=${arch}&version=${currentVersion}&channel=${channel}`;

      this.log('info', `Checking for updates from server: ${url}`);

      const response = await fetch(url);
      if (!response.ok) {
        this.log('warn', `Server update check returned ${response.status}, fallback to feed`);
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        this.log('warn', `Server update check returned non-JSON content-type: ${contentType || 'unknown'}`);
        return null;
      }

      const data = await response.json() as ServerUpdateResponse;

      this.log('info', 'Server update check response:', data);

      return data;
    } catch (error) {
      this.log('error', 'Failed to check server update:', error);
      return null;
    }
  }

  /**
   * 是否应该自动下载更新
   * 所有平台均支持自动下载，配置 autoDownload=true 时生效
   */
  private shouldAutoDownload(): boolean {
    return this.config.autoDownload ?? true;
  }

  /**
   * 下载更新
   *
   * 所有平台统一走 electron-updater.downloadUpdate()。
   * 通常 autoDownload=true 时由 electron-updater 在检测到新版本后自动调用，
   * 此方法保留供手动触发（如用户主动点击"立即下载"）。
   */
  async downloadUpdate(): Promise<{
    success: boolean;
    error?: string;
  }> {
    await this.initialize();

    // 已在后台下载中（autoDownload=true），或已下载完成，直接视为成功
    if (this.status === 'downloading') {
      return { success: true };
    }
    if (this.status === 'downloaded') {
      return { success: true };
    }
    if (this.status !== 'available') {
      return {
        success: false,
        error: 'No update available to download',
      };
    }

    if (!this.autoUpdater) {
      return {
        success: false,
        error: 'Auto updater not available',
      };
    }

    try {
      this.setStatus('downloading');
      await this.autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastError = error instanceof Error ? error : new Error(errorMessage);
      this.setStatus('error');
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 安装更新并重启应用
   */
  installUpdate(_silent = false): {
    success: boolean;
    error?: string;
  } {
    if (!this.autoUpdater) {
      this.log('warn', 'Auto updater not available');
      return {
        success: false,
        error: 'Auto updater not available',
      };
    }

    if (this.status !== 'downloaded') {
      this.log('warn', 'No update downloaded');
      return {
        success: false,
        error: 'No update downloaded',
      };
    }

    // macOS：Squirrel.Mac 硬性要求 App 在可写目录（通常是 /Applications）
    // 若 App 从 DMG、下载文件夹或桌面运行，quitAndInstall() 会静默失败
    if (process.platform === 'darwin') {
      const exePath = app.getPath('exe');
      const inApplications = exePath.startsWith('/Applications/') || exePath.includes('/Applications/');
      if (!inApplications) {
        this.log('warn', `macOS update blocked: app not in /Applications (path: ${exePath})`);
        const windows = BrowserWindow.getAllWindows();
        const mainWindow = windows[0];
        if (mainWindow) {
          dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: tDesktop('update.notInApplicationsTitle'),
            message: tDesktop('update.notInApplicationsMsg'),
            detail: tDesktop('update.notInApplicationsDetail'),
            buttons: [tDesktop('update.ok')],
            noLink: true,
          });
        }
        return {
          success: false,
          error: 'App must be installed in /Applications to install updates automatically',
        };
      }

      // M1 兼容：延迟 500ms 让渲染进程完成清理后再触发 ShipIt
      this.log('info', 'Installing update (macOS): quitAndInstall in 500ms');
      setTimeout(() => {
        this.autoUpdater!.quitAndInstall(false, true);
      }, 500);
      return { success: true };
    }

    // Windows：isSilent=true（NSIS 静默安装），isForceRunAfter=true（安装后重启）
    if (process.platform === 'win32') {
      this.log('info', 'Installing update (Windows): quitAndInstall silent');
      this.autoUpdater.quitAndInstall(true, true);
      return { success: true };
    }

    // 其他平台（Linux 等）
    this.log('info', `Installing update (${process.platform})`);
    this.autoUpdater.quitAndInstall(false, true);
    return { success: true };
  }

  /**
   * 处理更新策略
   */
  async handleUpdateStrategy(info: UpdateInfo): Promise<void> {
    const strategy = this.config.strategy || 'optional';
    const forceUpdate = this.forceUpdateRequired;

    this.log('info', `Handling update strategy: ${strategy}, forceUpdate: ${forceUpdate}`);

    // 强制更新：阻止应用继续使用，必须更新
    if (forceUpdate || strategy === 'forced') {
      await this.showForceUpdateDialog(info);
      return;
    }

    // 静默更新策略：后台自动下载并安装（autoDownload=true 已在 initialize 时配置）
    if (strategy === 'silent') {
      // 已经在 checkForUpdates 阶段通过 electron-updater 自动下载，
      // 下载完成后 update-downloaded 事件会触发，update:downloaded 广播会通知前端
      this.log('info', 'Silent update will be installed on app quit (macOS) or on user restart (Windows)');
      this.broadcastToWindows('update:silent-ready', {
        version: info.version,
        willInstallOnQuit: process.platform !== 'win32',
      });
      return;
    }

    // 可选更新：提示用户选择是否更新
    if (strategy === 'optional') {
      await this.showOptionalUpdateDialog(info);
      return;
    }
  }

  /**
   * 显示强制更新对话框
   */
  private async showForceUpdateDialog(info: UpdateInfo): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows[0];

    if (!mainWindow) {
      this.log('warn', 'No window available to show force update dialog');
      return;
    }

    const response = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: tDesktop('update.requiredTitle'),
      message: tDesktop('update.requiredVersionDetected', { version: info.version }),
      detail:
        `${tDesktop('update.requiredDetailIntro')}\n\n` +
        (info.releaseNotes ? `${tDesktop('update.releaseNotes')}:\n${info.releaseNotes}\n\n` : '') +
        tDesktop('update.requiredAction'),
      buttons: [tDesktop('update.updateNow'), tDesktop('update.quitApp')],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (response.response === 0) {
      // 立即更新
      if (this.status === 'downloaded') {
        this.installUpdate(false);
      } else {
        await this.downloadUpdate();
        // 下载完成后会自动触发 update-downloaded 事件
      }
    } else {
      // 退出应用
      app.quit();
    }
  }

  /**
   * 显示可选更新对话框
   */
  private async showOptionalUpdateDialog(info: UpdateInfo): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows[0];

    const releaseNotes = Array.isArray(info.releaseNotes)
      ? info.releaseNotes
        .map((item) => [item.version, item.note].filter(Boolean).join(': '))
        .join('\n')
      : (info.releaseNotes || '');

    // 同步给渲染进程，便于设置页展示状态
    this.broadcastToWindows('update:available-optional', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });

    if (!mainWindow) {
      this.log('warn', 'No window available to show optional update dialog');
      return;
    }

    // 下载完成后，直接提示安装
    if (this.status === 'downloaded') {
      const response = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: tDesktop('update.downloadedTitle'),
        message: tDesktop('update.downloadedVersionReady', { version: info.version }),
        detail: tDesktop('update.installAndRestartDetail'),
        buttons: [tDesktop('update.installNowAndRestart'), tDesktop('update.installLater')],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });

      if (response.response === 0) {
        this.installUpdate(false);
      }
      return;
    }

    const response = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: tDesktop('update.newVersionFound'),
      message: tDesktop('update.versionDetected', { version: info.version }),
      detail:
        `${tDesktop('update.downloadPromptIntro')}\n\n` +
        (releaseNotes ? `${tDesktop('update.releaseNotes')}:\n${releaseNotes}` : tDesktop('update.downloadPromptFallback')),
      buttons: [tDesktop('update.downloadNow'), tDesktop('update.remindLater')],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (response.response === 0) {
      await this.downloadUpdate();
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    status: UpdateStatus;
    updateInfo: UpdateInfo | null;
    downloadProgress: DownloadProgress | null;
    error: string | null;
  } {
    return {
      status: this.status,
      updateInfo: this.updateInfo,
      downloadProgress: this.downloadProgress,
      error: this.lastError?.message ?? null,
    };
  }

  /**
   * 获取当前应用版本
   */
  getAppVersion(): string {
    return app.getVersion();
  }

  /**
   * 获取更新策略
   */
  getStrategy(): UpdateStrategy {
    return this.config.strategy ?? 'optional';
  }

  /**
   * 设置更新策略
   */
  setStrategy(strategy: UpdateStrategy): void {
    this.config.strategy = strategy;
    this.log('info', `Update strategy changed to: ${strategy}`);
  }

  /**
   * 获取更新渠道
   */
  getChannel(): UpdateChannel {
    return this.config.channel ?? 'stable';
  }

  /**
   * 设置更新渠道
   */
  setChannel(channel: UpdateChannel): void {
    this.config.channel = channel;
    this.log('info', `Update channel changed to: ${channel}`);

    // 重新配置 feedURL（不传 channel，避免 electron-updater 请求不存在的 stable.yml）
    if (this.autoUpdater && this.config.feedURL) {
      this.autoUpdater.setFeedURL({
        provider: 'generic',
        url: this.config.feedURL,
      });
    }
  }

  /**
   * 是否为强制更新
   */
  isForceUpdateRequired(): boolean {
    return this.forceUpdateRequired;
  }

  /**
   * 获取服务端更新数据
   */
  getServerUpdateData(): ServerUpdateResponse['data'] | null {
    return this.serverUpdateData;
  }

  /**
   * 比较版本号
   * @returns 1 如果 v1 > v2, -1 如果 v1 < v2, 0 如果相等
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.replace(/^v/, '').split('.').map(Number);
    const parts2 = v2.replace(/^v/, '').split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.status = 'idle';
    this.updateInfo = null;
    this.downloadProgress = null;
    this.lastError = null;
  }
}

// 创建单例实例
let autoUpdaterInstance: AutoUpdaterManager | null = null;

/**
 * 获取自动更新管理器实例
 */
export function getAutoUpdater(config?: AutoUpdaterConfig): AutoUpdaterManager {
  if (!autoUpdaterInstance) {
    autoUpdaterInstance = new AutoUpdaterManager(config);
  }
  return autoUpdaterInstance;
}

export function __resetAutoUpdaterForTests(): void {
  autoUpdaterInstance = null;
}

/**
 * 注册更新相关的 IPC 处理器
 */
export function registerUpdateHandlers(config?: AutoUpdaterConfig): void {
  const updater = getAutoUpdater(config);

  // 监听下载完成事件，根据策略处理
  updater.on('update-downloaded', (info: UpdateInfo) => {
    updater.handleUpdateStrategy(info).catch((error) => {
      console.error('[AutoUpdater] Failed to handle update strategy:', error);
    });
  });

  // update:check - 检查更新
  ipcMain.handle('update:check', async () => {
    try {
      const result = await updater.checkForUpdates({ showPrompt: false, source: 'manual' });
      if (result.error) {
        return {
          success: false,
          error: result.error,
          data: result,
        };
      }
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('[AutoUpdater] update:check failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check for updates',
      };
    }
  });

  // update:download - 下载更新
  ipcMain.handle('update:download', async () => {
    try {
      const result = await updater.downloadUpdate();
      return result;
    } catch (error) {
      console.error('[AutoUpdater] update:download failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download update',
      };
    }
  });

  // update:install - 安装更新
  ipcMain.handle('update:install', (_event, silent = false) => {
    try {
      return updater.installUpdate(silent);
    } catch (error) {
      console.error('[AutoUpdater] update:install failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to install update',
      };
    }
  });

  // update:getStatus - 获取更新状态
  ipcMain.handle('update:getStatus', () => {
    try {
      return {
        success: true,
        data: updater.getStatus(),
      };
    } catch (error) {
      console.error('[AutoUpdater] update:getStatus failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get update status',
      };
    }
  });

  // update:getStrategy - 获取更新策略
  ipcMain.handle('update:getStrategy', () => {
    try {
      return {
        success: true,
        data: {
          strategy: updater.getStrategy(),
          channel: updater.getChannel(),
          forceUpdate: updater.isForceUpdateRequired(),
        },
      };
    } catch (error) {
      console.error('[AutoUpdater] update:getStrategy failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get update strategy',
      };
    }
  });

  // update:setStrategy - 设置更新策略
  ipcMain.handle('update:setStrategy', (_event, strategy: UpdateStrategy) => {
    try {
      updater.setStrategy(strategy);
      return { success: true };
    } catch (error) {
      console.error('[AutoUpdater] update:setStrategy failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set update strategy',
      };
    }
  });

  // update:setChannel - 设置更新渠道
  ipcMain.handle('update:setChannel', (_event, channel: UpdateChannel) => {
    try {
      updater.setChannel(channel);
      return { success: true };
    } catch (error) {
      console.error('[AutoUpdater] update:setChannel failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set update channel',
      };
    }
  });

  // app:getVersion - 获取应用版本
  ipcMain.handle('app:getVersion', () => {
    try {
      return {
        success: true,
        data: {
          version: app.getVersion(),
          name: app.getName(),
          isPackaged: app.isPackaged,
        },
      };
    } catch (error) {
      console.error('[AutoUpdater] app:getVersion failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get app version',
      };
    }
  });

  console.info('[AutoUpdater] IPC handlers registered');

  // 启动时自动检查更新（可选）
  if (app.isPackaged) {
    // 延迟 10 秒后检查更新，避免影响启动性能。
    // 后台检查仅做轻提示，不主动弹出模态框。
    setTimeout(() => {
      updater.checkForUpdates({ showPrompt: false, source: 'background' }).catch((error) => {
        console.error('[AutoUpdater] Auto check failed:', error);
      });
    }, 10000);
  }
}
