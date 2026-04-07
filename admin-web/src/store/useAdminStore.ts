import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface AdminUser {
  id: string
  username: string
  email: string
  role: AdminRole
  avatar?: string
  permissions: string[]
  lastLoginAt: string
}

export type AdminRole = 'super_admin' | 'admin' | 'operator' | 'viewer'

type Theme = 'light' | 'dark' | 'system'

interface AdminState {
  admin: AdminUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  sidebarCollapsed: boolean
  theme: Theme

  setAdmin: (admin: AdminUser, token: string) => void
  logout: () => void
  setLoading: (loading: boolean) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  hasPermission: (permission: string) => boolean
  setTheme: (theme: Theme) => void
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.toggle('dark', theme === 'dark')
  }
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      admin: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      sidebarCollapsed: false,
      theme: 'dark' as Theme,

      setAdmin: (admin: AdminUser, token: string) => {
        set({
          admin,
          token,
          isAuthenticated: true,
          isLoading: false,
        })
      },

      logout: () => {
        set({
          admin: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        })
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
      },

      setSidebarCollapsed: (collapsed: boolean) => {
        set({ sidebarCollapsed: collapsed })
      },

      hasPermission: (permission: string) => {
        const { admin } = get()
        if (!admin) return false
        if (admin.role === 'super_admin') return true
        return admin.permissions.includes(permission)
      },

      setTheme: (theme: Theme) => {
        set({ theme })
        applyTheme(theme)
      },
    }),
    {
      name: 'admin-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        admin: state.admin,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false
          applyTheme(state.theme)
        }
      },
    }
  )
)

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useAdminStore.getState()
    if (theme === 'system') {
      applyTheme('system')
    }
  })
}
