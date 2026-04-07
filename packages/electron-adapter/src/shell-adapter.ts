/**
 * Electron Shell 适配器
 * 实现 IShellAdapter 接口
 */

import { shell } from 'electron';
import type { IShellAdapter } from '@cherry-agent/shared';

export class ElectronShellAdapter implements IShellAdapter {
  async openExternal(url: string): Promise<void> {
    await shell.openExternal(url);
  }

  showItemInFolder(fullPath: string): void {
    shell.showItemInFolder(fullPath);
  }
}
