import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { configApi, type Announcement, type PublicModel, type ModelsResponse } from '@/ui/lib/config-api';

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * 远程配置状态
 */
interface RemoteConfigState {
  privacyPolicy: string;
  termsOfService: string;
  aboutUs: string;
}

/**
 * 远程配置 hook 返回值
 */
interface UseRemoteConfigReturn {
  config: RemoteConfigState;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getConfig: (key: string) => Promise<string>;
}

/**
 * 配置缓存（模块级别，跨组件共享）
 */
const configCache = new Map<string, CacheEntry<string>>();

/**
 * 默认缓存时间：10 分钟
 */
const DEFAULT_CACHE_TTL = 10 * 60 * 1000;

/**
 * 检查缓存是否有效
 */
function isCacheValid<T>(entry: CacheEntry<T> | undefined, ttl: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttl;
}

/**
 * 远程配置 hook
 * 从 /api/configs 获取系统配置，带缓存和错误处理
 *
 * @param options - 配置选项
 * @param options.cacheTTL - 缓存有效期（毫秒），默认 10 分钟
 * @param options.autoFetch - 是否自动获取，默认 true
 */
export function useRemoteConfig(options?: {
  cacheTTL?: number;
  autoFetch?: boolean;
}): UseRemoteConfigReturn {
  const { cacheTTL = DEFAULT_CACHE_TTL, autoFetch = true } = options ?? {};
  const { i18n } = useTranslation();

  const [config, setConfig] = useState<RemoteConfigState>({
    privacyPolicy: '',
    termsOfService: '',
    aboutUs: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  /**
   * 获取单个配置值（带缓存）
   */
  const getConfig = useCallback(async (key: string): Promise<string> => {
    const cached = configCache.get(key);
    if (isCacheValid(cached, cacheTTL)) {
      return cached!.data;
    }

    const value = await configApi.getConfig(key, i18n.language);
    configCache.set(key, { data: value, timestamp: Date.now() });
    return value;
  }, [cacheTTL, i18n.language]);

  /**
   * 批量获取所有配置
   */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [privacyPolicy, termsOfService, aboutUs] = await Promise.all([
        getConfig('privacy-policy'),
        getConfig('terms-of-service'),
        getConfig('about-us'),
      ]);

      setConfig({ privacyPolicy, termsOfService, aboutUs });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch configs';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [getConfig]);

  /**
   * 刷新配置（清除缓存后重新获取）
   */
  const refresh = useCallback(async () => {
    configCache.clear();
    await fetchAll();
  }, [fetchAll]);

  /**
   * 自动获取
   */
  useEffect(() => {
    if (autoFetch && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchAll();
    }
  }, [autoFetch, fetchAll]);

  return { config, loading, error, refresh, getConfig };
}

// ==========================================
// 公告 hook
// ==========================================

/**
 * 公告 hook 返回值
 */
interface UseAnnouncementsReturn {
  announcements: Announcement[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  dismissAnnouncement: (id: string) => void;
  dismissedIds: Set<string>;
  /** 已读公告 ID 集合（打开面板后标记，不影响面板中的显示） */
  readIds: Set<string>;
  /** 将所有当前公告标记为已读 */
  markAllAsRead: () => void;
}

/**
 * 公告缓存
 */
let announcementsCache: CacheEntry<Announcement[]> | undefined;

/**
 * 从 localStorage 读取已关闭的公告 ID
 */
function getDismissedIds(): Set<string> {
  try {
    const stored = localStorage.getItem('dismissed-announcements');
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      return new Set(parsed);
    }
  } catch {
    // ignore
  }
  return new Set();
}

/**
 * 保存已关闭的公告 ID 到 localStorage
 */
function saveDismissedIds(ids: Set<string>): void {
  try {
    localStorage.setItem('dismissed-announcements', JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

/**
 * 从 localStorage 读取已读的公告 ID
 */
function getReadIds(): Set<string> {
  try {
    const stored = localStorage.getItem('read-announcements');
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      return new Set(parsed);
    }
  } catch {
    // ignore
  }
  return new Set();
}

/**
 * 保存已读的公告 ID 到 localStorage
 */
function saveReadIds(ids: Set<string>): void {
  try {
    localStorage.setItem('read-announcements', JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

/**
 * 公告默认缓存时间：2 分钟（比轮询间隔略短，确保轮询触发时缓存已过期）
 */
const ANNOUNCEMENT_CACHE_TTL = 2 * 60 * 1000;

/**
 * 前端自动轮询间隔：3 分钟
 * 作为 Electron content-poller 的兜底，也覆盖纯 Web 环境
 */
const ANNOUNCEMENT_POLL_INTERVAL = 3 * 60 * 1000;

/**
 * 公告 hook
 * 从 /api/announcements 获取公告列表
 *
 * 更新机制（双保险）：
 * 1. Electron 环境：主进程 content-poller 每 3 分钟检查版本变化，
 *    检测到更新后通过 IPC 通知渲染进程清缓存并重新 fetch
 * 2. 所有环境（含纯 Web）：前端自带 3 分钟定时轮询，
 *    缓存 TTL 为 2 分钟，确保轮询时一定会发起真实请求
 */
export function useAnnouncements(options?: {
  cacheTTL?: number;
  pollInterval?: number;
}): UseAnnouncementsReturn {
  const { cacheTTL = ANNOUNCEMENT_CACHE_TTL, pollInterval = ANNOUNCEMENT_POLL_INTERVAL } = options ?? {};
  const { i18n } = useTranslation();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(getDismissedIds);
  const [readIds, setReadIds] = useState<Set<string>>(getReadIds);
  const fetchedRef = useRef(false);
  // 记录上次请求使用的语言，用于检测语言变化
  const lastLangRef = useRef<string>(i18n.language);

  const fetchAnnouncements = useCallback(async () => {
    if (isCacheValid(announcementsCache, cacheTTL)) {
      setAnnouncements(announcementsCache!.data);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await configApi.getAnnouncements();
      announcementsCache = { data, timestamp: Date.now() };
      setAnnouncements(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch announcements';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [cacheTTL]);

  const refresh = useCallback(async () => {
    announcementsCache = undefined;
    await fetchAnnouncements();
  }, [fetchAnnouncements]);

  const dismissAnnouncement = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissedIds(next);
      return next;
    });
  }, []);

  /**
   * 将所有当前公告标记为已读
   * 打开通知面板时调用，角标数字清零，但面板中的公告不会消失
   */
  const markAllAsRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const a of announcements) {
        if (!next.has(a.id)) {
          next.add(a.id);
          changed = true;
        }
      }
      if (changed) {
        saveReadIds(next);
        return next;
      }
      return prev;
    });
  }, [announcements]);

  // 初始 fetch
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchAnnouncements();
    }
  }, [fetchAnnouncements]);

  // 语言切换时清缓存并重新请求，确保公告内容跟随语言变化
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      if (lng !== lastLangRef.current) {
        lastLangRef.current = lng;
        announcementsCache = undefined;
        fetchAnnouncements();
      }
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n, fetchAnnouncements]);

  // 监听主进程内容轮询器的更新通知（Electron 环境）
  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.on) return;

    const cleanup = electron.on("content:announcements-updated", () => {
      announcementsCache = undefined;
      fetchAnnouncements();
    });

    return cleanup;
  }, [fetchAnnouncements]);

  // 前端定时轮询兜底（所有环境均生效，包括纯 Web）
  // 缓存 TTL < 轮询间隔，所以每次轮询都会发起真实请求
  useEffect(() => {
    const timer = setInterval(() => {
      // 清除缓存后重新 fetch，确保拿到最新数据
      announcementsCache = undefined;
      fetchAnnouncements();
    }, pollInterval);

    return () => clearInterval(timer);
  }, [fetchAnnouncements, pollInterval]);

  return { announcements, loading, error, refresh, dismissAnnouncement, dismissedIds, readIds, markAllAsRead };
}

// ==========================================
// 模型列表 hook
// ==========================================

/**
 * 模型列表 hook 返回值
 */
interface UseModelsReturn {
  models: PublicModel[];
  unit: string;
  note: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getModelById: (id: string) => PublicModel | undefined;
  getModelColor: (modelId: string) => string;
}

/**
 * 模型缓存
 */
let modelsCache: CacheEntry<ModelsResponse> | undefined;

/**
 * 根据 provider 获取模型颜色（动态，不硬编码模型名）
 */
function getModelColorByProvider(provider: string): string {
  const providerLower = provider.toLowerCase();

  if (providerLower.includes('anthropic')) {
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
  }
  if (providerLower.includes('openai')) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  }
  if (providerLower.includes('google')) {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  }
  if (providerLower.includes('deepseek')) {
    return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400';
  }
  if (providerLower.includes('meta') || providerLower.includes('llama')) {
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
  }
  if (providerLower.includes('mistral')) {
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  }

  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
}

/**
 * 模型列表 hook
 * 从 /api/models 获取可用模型列表
 */
export function useModels(options?: {
  cacheTTL?: number;
}): UseModelsReturn {
  const { cacheTTL = DEFAULT_CACHE_TTL } = options ?? {};

  const [models, setModels] = useState<PublicModel[]>([]);
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchModels = useCallback(async () => {
    if (isCacheValid(modelsCache, cacheTTL)) {
      const cached = modelsCache!.data;
      setModels(cached.models);
      setUnit(cached.unit);
      setNote(cached.note);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await configApi.getModels();
      if (data) {
        modelsCache = { data, timestamp: Date.now() };
        setModels(data.models);
        setUnit(data.unit);
        setNote(data.note);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch models';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [cacheTTL]);

  const refresh = useCallback(async () => {
    modelsCache = undefined;
    await fetchModels();
  }, [fetchModels]);

  const getModelById = useCallback((id: string): PublicModel | undefined => {
    return models.find((m) => m.id === id);
  }, [models]);

  /**
   * 获取模型颜色 - 优先使用 API 返回的 provider，回退到模型名推断
   */
  const getModelColor = useCallback((modelId: string): string => {
    const model = models.find((m) => m.id === modelId);
    if (model) {
      return getModelColorByProvider(model.provider);
    }
    // 回退：从模型 ID 推断 provider
    const idLower = modelId.toLowerCase();
    if (idLower.includes('claude')) return getModelColorByProvider('anthropic');
    if (idLower.includes('gpt')) return getModelColorByProvider('openai');
    if (idLower.includes('gemini')) return getModelColorByProvider('google');
    if (idLower.includes('deepseek')) return getModelColorByProvider('deepseek');
    if (idLower.includes('llama')) return getModelColorByProvider('meta');
    if (idLower.includes('mistral')) return getModelColorByProvider('mistral');

    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  }, [models]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchModels();
    }
  }, [fetchModels]);

  return { models, unit, note, loading, error, refresh, getModelById, getModelColor };
}
