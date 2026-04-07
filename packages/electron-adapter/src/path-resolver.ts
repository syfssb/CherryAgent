/**
 * Electron 路径解析器
 * 实现 IPathResolver 接口
 */

import { app } from 'electron';
import type { IPathResolver } from '@cherry-agent/shared';

export class ElectronPathResolver implements IPathResolver {
  getUserDataPath(): string {
    return app.getPath('userData');
  }

  getAppPath(): string {
    return app.getAppPath();
  }

  getTempPath(): string {
    return app.getPath('temp');
  }

  getDesktopPath(): string {
    return app.getPath('desktop');
  }

  getDocumentsPath(): string {
    return app.getPath('documents');
  }

  getDownloadsPath(): string {
    return app.getPath('downloads');
  }

  isPackaged(): boolean {
    return app.isPackaged;
  }

  getResourcesPath(): string {
    return process.resourcesPath;
  }
}
