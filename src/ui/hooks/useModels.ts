import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { apiClient } from '@/ui/lib/api-client';

/**
 * 模型价格信息
 */
export interface ModelPricing {
  inputCreditsPerMtok: number;
  outputCreditsPerMtok: number;
  cacheReadCreditsPerMtok: number;
  cacheWriteCreditsPerMtok: number;
}

/**
 * 模型限制信息
 */
export interface ModelLimits {
  maxTokens: number;
  maxContextLength: number;
}

/**
 * 模型信息
 */
export interface Model {
  id: string;
  displayName: string;
  provider: string;
  pricing: ModelPricing;
  limits: ModelLimits;
  description: string | null;
  features: string[];
  useCases: string[];
  tags: string[];
}

/**
 * API 返回的模型列表响应
 */
interface ModelsResponse {
  models: Model[];
  unit: string;
  note: string;
}

const STORAGE_KEY = 'selected-model-id';

function getStoredModelId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeModelId(modelId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, modelId);
  } catch {
    // 忽略存储错误
  }
}

interface ModelStore {
  models: Model[];
  loading: boolean;
  error: string | null;
  selectedModelId: string | null;
  unit: string;
  note: string;
  fetchModels: () => Promise<void>;
  selectModel: (modelId: string) => void;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  loading: false,
  error: null,
  selectedModelId: getStoredModelId(),
  unit: '',
  note: '',

  fetchModels: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });

    try {
      const response = await apiClient.get<ModelsResponse>('/models', {
        requireAuth: false,
      });

      if (response.success && response.data) {
        const fetchedModels = (response.data.models || []).map((model) => ({
          ...model,
          description: typeof model.description === 'string' ? model.description : null,
          features: Array.isArray(model.features)
            ? model.features.filter((item): item is string => typeof item === 'string')
            : [],
          useCases: Array.isArray(model.useCases)
            ? model.useCases.filter((item): item is string => typeof item === 'string')
            : [],
          tags: Array.isArray(model.tags)
            ? model.tags.filter((item): item is string => typeof item === 'string')
            : [],
        }));
        const storedId = getStoredModelId();
        const isStoredValid = fetchedModels.some((m) => m.id === storedId);

        let selectedModelId = get().selectedModelId;
        if (!isStoredValid && fetchedModels.length > 0) {
          selectedModelId = fetchedModels[0].id;
          storeModelId(selectedModelId);
        }

        set({
          models: fetchedModels,
          unit: response.data.unit || '',
          note: response.data.note || '',
          selectedModelId,
          loading: false,
        });
      } else {
        set({ error: response.error || '获取模型列表失败', loading: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取模型列表失败';
      set({ error: message, loading: false });
    }
  },

  selectModel: (modelId: string) => {
    set({ selectedModelId: modelId });
    storeModelId(modelId);
  },
}));

/**
 * 兼容包装：保持原有 useModels() 接口
 */
export function useModels() {
  const store = useModelStore();
  const {
    models,
    loading,
    error,
    selectedModelId,
    selectModel,
    fetchModels,
    unit,
    note,
  } = store;
  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null;
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!fetchedRef.current && models.length === 0 && !loading) {
      fetchedRef.current = true;
      fetchModels();
    }
  }, [fetchModels, loading, models.length]);

  return {
    models,
    loading,
    error,
    selectedModelId,
    selectedModel,
    selectModel,
    refresh: fetchModels,
    unit,
    note,
  };
}
