import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SupportedLanguage } from '@/ui/i18n/config'
import { getBrowserLanguage } from '@/ui/hooks/useLanguage'
import { getModKey } from '@/ui/utils/platform'

/**
 * 主题类型
 */
export type Theme = 'light' | 'dark' | 'system'

/**
 * 支持的语言
 */
export type Language = SupportedLanguage

/**
 * 思考强度
 */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high'

/**
 * 通知设置
 */
export interface NotificationSettings {
  /** 是否启用通知 */
  enabled: boolean
  /** 是否启用声音 */
  soundEnabled: boolean
  /** 是否显示桌面通知 */
  desktopNotifications: boolean
  /** 是否提示权限请求 */
  permissionNotifications: boolean
}

/**
 * 编辑器设置
 */
export interface EditorSettings {
  /** 字体大小 */
  fontSize: number
  /** 字体家族 */
  fontFamily: string
  /** 是否显示行号 */
  showLineNumbers: boolean
  /** 是否自动换行 */
  wordWrap: boolean
  /** Tab 大小 */
  tabSize: number
}

/**
 * 隐私设置
 */
export interface PrivacySettings {
  /** 是否发送匿名使用数据 */
  sendAnalytics: boolean
  /** 是否保存聊天历史 */
  saveChatHistory: boolean
  /** 历史记录保留天数 */
  historyRetentionDays: number
}

/**
 * Provider 设置
 */
export interface ProviderSettings {
  /** 是否允许切换 provider */
  enableProviderSwitch: boolean
  /** 默认 provider */
  defaultProvider: 'claude' | 'codex'
}

/**
 * 多任务设置
 */
export interface MultitaskSettings {
  /** 切换会话时自动暂停后台任务 */
  autoPauseOnSwitch: boolean
  /** 允许的最大并发会话数 */
  maxConcurrentSessions: number
  /** 达到上限时是否排队 */
  queueWhenFull: boolean
}

/**
 * 聊天排版设置
 */
export interface ChatTypography {
  /** 正文字体大小 (px) */
  fontSize: number
  /** 行高倍数 */
  lineHeight: number
  /** 段落间距 (em) */
  paragraphSpacing: number
}

/**
 * 设置状态
 */
interface SettingsState {
  // 外观设置
  theme: Theme
  language: Language

  // 用户头像（emoji 预设）
  userAvatar: string

  // 通知设置
  notifications: NotificationSettings

  // 编辑器设置
  editor: EditorSettings

  // 隐私设置
  privacy: PrivacySettings

  // 自动更新
  autoUpdate: boolean

  // 快捷键
  shortcuts: Record<string, string>

  // 多任务
  multitask: MultitaskSettings

  // Provider 设置
  provider: ProviderSettings

  // 思考强度
  thinkingEffort: ThinkingEffort

  // 聊天排版
  chatTypography: ChatTypography

  // Actions
  setTheme: (theme: Theme) => void
  setLanguage: (language: Language) => void
  setUserAvatar: (avatar: string) => void
  setNotifications: (settings: Partial<NotificationSettings>) => void
  setEditor: (settings: Partial<EditorSettings>) => void
  setPrivacy: (settings: Partial<PrivacySettings>) => void
  setAutoUpdate: (enabled: boolean) => void
  setShortcut: (action: string, shortcut: string) => void
  setMultitask: (settings: Partial<MultitaskSettings>) => void
  setProviderSettings: (settings: Partial<ProviderSettings>) => void
  setThinkingEffort: (effort: ThinkingEffort) => void
  setChatTypography: (settings: Partial<ChatTypography>) => void
  resetChatTypography: () => void
  resetToDefaults: () => void
}

/**
 * 默认通知设置
 */
const defaultNotifications: NotificationSettings = {
  enabled: true,
  soundEnabled: true,
  desktopNotifications: true,
  permissionNotifications: true,
}

/**
 * 默认编辑器设置
 */
const defaultEditor: EditorSettings = {
  fontSize: 14,
  fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
  showLineNumbers: true,
  wordWrap: true,
  tabSize: 2,
}

/**
 * 默认隐私设置
 */
const defaultPrivacy: PrivacySettings = {
  sendAnalytics: false,
  saveChatHistory: true,
  historyRetentionDays: 30,
}

/**
 * 默认快捷键（根据平台自动选择 Cmd / Ctrl）
 */
const modKey = getModKey()
const defaultShortcuts: Record<string, string> = {
  newSession: `${modKey}+N`,
  closeSession: `${modKey}+W`,
  settings: `${modKey}+,`,
  search: `${modKey}+F`,
  send: 'Enter',
  newLine: 'Shift+Enter',
}

/**
 * 默认多任务设置
 */
const defaultMultitask: MultitaskSettings = {
  autoPauseOnSwitch: false,
  maxConcurrentSessions: 5,
  queueWhenFull: true
}

/**
 * 默认 Provider 设置
 */
const defaultProvider: ProviderSettings = {
  enableProviderSwitch: false,
  defaultProvider: 'claude',
}

/**
 * 默认聊天排版设置
 */
export const defaultChatTypography: ChatTypography = {
  fontSize: 15,
  lineHeight: 1.8,
  paragraphSpacing: 0.75,
}

/**
 * 获取默认状态
 */
const getDefaultState = () => ({
  theme: 'system' as Theme,
  language: getBrowserLanguage(),
  userAvatar: 'grinning',
  notifications: defaultNotifications,
  editor: defaultEditor,
  privacy: defaultPrivacy,
  autoUpdate: true,
  shortcuts: defaultShortcuts,
  multitask: defaultMultitask,
  provider: defaultProvider,
  thinkingEffort: 'high' as ThinkingEffort,
  chatTypography: defaultChatTypography,
})

/**
 * 设置 Store
 *
 * 管理应用的各种设置，包括主题、语言、通知、编辑器、隐私等。
 * 所有设置自动持久化到 localStorage。
 *
 * @example
 * ```tsx
 * function SettingsPage() {
 *   const { theme, setTheme, language, setLanguage } = useSettingsStore()
 *
 *   return (
 *     <div>
 *       <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
 *         <option value="light">Light</option>
 *         <option value="dark">Dark</option>
 *         <option value="system">System</option>
 *       </select>
 *     </div>
 *   )
 * }
 * ```
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...getDefaultState(),

      setTheme: (theme) => set({ theme }),

      setLanguage: (language) => set({ language }),

      setUserAvatar: (userAvatar) => set({ userAvatar }),

      setNotifications: (settings) =>
        set((state) => ({
          notifications: { ...state.notifications, ...settings },
        })),

      setEditor: (settings) =>
        set((state) => ({
          editor: { ...state.editor, ...settings },
        })),

      setPrivacy: (settings) =>
        set((state) => ({
          privacy: { ...state.privacy, ...settings },
        })),

      setAutoUpdate: (autoUpdate) => set({ autoUpdate }),

      setShortcut: (action, shortcut) =>
        set((state) => ({
          shortcuts: { ...state.shortcuts, [action]: shortcut },
        })),

      setMultitask: (settings) =>
        set((state) => ({
          multitask: { ...state.multitask, ...settings },
        })),

      setProviderSettings: (settings) =>
        set((state) => ({
          provider: { ...state.provider, ...settings },
        })),

      setThinkingEffort: (thinkingEffort) => set({ thinkingEffort }),

      setChatTypography: (settings) =>
        set((state) => ({
          chatTypography: { ...state.chatTypography, ...settings },
        })),

      resetChatTypography: () => set({ chatTypography: defaultChatTypography }),

      resetToDefaults: () => set(getDefaultState()),
    }),
    {
      name: 'settings-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState, fromVersion) => {
        // 版本 0 → 1：无破坏性变更，直接合并默认值
        const state = (persistedState ?? {}) as Partial<SettingsState>;
        return { ...getDefaultState(), ...state };
      },
      // 只持久化需要保存的字段
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        userAvatar: state.userAvatar,
        notifications: state.notifications,
        editor: state.editor,
        privacy: state.privacy,
        autoUpdate: state.autoUpdate,
        shortcuts: state.shortcuts,
        multitask: state.multitask,
        provider: state.provider,
        thinkingEffort: state.thinkingEffort,
        chatTypography: state.chatTypography,
      }),
    }
  )
)

export default useSettingsStore
