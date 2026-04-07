import { Router } from 'express';
import { SUPPORTED_PROVIDERS } from '../../constants/providers.js';
import { authenticateAdmin } from '../../middleware/admin-auth.js';

export const adminProvidersRouter = Router();
adminProvidersRouter.use(authenticateAdmin);

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  azure: 'Azure',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot',
  zhipu: '智谱 AI',
  baidu: '百度文心',
  alibaba: '阿里通义',
  custom: '自定义',
};

// GET /admin/providers — 返回支持的 provider 列表
adminProvidersRouter.get('/', async (_req, res) => {
  const providers = SUPPORTED_PROVIDERS.map(id => ({
    id,
    label: PROVIDER_LABELS[id] || id,
  }));

  res.json({ success: true, data: { providers } });
});
