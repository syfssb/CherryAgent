import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuthStore } from './useAuthStore'

/**
 * 同步状态枚举
 */
export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'error'
  | 'conflict'

/**
 * 冲突类型
 */
export type ConflictType = 'local_newer' | 'remote_newer' | 'both_modified'

/**
 * 同步冲突
 */
export interface SyncConflict {
  id: string
  dataType: 'session' | 'memory' | 'skill' | 'settings'
  dataId: string
  dataName: string
  conflictType: ConflictType
  localSummary: string
  remoteSummary: string
  localModifiedAt: number
  remoteModifiedAt: number
  createdAt: number
}

/**
 * 同步历史记录
 */
export interface SyncHistoryItem {
  id: string
  syncedAt: number
  status: 'success' | 'partial' | 'failed'
  uploaded: number
  downloaded: number
  conflicts: number
  error?: string
  duration: number
}

/**
 * 同步配置
 */
export interface SyncConfig {
  autoSyncInterval: number
  syncSessions: boolean
  syncMemories: boolean
  syncSkills: boolean
  syncSettings: boolean
  conflictResolution: 'ask' | 'local' | 'remote' | 'newest'
}

type BackendConflictStrategy = 'keep_local' | 'keep_remote' | 'manual_merge'
type BackendAutoResolveStrategy = 'manual' | 'keep_latest' | 'keep_local' | 'keep_remote'
type BackendEntityType = 'session' | 'tag' | 'memory_block' | 'skill' | 'setting'
type BackendStatus = 'idle' | 'syncing' | 'pulling' | 'pushing' | 'resolving_conflicts' | 'error' | 'disabled'

interface BackendSyncConfig {
  syncInterval?: number
  autoSync?: boolean
  enabledEntities?: BackendEntityType[]
  conflictStrategy?: BackendConflictStrategy
  autoResolveStrategy?: BackendAutoResolveStrategy
}

interface BackendSyncStatusInfo {
  status: BackendStatus
  lastSyncTime: number | null
  unresolvedConflicts?: number
  isEnabled: boolean
}

interface SyncState {
  syncEnabled: boolean
  syncStatus: SyncStatus
  lastSyncTime: number | null
  lastSyncError: string | null
  config: SyncConfig
  conflicts: SyncConflict[]
  history: SyncHistoryItem[]
  syncProgress: {
    current: number
    total: number
    message: string
  } | null

  initialize: () => Promise<void>
  enableSync: () => Promise<void>
  disableSync: () => Promise<void>
  setSyncStatus: (status: SyncStatus) => void
  setLastSyncTime: (time: number) => void
  setLastSyncError: (error: string | null) => void
  setConfig: (config: Partial<SyncConfig>) => Promise<void>

  sync: () => Promise<void>
  cancelSync: () => void

  addConflict: (conflict: SyncConflict) => void
  removeConflict: (conflictId: string) => void
  resolveConflict: (conflictId: string, resolution: 'local' | 'remote') => Promise<void>
  resolveAllConflicts: (resolution: 'local' | 'remote') => Promise<void>
  clearConflicts: () => void

  addHistoryItem: (item: SyncHistoryItem) => void
  clearHistory: () => void

  setSyncProgress: (progress: { current: number; total: number; message: string } | null) => void
}

const defaultConfig: SyncConfig = {
  autoSyncInterval: 5,
  syncSessions: true,
  syncMemories: true,
  syncSkills: true,
  syncSettings: true,
  conflictResolution: 'ask',
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

function mapUiConfigToBackend(config: SyncConfig, syncEnabled: boolean): BackendSyncConfig {
  let conflictStrategy: BackendConflictStrategy = 'manual_merge'
  let autoResolveStrategy: BackendAutoResolveStrategy = 'manual'

  switch (config.conflictResolution) {
    case 'local':
      conflictStrategy = 'keep_local'
      autoResolveStrategy = 'keep_local'
      break
    case 'remote':
      conflictStrategy = 'keep_remote'
      autoResolveStrategy = 'keep_remote'
      break
    case 'newest':
      conflictStrategy = 'manual_merge'
      autoResolveStrategy = 'keep_latest'
      break
    case 'ask':
    default:
      conflictStrategy = 'manual_merge'
      autoResolveStrategy = 'manual'
      break
  }

  const enabledEntities: BackendEntityType[] = []
  if (config.syncSessions) {
    enabledEntities.push('session', 'tag')
  }
  if (config.syncMemories) {
    enabledEntities.push('memory_block')
  }
  if (config.syncSkills) {
    enabledEntities.push('skill')
  }
  if (config.syncSettings) {
    enabledEntities.push('setting')
  }

  return {
    syncInterval: config.autoSyncInterval * 60 * 1000,
    autoSync: syncEnabled,
    enabledEntities,
    conflictStrategy,
    autoResolveStrategy,
  }
}

function mapBackendConfigToUi(config: BackendSyncConfig | undefined): SyncConfig {
  if (!config) return defaultConfig

  const enabledEntities = Array.isArray(config.enabledEntities) ? config.enabledEntities : []
  const autoResolveStrategy = config.autoResolveStrategy ?? 'manual'

  let conflictResolution: SyncConfig['conflictResolution'] = 'ask'
  if (autoResolveStrategy === 'keep_latest') {
    conflictResolution = 'newest'
  } else if (autoResolveStrategy === 'keep_local' || config.conflictStrategy === 'keep_local') {
    conflictResolution = 'local'
  } else if (autoResolveStrategy === 'keep_remote' || config.conflictStrategy === 'keep_remote') {
    conflictResolution = 'remote'
  }

  return {
    autoSyncInterval: Math.max(1, Math.round((config.syncInterval ?? 5 * 60 * 1000) / 60000)),
    syncSessions: enabledEntities.includes('session') || enabledEntities.includes('tag'),
    syncMemories: enabledEntities.includes('memory_block'),
    syncSkills: enabledEntities.includes('skill'),
    syncSettings: enabledEntities.includes('setting'),
    conflictResolution,
  }
}

function mapBackendStatusToUi(statusInfo: BackendSyncStatusInfo | undefined): SyncStatus {
  if (!statusInfo) return 'idle'
  if ((statusInfo.unresolvedConflicts ?? 0) > 0) return 'conflict'

  switch (statusInfo.status) {
    case 'syncing':
    case 'pulling':
    case 'pushing':
    case 'resolving_conflicts':
      return 'syncing'
    case 'error':
      return 'error'
    case 'idle':
    case 'disabled':
    default:
      return 'idle'
  }
}

async function getAvailableAccessToken(): Promise<string | null> {
  const accessToken = useAuthStore.getState().accessToken
  if (accessToken) {
    return accessToken
  }

  try {
    const credentials = await window.electron?.auth?.getCredentials?.()
    return credentials?.accessToken ?? null
  } catch {
    return null
  }
}

async function syncAccessTokenToBackend(accessToken: string | null): Promise<void> {
  if (!window.electron?.sync?.setAccessToken) return
  await window.electron.sync.setAccessToken(accessToken)
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set, get) => ({
      syncEnabled: false,
      syncStatus: 'idle',
      lastSyncTime: null,
      lastSyncError: null,
      config: defaultConfig,
      conflicts: [],
      history: [],
      syncProgress: null,

      initialize: async () => {
        if (!window.electron?.sync) {
          return
        }

        try {
          const [configResult, statusResult, lastSyncResult] = await Promise.all([
            window.electron.sync.getConfig?.(),
            window.electron.sync.getStatus?.(),
            window.electron.sync.getLastSyncTime?.(),
          ])

          const nextState: Partial<SyncState> = {}

          if (configResult?.success && configResult.data) {
            nextState.config = mapBackendConfigToUi(configResult.data as BackendSyncConfig)
          }

          if (statusResult?.success && statusResult.data) {
            const statusInfo = statusResult.data as BackendSyncStatusInfo
            nextState.syncEnabled = Boolean(statusInfo.isEnabled)
            nextState.syncStatus = mapBackendStatusToUi(statusInfo)
            nextState.lastSyncTime = statusInfo.lastSyncTime
          }

          if (lastSyncResult?.success && lastSyncResult.data) {
            nextState.lastSyncTime = lastSyncResult.data.lastSyncTime
          }

          if (Object.keys(nextState).length > 0) {
            set(nextState)
          }

          const effectiveSyncEnabled = (nextState.syncEnabled ?? get().syncEnabled) === true
          if (effectiveSyncEnabled) {
            const accessToken = await getAvailableAccessToken()
            await syncAccessTokenToBackend(accessToken)
          }
        } catch (error) {
          set({
            lastSyncError: error instanceof Error ? error.message : 'Failed to initialize sync settings',
          })
        }
      },

      enableSync: async () => {
        const state = get()
        set({ syncEnabled: true, lastSyncError: null, syncStatus: state.syncStatus === 'error' ? 'idle' : state.syncStatus })

        try {
          const accessToken = await getAvailableAccessToken()
          if (!accessToken) {
            throw new Error('未登录，无法启用云同步')
          }

          if (window.electron?.sync) {
            await syncAccessTokenToBackend(accessToken)

            const updateConfigResult = await window.electron.sync.updateConfig?.(
              mapUiConfigToBackend(get().config, true),
            )
            if (updateConfigResult && !updateConfigResult.success) {
              throw new Error(updateConfigResult.error || 'Failed to update sync config')
            }

            const enableResult = await window.electron.sync.enable?.()
            if (enableResult && !enableResult.success) {
              throw new Error(enableResult.error || 'Failed to enable sync')
            }

            const statusResult = await window.electron.sync.getStatus?.()
            if (statusResult?.success && statusResult.data) {
              const statusInfo = statusResult.data as BackendSyncStatusInfo
              set({
                syncEnabled: Boolean(statusInfo.isEnabled),
                syncStatus: mapBackendStatusToUi(statusInfo),
                lastSyncTime: statusInfo.lastSyncTime,
              })
            }
          }
        } catch (error) {
          set({
            syncEnabled: false,
            syncStatus: 'error',
            lastSyncError: error instanceof Error ? error.message : 'Failed to enable sync',
          })
        }
      },

      disableSync: async () => {
        set({ syncEnabled: false, syncStatus: 'idle', syncProgress: null, lastSyncError: null })

        try {
          if (window.electron?.sync) {
            const disableResult = await window.electron.sync.disable?.()
            if (disableResult && !disableResult.success) {
              throw new Error(disableResult.error || 'Failed to disable sync')
            }
          }
        } catch (error) {
          set({
            lastSyncError: error instanceof Error ? error.message : 'Failed to disable sync',
          })
        }
      },

      setSyncStatus: (syncStatus) => set({ syncStatus }),
      setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
      setLastSyncError: (lastSyncError) => set({ lastSyncError }),

      setConfig: async (newConfig) => {
        const nextConfig = { ...get().config, ...newConfig }
        set({ config: nextConfig })

        try {
          if (window.electron?.sync?.updateConfig) {
            const result = await window.electron.sync.updateConfig(
              mapUiConfigToBackend(nextConfig, get().syncEnabled),
            )
            if (!result.success) {
              throw new Error(result.error || 'Failed to update sync config')
            }
          }
        } catch (error) {
          set({
            lastSyncError: error instanceof Error ? error.message : 'Failed to update sync config',
          })
        }
      },

      sync: async () => {
        const state = get()
        if (!state.syncEnabled || state.syncStatus === 'syncing') {
          console.log('[Sync] 同步被跳过:', { syncEnabled: state.syncEnabled, syncStatus: state.syncStatus })
          return
        }

        const accessToken = await getAvailableAccessToken()
        if (!accessToken) {
          console.error('[Sync] 同步失败: 未登录，无法同步')
          set({
            lastSyncError: '未登录，无法同步',
            syncStatus: 'error',
          })
          return
        }

        console.log('[Sync] 开始同步...')
        const startTime = Date.now()
        set({
          syncStatus: 'syncing',
          lastSyncError: null,
          syncProgress: { current: 0, total: 100, message: 'sync.preparing' },
        })

        try {
          if (window.electron?.sync) {
            await syncAccessTokenToBackend(accessToken)
            set({ syncProgress: { current: 10, total: 100, message: 'sync.connecting' } })

            const result = await window.electron.sync.sync({ accessToken })
            if (!result.success || !result.data) {
              throw new Error(result.error || 'Sync failed')
            }

            const syncData = result.data
            const duration = Date.now() - startTime
            const historyItem: SyncHistoryItem = {
              id: generateId(),
              syncedAt: Date.now(),
              status: syncData.conflicts > 0 ? 'partial' : 'success',
              uploaded: syncData.pushed,
              downloaded: syncData.pulled,
              conflicts: syncData.conflicts,
              duration,
            }

            if (syncData.conflicts > 0) {
              const conflictsResult = await window.electron.sync.getConflicts?.()
              if (conflictsResult?.success && conflictsResult.data) {
                const conflicts: SyncConflict[] = conflictsResult.data.map((c) => ({
                  id: c.id,
                  dataType: c.entityType === 'memory_block' ? 'memory' : (c.entityType as SyncConflict['dataType']),
                  dataId: c.entityId,
                  dataName: c.entityId,
                  conflictType: c.localTimestamp > c.remoteTimestamp ? 'local_newer' : 'remote_newer',
                  localSummary: JSON.stringify(c.localData).slice(0, 100),
                  remoteSummary: JSON.stringify(c.remoteData).slice(0, 100),
                  localModifiedAt: c.localTimestamp,
                  remoteModifiedAt: c.remoteTimestamp,
                  createdAt: Date.now(),
                }))

                set((prevState) => ({
                  conflicts,
                  syncStatus: 'conflict',
                  lastSyncTime: Date.now(),
                  syncProgress: null,
                  history: [historyItem, ...prevState.history].slice(0, 50),
                }))
                return
              }
            }

            set((prevState) => ({
              syncStatus: 'success',
              lastSyncTime: Date.now(),
              syncProgress: null,
              history: [historyItem, ...prevState.history].slice(0, 50),
            }))

            setTimeout(() => {
              const currentState = get()
              if (currentState.syncStatus === 'success') {
                set({ syncStatus: 'idle' })
              }
            }, 3000)
            return
          }

          set({ syncProgress: { current: 20, total: 100, message: 'sync.uploading' } })
          await new Promise((resolve) => setTimeout(resolve, 500))
          set({ syncProgress: { current: 50, total: 100, message: 'sync.downloading' } })
          await new Promise((resolve) => setTimeout(resolve, 500))
          set({ syncProgress: { current: 80, total: 100, message: 'sync.merging' } })
          await new Promise((resolve) => setTimeout(resolve, 300))
          set({ syncProgress: { current: 100, total: 100, message: 'sync.complete' } })

          const duration = Date.now() - startTime
          const historyItem: SyncHistoryItem = {
            id: generateId(),
            syncedAt: Date.now(),
            status: 'success',
            uploaded: Math.floor(Math.random() * 10),
            downloaded: Math.floor(Math.random() * 5),
            conflicts: 0,
            duration,
          }

          set((prevState) => ({
            syncStatus: 'success',
            lastSyncTime: Date.now(),
            syncProgress: null,
            history: [historyItem, ...prevState.history].slice(0, 50),
          }))

          setTimeout(() => {
            const currentState = get()
            if (currentState.syncStatus === 'success') {
              set({ syncStatus: 'idle' })
            }
          }, 3000)
        } catch (error) {
          const duration = Date.now() - startTime
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'

          const historyItem: SyncHistoryItem = {
            id: generateId(),
            syncedAt: Date.now(),
            status: 'failed',
            uploaded: 0,
            downloaded: 0,
            conflicts: 0,
            error: errorMessage,
            duration,
          }

          set((prevState) => ({
            syncStatus: 'error',
            lastSyncError: errorMessage,
            syncProgress: null,
            history: [historyItem, ...prevState.history].slice(0, 50),
          }))
        }
      },

      cancelSync: () => {
        set({
          syncStatus: 'idle',
          syncProgress: null,
        })
      },

      addConflict: (conflict) =>
        set((state) => ({
          conflicts: [...state.conflicts, conflict],
          syncStatus: 'conflict',
        })),

      removeConflict: (conflictId) =>
        set((state) => {
          const newConflicts = state.conflicts.filter((c) => c.id !== conflictId)
          return {
            conflicts: newConflicts,
            syncStatus: newConflicts.length === 0 ? 'idle' : 'conflict',
          }
        }),

      resolveConflict: async (conflictId, resolution) => {
        const state = get()
        const conflict = state.conflicts.find((c) => c.id === conflictId)
        if (!conflict) return

        try {
          if (window.electron?.sync) {
            const result = await window.electron.sync.resolveConflict(
              conflictId,
              resolution === 'local' ? 'keep_local' : 'keep_remote',
            )
            if (!result.success) {
              throw new Error(result.error || 'Failed to resolve conflict')
            }
          } else {
            await new Promise((resolve) => setTimeout(resolve, 200))
          }

          set((prevState) => {
            const newConflicts = prevState.conflicts.filter((c) => c.id !== conflictId)
            return {
              conflicts: newConflicts,
              syncStatus: newConflicts.length === 0 ? 'idle' : 'conflict',
            }
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to resolve conflict'
          set({ lastSyncError: errorMessage })
        }
      },

      resolveAllConflicts: async (resolution) => {
        const state = get()
        if (state.conflicts.length === 0) return

        try {
          if (window.electron?.sync) {
            for (const conflict of state.conflicts) {
              const result = await window.electron.sync.resolveConflict(
                conflict.id,
                resolution === 'local' ? 'keep_local' : 'keep_remote',
              )
              if (!result.success) {
                throw new Error(result.error || `Failed to resolve conflict ${conflict.id}`)
              }
            }
          } else {
            await new Promise((resolve) => setTimeout(resolve, 500))
          }

          set({
            conflicts: [],
            syncStatus: 'idle',
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to resolve conflicts'
          set({ lastSyncError: errorMessage })
        }
      },

      clearConflicts: () => set({ conflicts: [], syncStatus: 'idle' }),

      addHistoryItem: (item) =>
        set((state) => ({
          history: [item, ...state.history].slice(0, 50),
        })),

      clearHistory: () => set({ history: [] }),

      setSyncProgress: (syncProgress) => set({ syncProgress }),
    }),
    {
      name: 'sync-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        syncEnabled: state.syncEnabled,
        lastSyncTime: state.lastSyncTime,
        config: state.config,
        history: state.history,
      }),
    },
  ),
)

export default useSyncStore
