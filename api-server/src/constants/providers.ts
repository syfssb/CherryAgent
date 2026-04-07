/**
 * Provider 共享常量（后端唯一来源）
 * 统一管理所有 provider 标识，供路由校验、计费、渠道等模块引用
 */

export const SUPPORTED_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'azure',
  'deepseek',
  'moonshot',
  'zhipu',
  'baidu',
  'alibaba',
  'custom',
] as const;

export type ProviderType = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * 校验 provider 是否在已知列表中
 * 注意：返回 false 不代表 provider 非法，只是不在预定义列表中
 */
export function isValidProvider(provider: string): provider is ProviderType {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}
