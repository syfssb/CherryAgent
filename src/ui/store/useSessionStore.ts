import { create } from 'zustand';

/**
 * 标签类型
 */
export type Tag = {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  usageCount?: number;
};

/**
 * 存储的会话类型
 */
export type StoredSession = {
  id: string;
  title: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  cwd?: string;
  allowedTools?: string;
  activeSkillIds?: string[];
  skillMode?: 'manual' | 'auto';
  lastPrompt?: string;
  claudeSessionId?: string;
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
  isArchived: boolean;
  tags?: Tag[];
};

/**
 * IPC 响应类型
 */
type IpcResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * 会话列表选项
 */
export type SessionListOptions = {
  includeArchived?: boolean;
  tagId?: string;
  query?: string;
};

/**
 * 会话状态存储
 */
interface SessionState {
  // 状态
  sessions: StoredSession[];
  tags: Tag[];
  searchQuery: string;
  selectedTagId: string | null;
  includeArchived: boolean;
  isLoading: boolean;
  error: string | null;

  // 会话操作
  fetchSessions: (options?: SessionListOptions) => Promise<void>;
  searchSessions: (query: string) => Promise<void>;
  togglePinned: (sessionId: string) => Promise<boolean>;
  toggleArchived: (sessionId: string) => Promise<boolean>;

  // 标签操作
  fetchTags: () => Promise<void>;
  createTag: (name: string, color: string) => Promise<Tag | null>;
  updateTag: (id: string, updates: { name?: string; color?: string }) => Promise<Tag | null>;
  deleteTag: (id: string) => Promise<boolean>;

  // 会话标签操作
  addTagToSession: (sessionId: string, tagId: string) => Promise<boolean>;
  removeTagFromSession: (sessionId: string, tagId: string) => Promise<boolean>;
  getSessionTags: (sessionId: string) => Promise<Tag[]>;

  // 筛选操作
  setSearchQuery: (query: string) => void;
  setSelectedTagId: (tagId: string | null) => void;
  setIncludeArchived: (include: boolean) => void;
  clearFilters: () => void;

  // 辅助方法
  refreshData: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // 初始状态
  sessions: [],
  tags: [],
  searchQuery: '',
  selectedTagId: null,
  includeArchived: false,
  isLoading: false,
  error: null,

  // 获取会话列表
  fetchSessions: async (options?: SessionListOptions) => {
    set({ isLoading: true, error: null });
    try {
      const { searchQuery, selectedTagId, includeArchived } = get();
      const mergedOptions = {
        includeArchived: options?.includeArchived ?? includeArchived,
        tagId: options?.tagId ?? (selectedTagId ?? undefined),
        query: options?.query ?? (searchQuery || undefined)
      };

      const response = await window.electron.session.listWithOptions(mergedOptions) as IpcResponse<StoredSession[]>;
      if (response.success && response.data) {
        set({ sessions: response.data, isLoading: false });
      } else {
        set({ error: response.error || 'Failed to fetch sessions', isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch sessions',
        isLoading: false
      });
    }
  },

  // 搜索会话
  searchSessions: async (query: string) => {
    set({ searchQuery: query, isLoading: true, error: null });
    try {
      const { selectedTagId, includeArchived } = get();
      const response = await window.electron.session.search(query, {
        includeArchived,
        tagId: selectedTagId ?? undefined
      }) as IpcResponse<StoredSession[]>;
      if (response.success && response.data) {
        set({ sessions: response.data, isLoading: false });
      } else {
        set({ error: response.error || 'Failed to search sessions', isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to search sessions',
        isLoading: false
      });
    }
  },

  // 切换置顶状态
  togglePinned: async (sessionId: string) => {
    try {
      const response = await window.electron.session.togglePinned(sessionId) as IpcResponse<{ isPinned: boolean }>;
      if (response.success) {
        // 更新本地状态
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, isPinned: response.data?.isPinned ?? !s.isPinned } : s
          )
        }));
        return response.data?.isPinned ?? false;
      }
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to toggle pinned' });
      return false;
    }
  },

  // 切换归档状态
  toggleArchived: async (sessionId: string) => {
    try {
      const response = await window.electron.session.toggleArchived(sessionId) as IpcResponse<{ isArchived: boolean }>;
      if (response.success) {
        const { includeArchived } = get();
        if (!includeArchived && response.data?.isArchived) {
          // 如果不显示归档会话，且会话被归档了，从列表中移除
          set((state) => ({
            sessions: state.sessions.filter((s) => s.id !== sessionId)
          }));
        } else {
          // 更新本地状态
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId ? { ...s, isArchived: response.data?.isArchived ?? !s.isArchived } : s
            )
          }));
        }
        return response.data?.isArchived ?? false;
      }
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to toggle archived' });
      return false;
    }
  },

  // 获取所有标签
  fetchTags: async () => {
    try {
      const response = await window.electron.tags.getAll() as IpcResponse<Tag[]>;
      if (response.success && response.data) {
        set({ tags: response.data });
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch tags' });
    }
  },

  // 创建标签
  createTag: async (name: string, color: string) => {
    try {
      const response = await window.electron.tags.create(name, color) as IpcResponse<Tag>;
      if (response.success && response.data) {
        set((state) => ({ tags: [...state.tags, response.data!] }));
        return response.data;
      }
      set({ error: response.error || 'Failed to create tag' });
      return null;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to create tag' });
      return null;
    }
  },

  // 更新标签
  updateTag: async (id: string, updates: { name?: string; color?: string }) => {
    try {
      const response = await window.electron.tags.update(id, updates) as IpcResponse<Tag>;
      if (response.success && response.data) {
        set((state) => ({
          tags: state.tags.map((t) => (t.id === id ? response.data! : t))
        }));
        return response.data;
      }
      set({ error: response.error || 'Failed to update tag' });
      return null;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to update tag' });
      return null;
    }
  },

  // 删除标签
  deleteTag: async (id: string) => {
    try {
      const response = await window.electron.tags.delete(id) as IpcResponse<void>;
      if (response.success) {
        set((state) => ({
          tags: state.tags.filter((t) => t.id !== id),
          // 如果当前筛选的就是被删除的标签，清除筛选
          selectedTagId: state.selectedTagId === id ? null : state.selectedTagId
        }));
        // 刷新会话列表以更新标签显示
        get().fetchSessions();
        return true;
      }
      set({ error: response.error || 'Failed to delete tag' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete tag' });
      return false;
    }
  },

  // 为会话添加标签
  addTagToSession: async (sessionId: string, tagId: string) => {
    try {
      const response = await window.electron.session.addTag(sessionId, tagId) as IpcResponse<void>;
      if (response.success) {
        // 刷新会话列表
        get().fetchSessions();
        // 刷新标签列表以更新使用次数
        get().fetchTags();
        return true;
      }
      set({ error: response.error || 'Failed to add tag to session' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to add tag to session' });
      return false;
    }
  },

  // 从会话移除标签
  removeTagFromSession: async (sessionId: string, tagId: string) => {
    try {
      const response = await window.electron.session.removeTag(sessionId, tagId) as IpcResponse<void>;
      if (response.success) {
        // 刷新会话列表
        get().fetchSessions();
        // 刷新标签列表以更新使用次数
        get().fetchTags();
        return true;
      }
      set({ error: response.error || 'Failed to remove tag from session' });
      return false;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to remove tag from session' });
      return false;
    }
  },

  // 获取会话的标签
  getSessionTags: async (sessionId: string) => {
    try {
      const response = await window.electron.session.getTags(sessionId) as IpcResponse<Tag[]>;
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    } catch {
      return [];
    }
  },

  // 设置搜索查询
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    // 触发搜索
    if (query.trim()) {
      get().searchSessions(query);
    } else {
      get().fetchSessions();
    }
  },

  // 设置选中的标签
  setSelectedTagId: (tagId: string | null) => {
    set({ selectedTagId: tagId });
    get().fetchSessions();
  },

  // 设置是否包含归档
  setIncludeArchived: (include: boolean) => {
    set({ includeArchived: include });
    get().fetchSessions();
  },

  // 清除所有筛选条件
  clearFilters: () => {
    set({
      searchQuery: '',
      selectedTagId: null,
      includeArchived: false
    });
    get().fetchSessions();
  },

  // 刷新所有数据
  refreshData: async () => {
    await Promise.all([get().fetchSessions(), get().fetchTags()]);
  }
}));
