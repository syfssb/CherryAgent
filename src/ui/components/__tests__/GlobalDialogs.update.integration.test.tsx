import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface UpdateAvailablePayload {
  version: string;
  releaseDate?: string;
  releaseNotes?: string | null;
  isInApplications?: boolean;
}

interface MockAppStoreState {
  setActivePage: ReturnType<typeof vi.fn>;
  setActiveSessionId: ReturnType<typeof vi.fn>;
}

const updateMocks = vi.hoisted(() => {
  let availableListener: ((info: UpdateAvailablePayload) => void) | null = null;
  let downloadedListener: ((info: UpdateAvailablePayload) => void) | null = null;

  return {
    download: vi.fn(async () => ({ success: true })),
    onAvailable: vi.fn((callback: (info: UpdateAvailablePayload) => void) => {
      availableListener = callback;
      return () => {
        if (availableListener === callback) {
          availableListener = null;
        }
      };
    }),
    onDownloaded: vi.fn((callback: (info: UpdateAvailablePayload) => void) => {
      downloadedListener = callback;
      return () => {
        if (downloadedListener === callback) {
          downloadedListener = null;
        }
      };
    }),
    emitAvailable: (info: UpdateAvailablePayload) => availableListener?.(info),
    emitDownloaded: (info: UpdateAvailablePayload) => downloadedListener?.(info),
  };
});

const authStoreMock = vi.hoisted(() => {
  return Object.assign(vi.fn(), {
    getState: () => ({
      logout: vi.fn(),
    }),
  });
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, values?: Record<string, string>) => {
      let text = fallback ?? key;
      if (typeof text === 'string' && values) {
        for (const [name, value] of Object.entries(values)) {
          text = text.replaceAll(`{{${name}}}`, String(value));
        }
      }
      return text;
    },
  }),
}));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: (selector: (state: MockAppStoreState) => unknown) => selector({
    setActivePage: vi.fn(),
    setActiveSessionId: vi.fn(),
  }),
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: authStoreMock,
}));

vi.mock('../StartSessionModal', () => ({
  StartSessionModal: () => null,
}));

vi.mock('../SettingsModal', () => ({
  SettingsModal: () => null,
}));

vi.mock('../auth/LoginModal', () => ({
  LoginModal: () => null,
}));

vi.mock('../billing/RechargeModal', () => ({
  RechargeModal: () => null,
}));

vi.mock('../auth/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../chat/PermissionDialog', () => ({
  PermissionDialog: () => null,
}));

import { GlobalDialogs } from '../GlobalDialogs';

describe('GlobalDialogs update notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electron = {
      update: {
        onAvailable: updateMocks.onAvailable,
        onDownloaded: updateMocks.onDownloaded,
        download: updateMocks.download,
      },
    } as unknown as typeof window.electron;
  });

  it('收到后台可更新事件后显示轻提示卡片，并可打开下载链接', async () => {
    const props: ComponentProps<typeof GlobalDialogs> = {
      showStartModal: false,
      showSettingsModal: false,
      showLoginModal: false,
      showRechargeModal: false,
      globalError: null,
      cwd: '/tmp',
      permissionMode: 'default' as unknown as ComponentProps<typeof GlobalDialogs>['permissionMode'],
      startSkillMode: 'manual',
      startActiveSkillIds: [],
      pendingStart: false,
      pendingPermissionQueue: [],
      onCloseStartModal: () => {},
      onCloseSettingsModal: () => {},
      onCloseLoginModal: () => {},
      onOpenLoginModal: () => {},
      onCloseRechargeModal: () => {},
      onOpenRechargeModal: () => {},
      onClearGlobalError: () => {},
      onCwdChange: () => {},
      onPermissionModeChange: () => {},
      onSkillModeChange: () => {},
      onActiveSkillIdsChange: () => {},
      onStartFromModal: () => {},
      onLoginSuccess: () => {},
      onRechargeSuccess: () => {},
      onPermissionResult: () => {},
    };

    render(
      <GlobalDialogs {...props} />,
    );

    act(() => {
      updateMocks.emitAvailable({
        version: '1.2.3',
      });
    });

    expect(screen.getByText('发现新版本')).toBeTruthy();
    expect(screen.getByText('新版本 1.2.3 已可用。')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '立即下载' }));

    await waitFor(() => {
      expect(updateMocks.download).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('发现新版本')).toBeNull();
    });
  });
});
