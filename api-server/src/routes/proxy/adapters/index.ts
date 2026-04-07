/**
 * 适配器注册入口
 *
 * 导入所有内置适配器并注册到全局 ProviderRegistry。
 * 新增 provider 只需在此文件添加一行 register 即可。
 */

import { providerRegistry } from '../registry.js';
import { anthropicAdapter } from './anthropic.js';
import { openaiCompatAdapter } from './openai-compat.js';

// 注册内置适配器
providerRegistry.register(anthropicAdapter);
providerRegistry.register(openaiCompatAdapter);

export { anthropicAdapter } from './anthropic.js';
export { openaiCompatAdapter } from './openai-compat.js';
