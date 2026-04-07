import { create } from 'zustand';

/**
 * 技能类别
 */
export type SkillCategory =
  | 'general'
  | 'development'
  | 'writing'
  | 'analysis'
  | 'automation'
  | 'communication'
  | 'design'
  | 'data'
  | 'devops'
  | 'other';

/**
 * 技能来源
 */
export type SkillSource = 'builtin' | 'custom' | 'imported';

/**
 * 技能接口（前端使用）
 */
export interface Skill {
  /** 唯一标识 */
  id: string;
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 详细说明 */
  longDescription?: string;
  /** 图标名称 */
  icon?: string;
  /** 类别 */
  category: SkillCategory;
  /** 来源 */
  source: SkillSource;
  /** 是否启用 */
  enabled: boolean;
  /** 是否启用（后端字段兼容） */
  isEnabled?: boolean;
  /** 技能内容/提示词 */
  content: string;
  /** 作者 */
  author?: string;
  /** 版本 */
  version?: string;
  /** 标签 */
  tags?: string[];
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 创建技能的数据
 */
export interface CreateSkillData {
  name: string;
  description: string;
  longDescription?: string;
  icon: string;
  category: SkillCategory;
  content: string;
  tags?: string[];
}

/**
 * 更新技能的数据
 */
export interface UpdateSkillData {
  name?: string;
  description?: string;
  longDescription?: string;
  icon?: string;
  category?: SkillCategory;
  content?: string;
  tags?: string[];
  enabled?: boolean;
}

/**
 * 技能 Store 状态接口
 */
interface SkillState {
  /** 技能列表 */
  skills: Skill[];
  /** 加载状态 */
  loading: boolean;
  /** 保存中状态 */
  saving: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前选中的技能 ID */
  selectedSkillId: string | null;
  /** 搜索关键词 */
  searchQuery: string;
  /** 筛选类别 */
  filterCategory: SkillCategory | '';
  /** 筛选来源 */
  filterSource: SkillSource | '';

  /** 获取所有技能 */
  fetchSkills: () => Promise<void>;
  /** 刷新技能列表（同步文件系统中的新 skill） */
  refreshSkills: () => Promise<{ synced: number }>;
  /** 切换技能启用状态 */
  toggleSkill: (id: string) => Promise<void>;
  /** 创建新技能 */
  createSkill: (data: CreateSkillData) => Promise<void>;
  /** 更新技能 */
  updateSkill: (id: string, data: UpdateSkillData) => Promise<void>;
  /** 删除技能 */
  deleteSkill: (id: string) => Promise<void>;
  /** 设置选中的技能 */
  setSelectedSkill: (id: string | null) => void;
  /** 设置搜索关键词 */
  setSearchQuery: (query: string) => void;
  /** 设置筛选类别 */
  setFilterCategory: (category: SkillCategory | '') => void;
  /** 设置筛选来源 */
  setFilterSource: (source: SkillSource | '') => void;
  /** 清除错误 */
  clearError: () => void;
  /** 获取筛选后的技能列表 */
  getFilteredSkills: () => Skill[];
}

/**
 * 检查是否在 Electron 环境中
 */
const isElectron = typeof window !== 'undefined' && window.electron !== undefined;

/**
 * API 响应类型
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 调用 IPC 方法
 */
async function invokeIPC<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!isElectron) {
    throw new Error('Not running in Electron environment');
  }

  // 使用白名单 skill API 而非通用 invoke
  const skillApi = (window as any).electron?.skill;
  if (!skillApi) {
    throw new Error('Skill API not available');
  }

  // 从 channel 提取方法名（如 "skill:getAll" -> "getAll"）
  const method = channel.replace('skill:', '');
  if (typeof skillApi[method] !== 'function') {
    throw new Error(`Unknown skill method: ${method}`);
  }

  const response = await skillApi[method](...args) as ApiResponse<T>;

  if (!response.success || response.error) {
    throw new Error(response.error || 'Unknown error');
  }

  return response.data as T;
}

/**
 * 技能管理 Store
 */
export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  loading: false,
  saving: false,
  error: null,
  selectedSkillId: null,
  searchQuery: '',
  filterCategory: '',
  filterSource: '',

  fetchSkills: async () => {
    set({ loading: true, error: null });
    try {
      const skills = await invokeIPC<Skill[]>('skill:getAll');

      // 转换后端类型到前端类型
      const mappedSkills = skills.map(skill => ({
        ...skill,
        enabled: skill.isEnabled ?? skill.enabled ?? true,
        // 如果后端没有 longDescription，使用 description
        longDescription: skill.longDescription ?? skill.description,
      }));

      set({ skills: mappedSkills, loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载技能失败';
      set({ error: errorMessage, loading: false });
    }
  },

  refreshSkills: async () => {
    set({ loading: true, error: null });
    try {
      const skills = await invokeIPC<Skill[]>('skill:refresh');

      // 转换后端类型到前端类型
      const mappedSkills = skills.map(skill => ({
        ...skill,
        enabled: skill.isEnabled ?? skill.enabled ?? true,
        longDescription: skill.longDescription ?? skill.description,
      }));

      const previousCount = get().skills.length;
      set({ skills: mappedSkills, loading: false });

      return { synced: mappedSkills.length - previousCount };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '刷新技能失败';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },

  toggleSkill: async (id: string) => {
    const { skills } = get();
    const skill = skills.find(s => s.id === id);

    if (!skill) {
      set({ error: '技能不存在' });
      return;
    }

    set({ saving: true, error: null });
    try {
      const newEnabled = await invokeIPC<boolean>('skill:toggle', id);

      const updatedSkills = skills.map(s =>
        s.id === id
          ? { ...s, enabled: newEnabled, updatedAt: Date.now() }
          : s
      );

      set({ skills: updatedSkills, saving: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '切换状态失败';
      set({ error: errorMessage, saving: false });
    }
  },

  createSkill: async (data: CreateSkillData) => {
    const { skills } = get();

    set({ saving: true, error: null });
    try {
      // 转换前端类型到后端类型
      const input = {
        name: data.name,
        description: data.description,
        content: data.content,
        category: data.category,
        icon: data.icon,
      };

      const created = await invokeIPC<Skill>('skill:create', input);

      // 转换为前端类型
      const newSkill: Skill = {
        ...created,
        enabled: created.isEnabled ?? created.enabled ?? true,
        longDescription: data.longDescription || data.description,
        tags: data.tags || [],
        author: '自定义',
        version: '1.0.0',
      };

      const updatedSkills = [...skills, newSkill];
      set({ skills: updatedSkills, saving: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建失败';
      set({ error: errorMessage, saving: false });
    }
  },

  updateSkill: async (id: string, data: UpdateSkillData) => {
    const { skills } = get();
    const skill = skills.find(s => s.id === id);

    if (!skill) {
      set({ error: '技能不存在' });
      return;
    }

    if (skill.source !== 'custom') {
      set({ error: '只能编辑自定义技能' });
      return;
    }

    set({ saving: true, error: null });
    try {
      // 转换前端类型到后端类型
      const input: Record<string, unknown> = {};
      if (data.name !== undefined) input.name = data.name;
      if (data.description !== undefined) input.description = data.description;
      if (data.content !== undefined) input.content = data.content;
      if (data.category !== undefined) input.category = data.category;
      if (data.icon !== undefined) input.icon = data.icon;
      if (data.enabled !== undefined) input.isEnabled = data.enabled;

      const updated = await invokeIPC<Skill>('skill:update', id, input);

      const updatedSkills = skills.map(s =>
        s.id === id
          ? {
              ...s,
              ...data,
              enabled: updated.isEnabled ?? updated.enabled ?? s.enabled,
              updatedAt: updated.updatedAt,
            }
          : s
      );

      set({ skills: updatedSkills, saving: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '更新失败';
      set({ error: errorMessage, saving: false });
    }
  },

  deleteSkill: async (id: string) => {
    const { skills } = get();
    const skill = skills.find(s => s.id === id);

    if (!skill) {
      set({ error: '技能不存在' });
      return;
    }

    if (skill.source !== 'custom') {
      set({ error: '只能删除自定义技能' });
      return;
    }

    set({ saving: true, error: null });
    try {
      await invokeIPC<void>('skill:delete', id);

      const updatedSkills = skills.filter(s => s.id !== id);

      set({
        skills: updatedSkills,
        saving: false,
        selectedSkillId: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '删除失败';
      set({ error: errorMessage, saving: false });
    }
  },

  setSelectedSkill: (id: string | null) => {
    set({ selectedSkillId: id });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setFilterCategory: (category: SkillCategory | '') => {
    set({ filterCategory: category });
  },

  setFilterSource: (source: SkillSource | '') => {
    set({ filterSource: source });
  },

  clearError: () => {
    set({ error: null });
  },

  getFilteredSkills: () => {
    const { skills, searchQuery, filterCategory, filterSource } = get();

    return skills.filter(skill => {
      // 搜索筛选
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query) ||
          (skill.tags?.some(tag => tag.toLowerCase().includes(query)) ?? false);
        if (!matchesSearch) return false;
      }

      // 类别筛选
      if (filterCategory && skill.category !== filterCategory) {
        return false;
      }

      // 来源筛选
      if (filterSource && skill.source !== filterSource) {
        return false;
      }

      return true;
    });
  },
}));

/**
 * 获取类别标签
 */
export function getCategoryLabel(category: SkillCategory, t?: (key: string) => string): string {
  const labels: Record<SkillCategory, string> = {
    general: '通用',
    development: '开发',
    writing: '写作',
    analysis: '分析',
    automation: '自动化',
    communication: '交流',
    design: '设计',
    data: '数据',
    devops: 'DevOps',
    other: '其他',
  };

  if (t) {
    const key = `skill.categories.${category}`;
    const translated = t(key);
    if (translated && translated !== key) {
      return translated;
    }
  }

  return labels[category];
}

/**
 * 获取来源标签
 */
export function getSourceLabel(source: SkillSource, t?: (key: string) => string): string {
  const labels: Record<SkillSource, string> = {
    builtin: '内置',
    custom: '自定义',
    imported: '导入',
  };

  if (t) {
    const key = `skill.sources.${source}`;
    const translated = t(key);
    if (translated && translated !== key) {
      return translated;
    }
  }

  return labels[source];
}

/**
 * 获取来源颜色
 */
export function getSourceColor(source: SkillSource): string {
  const colors: Record<SkillSource, string> = {
    builtin: 'text-accent',
    custom: 'text-warning',
    imported: 'text-success',
  };
  return colors[source];
}

/**
 * 获取类别图标名
 */
export function getCategoryIcon(category: SkillCategory): string {
  const icons: Record<SkillCategory, string> = {
    general: 'zap',
    development: 'code',
    writing: 'pen-tool',
    analysis: 'bar-chart-2',
    automation: 'cpu',
    communication: 'message-square',
    design: 'palette',
    data: 'database',
    devops: 'server',
    other: 'box',
  };
  return icons[category];
}

/**
 * 获取所有类别选项（支持多语言）
 */
export function getCategoryOptions(t?: (key: string) => string): { value: SkillCategory; label: string }[] {
  const categories: SkillCategory[] = ['general', 'development', 'writing', 'analysis', 'automation', 'communication', 'design', 'data', 'devops', 'other'];
  return categories.map(category => ({
    value: category,
    label: getCategoryLabel(category, t),
  }));
}

/**
 * 获取所有来源选项（支持多语言）
 */
export function getSourceOptions(t?: (key: string) => string): { value: SkillSource; label: string }[] {
  const sources: SkillSource[] = ['builtin', 'custom', 'imported'];
  return sources.map(source => ({
    value: source,
    label: getSourceLabel(source, t),
  }));
}

/**
 * 所有类别选项（已废弃，请使用 getCategoryOptions）
 * @deprecated
 */
export const categoryOptions: { value: SkillCategory; label: string }[] = [
  { value: 'general', label: '通用' },
  { value: 'development', label: '开发' },
  { value: 'writing', label: '写作' },
  { value: 'analysis', label: '分析' },
  { value: 'automation', label: '自动化' },
  { value: 'communication', label: '交流' },
  { value: 'design', label: '设计' },
  { value: 'data', label: '数据' },
  { value: 'devops', label: 'DevOps' },
  { value: 'other', label: '其他' },
];

/**
 * 所有来源选项（已废弃，请使用 getSourceOptions）
 * @deprecated
 */
export const sourceOptions: { value: SkillSource; label: string }[] = [
  { value: 'builtin', label: '内置' },
  { value: 'custom', label: '自定义' },
  { value: 'imported', label: '导入' },
];

/**
 * 可用的图标列表
 */
export const availableIcons = [
  'code', 'file-text', 'message-circle', 'zap', 'refresh-cw',
  'check-square', 'bug', 'repeat', 'pen-tool', 'bar-chart-2',
  'cpu', 'palette', 'box', 'terminal', 'database', 'globe',
  'lock', 'settings', 'star', 'heart', 'bookmark', 'folder',
];
