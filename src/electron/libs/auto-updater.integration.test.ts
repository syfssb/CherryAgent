import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RegisteredHandler = (...args: unknown[]) => unknown;

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, RegisteredHandler>();
  const handle = vi.fn((channel: string, callback: RegisteredHandler) => {
    handlers.set(channel, callback);
  });

  return {
    app: {
      isPackaged: true,
      getVersion: vi.fn(() => '1.0.0'),
      getName: vi.fn(() => 'Cherry Agent'),
    },
    handle,
    handlers,
  };
});

vi.mock('electron', () => ({
  app: electronMocks.app,
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  ipcMain: {
    handle: electronMocks.handle,
  },
  dialog: {
    showMessageBox: vi.fn(),
  },
}));

import {
  __resetAutoUpdaterForTests,
  getAutoUpdater,
  registerUpdateHandlers,
} from './auto-updater';

describe('registerUpdateHandlers', () => {
  const scheduledCallbacks: Array<() => void | Promise<void>> = [];

  beforeEach(() => {
    __resetAutoUpdaterForTests();
    electronMocks.handlers.clear();
    electronMocks.handle.mockClear();
    scheduledCallbacks.length = 0;
    vi.spyOn(global, 'setTimeout').mockImplementation(((fn: TimerHandler) => {
      scheduledCallbacks.push(fn as () => void);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetAutoUpdaterForTests();
  });

  it('区分手动检查与后台自动检查的来源', async () => {
    registerUpdateHandlers({ enableLogging: false });
    const updater = getAutoUpdater();
    const checkSpy = vi.spyOn(updater, 'checkForUpdates').mockResolvedValue({
      updateAvailable: false,
    });

    const checkHandler = electronMocks.handlers.get('update:check');
    expect(checkHandler).toBeTypeOf('function');

    await checkHandler?.();
    expect(checkSpy).toHaveBeenCalledWith({ showPrompt: false, source: 'manual' });

    expect(scheduledCallbacks).toHaveLength(1);
    await scheduledCallbacks[0]?.();
    expect(checkSpy).toHaveBeenLastCalledWith({ showPrompt: false, source: 'background' });
  });
});
