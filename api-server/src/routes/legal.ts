/**
 * 公开 API - 法律文档路由
 *
 * 功能:
 * - GET /api/legal/:type?lang=zh|en|ja|zh-TW  - 获取指定类型的法律文档内容（不需要认证）
 *
 * 支持的 type:
 *   privacy_policy    隐私政策
 *   terms_of_service  服务条款
 *   about_us          关于我们
 *
 * 语言参数 lang 默认 zh，不支持的语言自动 fallback 到 en。
 */

import { Router, type Request, type Response } from 'express';
import { getLegalContent, type LegalContentType } from '../utils/legal-contents.js';

export const legalRouter = Router();

const VALID_TYPES: LegalContentType[] = ['privacy_policy', 'terms_of_service', 'about_us'];

// GET /api/legal/:type?lang=zh
legalRouter.get('/:type', async (req: Request, res: Response) => {
  const { type } = req.params;
  const lang = (req.query['lang'] as string | undefined) ?? 'zh';

  if (!VALID_TYPES.includes(type as LegalContentType)) {
    return res.status(400).json({
      success: false,
      error: `Invalid type "${type}". Valid types: ${VALID_TYPES.join(', ')}`,
    });
  }

  const content = await getLegalContent(type as LegalContentType, lang);

  if (!content) {
    return res.status(404).json({
      success: false,
      error: 'Content not found',
    });
  }

  return res.json({
    success: true,
    data: { type, lang, content },
  });
});
