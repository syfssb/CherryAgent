import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncStore } from '../useSyncStore'
import { useAuthStore } from '../useAuthStore'

describe('useSyncStore backend integration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()

    useAuthStore.setState({
      ...useAuthStore.getState(),
      accessToken: 'user-access-token',
      refreshToken: null,
      tokenExpiresAt: null,
      isAuthenticated: true,
    })

    useSyncStore.setState({
      ...useSyncStore.getState(),
      syncEnabled: false,
      syncStatus: 'idle',
      lastSyncTime: null,
      lastSyncError: null,
      config: {
        autoSyncInterval: 5,
        syncSessions: true,
        syncMemories: true,
        syncSkills: true,
        syncSettings: true,
        conflictResolution: 'ask',
      },
      conflicts: [],
      history: [],
      syncProgress: null,
    })

    ;(window as any).electron = {
      auth: {
        getCredentials: vi.fn().mockResolvedValue({ accessToken: 'stored-access-token' }),
      },
      sync: {
        getConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            apiBaseUrl: 'https://example.com/api',
            syncInterval: 15 * 60 * 1000,
            autoSync: true,
            enabledEntities: ['session', 'tag', 'skill'],
            conflictStrategy: 'manual_merge',
            autoResolveStrategy: 'keep_latest',
          },
        }),
        getStatus: vi.fn().mockResolvedValue({
          success: true,
          data: {
            status: 'idle',
            isEnabled: true,
            lastSyncTime: 123456,
            unresolvedConflicts: 0,
          },
        }),
        getLastSyncTime: vi.fn().mockResolvedValue({ success: true, data: { lastSyncTime: 123456 } }),
        setAccessToken: vi.fn().mockResolvedValue({ success: true }),
        updateConfig: vi.fn().mockResolvedValue({ success: true }),
        enable: vi.fn().mockResolvedValue({ success: true }),
        disable: vi.fn().mockResolvedValue({ success: true }),
      },
    }
  })

  it('initialize 会从主进程加载同步配置和状态', async () => {
    await useSyncStore.getState().initialize()

    expect(useSyncStore.getState().syncEnabled).toBe(true)
    expect(useSyncStore.getState().lastSyncTime).toBe(123456)
    expect(useSyncStore.getState().config.autoSyncInterval).toBe(15)
    expect(useSyncStore.getState().config.syncSessions).toBe(true)
    expect(useSyncStore.getState().config.syncMemories).toBe(false)
    expect(useSyncStore.getState().config.syncSkills).toBe(true)
    expect(useSyncStore.getState().config.conflictResolution).toBe('newest')
    expect((window as any).electron.sync.setAccessToken).toHaveBeenCalledWith('user-access-token')
  })

  it('enableSync 会把 token 和配置同步到主进程', async () => {
    await useSyncStore.getState().enableSync()

    expect((window as any).electron.sync.setAccessToken).toHaveBeenCalledWith('user-access-token')
    expect((window as any).electron.sync.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        autoSync: true,
        syncInterval: 5 * 60 * 1000,
        enabledEntities: expect.arrayContaining(['session', 'tag', 'memory_block', 'skill', 'setting']),
        conflictStrategy: 'manual_merge',
        autoResolveStrategy: 'manual',
      }),
    )
    expect((window as any).electron.sync.enable).toHaveBeenCalled()
  })
})
