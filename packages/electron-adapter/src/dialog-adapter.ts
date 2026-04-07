/**
 * Electron 对话框适配器
 * 实现 IDialogAdapter 接口
 */

import { dialog } from 'electron';
import type { IDialogAdapter } from '@cherry-agent/shared';

export class ElectronDialogAdapter implements IDialogAdapter {
  async showSaveDialog(options: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }> {
    const result = await dialog.showSaveDialog(options);
    return {
      canceled: result.canceled,
      filePath: result.filePath,
    };
  }

  async showOpenDialog(options: {
    title?: string;
    defaultPath?: string;
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }> {
    const result = await dialog.showOpenDialog(options);
    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    };
  }

  async showMessageBox(options: {
    type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    title?: string;
    message: string;
    detail?: string;
    buttons?: string[];
  }): Promise<{ response: number }> {
    const result = await dialog.showMessageBox(options);
    return { response: result.response };
  }
}
