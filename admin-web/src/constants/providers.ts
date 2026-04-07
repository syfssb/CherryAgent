/**
 * Provider 共享常量
 * 统一管理所有 provider 选项，供渠道、模型、用量等页面复用
 */

export type ChannelProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'deepseek'
  | 'moonshot'
  | 'zhipu'
  | 'baidu'
  | 'alibaba'
  | 'custom'

/**
 * Provider 选项列表（用于表单下拉）
 */
export const PROVIDER_OPTIONS: Array<{ value: ChannelProvider; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'azure', label: 'Azure' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'moonshot', label: 'Moonshot' },
  { value: 'zhipu', label: '智谱 AI' },
  { value: 'baidu', label: '百度文心' },
  { value: 'alibaba', label: '阿里通义' },
  { value: 'custom', label: '自定义' },
]

/**
 * Provider 筛选选项（带"全部"选项，用于列表筛选）
 */
export const PROVIDER_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '全部提供商' },
  ...PROVIDER_OPTIONS,
]

/**
 * 根据 provider value 获取显示名称
 */
export function getProviderLabel(provider: string): string {
  return PROVIDER_OPTIONS.find((p) => p.value === provider)?.label ?? provider
}

// ============================================================
// 动态 Provider Hook（优先从 API 获取，fallback 到静态常量）
// ============================================================

import { useState, useEffect } from 'react'
import { fetchProviders } from '@/services/providers'

export function useProviders() {
  const [providers, setProviders] = useState(PROVIDER_OPTIONS)
  const [filterOptions, setFilterOptions] = useState(PROVIDER_FILTER_OPTIONS)

  useEffect(() => {
    fetchProviders()
      .then(list => {
        if (list.length === 0) return
        const options = list.map(p => ({
          value: p.id as ChannelProvider,
          label: p.label,
        }))
        setProviders(options)
        setFilterOptions([{ value: '' as ChannelProvider, label: '全部提供商' }, ...options])
      })
      .catch(() => {
        // fallback to static constants, already set as default
      })
  }, [])

  return { providers, filterOptions, getProviderLabel }
}
