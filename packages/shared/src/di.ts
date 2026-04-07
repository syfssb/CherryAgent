/**
 * 依赖注入接口定义
 *
 * 这些接口抽象了 Electron 特有的 API，
 * 使 core 包可以在不依赖 Electron 的情况下运行。
 */

/**
 * 路径解析器接口
 * 抽象 Electron 的 app.getPath(), app.getAppPath(), app.isPackaged 等
 */
export interface IPathResolver {
  /** 获取用户数据目录 (对应 app.getPath('userData')) */
  getUserDataPath(): string;

  /** 获取应用根路径 (对应 app.getAppPath()) */
  getAppPath(): string;

  /** 获取临时目录 (对应 app.getPath('temp')) */
  getTempPath(): string;

  /** 获取桌面路径 (对应 app.getPath('desktop')) */
  getDesktopPath(): string;

  /** 获取文档目录 (对应 app.getPath('documents')) */
  getDocumentsPath(): string;

  /** 获取下载目录 (对应 app.getPath('downloads')) */
  getDownloadsPath(): string;

  /** 是否为打包后的应用 (对应 app.isPackaged) */
  isPackaged(): boolean;

  /** 获取资源路径 (对应 process.resourcesPath) */
  getResourcesPath(): string;
}

/**
 * Shell 操作接口
 * 抽象 Electron 的 shell.openExternal() 等
 */
export interface IShellAdapter {
  /** 在默认浏览器中打开 URL (对应 shell.openExternal()) */
  openExternal(url: string): Promise<void>;

  /** 在文件管理器中显示文件 (对应 shell.showItemInFolder()) */
  showItemInFolder(fullPath: string): void;
}

/**
 * 对话框接口
 * 抽象 Electron 的 dialog API
 */
export interface IDialogAdapter {
  /** 显示保存文件对话框 (对应 dialog.showSaveDialog()) */
  showSaveDialog(options: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }>;

  /** 显示打开文件对话框 (对应 dialog.showOpenDialog()) */
  showOpenDialog(options: {
    title?: string;
    defaultPath?: string;
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;

  /** 显示消息框 (对应 dialog.showMessageBox()) */
  showMessageBox(options: {
    type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    title?: string;
    message: string;
    detail?: string;
    buttons?: string[];
  }): Promise<{ response: number }>;
}

/**
 * 安全令牌存储接口
 * 抽象 Electron 的 safeStorage API
 */
export type TokenKey = "accessToken" | "refreshToken" | "apiKey";

export interface ITokenStorage {
  /** 保存令牌 */
  saveToken(key: TokenKey, value: string): void;

  /** 获取令牌 */
  getToken(key: TokenKey): string | null;

  /** 删除令牌 */
  deleteToken(key: TokenKey): void;

  /** 检查令牌是否存在 */
  hasToken(key: TokenKey): boolean;

  /** 清除所有令牌 */
  clearAllTokens(): void;

  /** 批量保存令牌 */
  saveTokensBatch(tokens: Partial<Record<TokenKey, string>>): void;
}

/**
 * 认证凭据获取接口
 * 抽象从安全存储中获取认证信息
 */
export interface IAuthCredentialProvider {
  /** 获取访问令牌 */
  getAccessToken(): Promise<string | null>;

  /** 获取存储的凭据 */
  getStoredCredentials(): Promise<{ accessToken: string; refreshToken?: string } | null>;
}
