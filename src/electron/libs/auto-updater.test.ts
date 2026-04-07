import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => {
  const send = vi.fn();
  const openExternal = vi.fn(async () => undefined);
  const showMessageBox = vi.fn(async () => ({ response: 1 }));
  const getAllWindows = vi.fn(() => [{ webContents: { send } }]);
  const app = {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn((name: string) => {
      if (name === 'exe') {
        return '/Applications/Cherry Agent.app/Contents/MacOS/Cherry Agent';
      }
      return '/tmp';
    }),
    quit: vi.fn(),
    isPackaged: false,
    getName: vi.fn(() => 'Cherry Agent'),
  };

  return {
    app,
    getAllWindows,
    openExternal,
    send,
    showMessageBox,
  };
});

vi.mock('electron', () => ({
  app: electronMocks.app,
  BrowserWindow: {
    getAllWindows: electronMocks.getAllWindows,
  },
  ipcMain: {
    handle: vi.fn(),
  },
  dialog: {
    showMessageBox: electronMocks.showMessageBox,
  },
  shell: {
    openExternal: electronMocks.openExternal,
  },
}));

import {
  AutoUpdaterManager,
  type UpdateInfo,
  extractDownloadUrlFromFeedText,
} from './auto-updater';

type MutableAutoUpdaterManager = AutoUpdaterManager & {
  isInitialized: boolean;
  autoUpdater: { downloadUpdate: ReturnType<typeof vi.fn> } | null;
  status: 'available' | 'downloaded' | 'idle';
  updateInfo: UpdateInfo | null;
};

const originalPlatform = process.platform;
const originalArch = process.arch;
const fetchMock = vi.fn();

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

function setArch(value: string): void {
  Object.defineProperty(process, 'arch', {
    value,
    configurable: true,
  });
}

describe('auto-updater manual flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setPlatform(originalPlatform);
    setArch(originalArch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    setPlatform(originalPlatform);
    setArch(originalArch);
  });

  it('优先解析 macOS feed 里的 dmgUrl', () => {
    const text = [
      'version: 1.0.3',
      'files:',
      '  - url: https://github.com/your-org/your-repo/releases/download/v1.0.3/Cherry.Agent-1.0.3-arm64-mac.zip',
      'dmgUrl: https://dl.example.com/Cherry-Agent-1.0.3-arm64.dmg',
    ].join('\n');

    expect(
      extractDownloadUrlFromFeedText(text, {
        latestVersion: '1.0.3',
        platform: 'darwin',
        arch: 'arm64',
      }),
    ).toBe('https://dl.example.com/Cherry-Agent-1.0.3-arm64.dmg');
  });

  it('在 macOS x64 上可从 GitHub zip 地址推导 dmg 下载链接', () => {
    const text = [
      'version: 1.0.3',
      'files:',
      '  - url: https://github.com/your-org/your-repo/releases/download/v1.0.3/Cherry.Agent-1.0.3-mac.zip',
      'path: https://github.com/your-org/your-repo/releases/download/v1.0.3/Cherry.Agent-1.0.3-mac.zip',
    ].join('\n');

    expect(
      extractDownloadUrlFromFeedText(text, {
        latestVersion: '1.0.3',
        platform: 'darwin',
        arch: 'x64',
      }),
    ).toBe('https://github.com/your-org/your-repo/releases/download/v1.0.3/Cherry.Agent-1.0.3.dmg');
  });

  it('在 Windows 上优先解析 latest.yml 的 path 字段', async () => {
    setPlatform('win32');
    setArch('x64');
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => [
        'version: 1.1.0',
        'files:',
        '  - url: https://dl.example.com/Cherry-Agent-Setup-1.1.0.exe',
        'path: https://dl.example.com/Cherry-Agent-Setup-1.1.0.exe',
        "releaseDate: '2026-03-13T00:00:00.000Z'",
      ].join('\n'),
    });

    const manager = new AutoUpdaterManager({
      feedURL: 'https://updates.example.com',
      enableLogging: false,
    });
    (manager as unknown as MutableAutoUpdaterManager).isInitialized = true;

    const result = await manager.checkForUpdates({ source: 'background' });

    expect(result.updateAvailable).toBe(true);
    expect(result.info?.files?.[0]?.url).toBe('https://dl.example.com/Cherry-Agent-Setup-1.1.0.exe');
    expect(electronMocks.send).toHaveBeenCalledWith(
      'update:available-optional',
      expect.objectContaining({ version: '1.1.0' }),
    );
  });

  it('在手动更新平台上通过浏览器打开安装包，而不是调用 electron-updater 下载', async () => {
    setPlatform('win32');

    const nativeDownload = vi.fn();
    const manager = new AutoUpdaterManager({ enableLogging: false });
    const testManager = manager as unknown as MutableAutoUpdaterManager;
    testManager.isInitialized = true;
    testManager.autoUpdater = {
      downloadUpdate: nativeDownload,
    };
    testManager.status = 'available';
    testManager.updateInfo = {
      version: '1.1.0',
      files: [{ url: 'https://downloads.example.com/Cherry-Agent-Setup-1.1.0.exe' }],
    };

    const result = await manager.downloadUpdate();

    expect(result).toEqual({ success: true });
    expect(electronMocks.openExternal).toHaveBeenCalledWith('https://downloads.example.com/Cherry-Agent-Setup-1.1.0.exe');
    expect(nativeDownload).not.toHaveBeenCalled();
  });

  it('在手动更新平台上应用内安装会返回明确失败', () => {
    setPlatform('darwin');

    const manager = new AutoUpdaterManager({ enableLogging: false });

    expect(manager.installUpdate()).toEqual({
      success: false,
      error: 'Manual installation required',
    });
  });
});
