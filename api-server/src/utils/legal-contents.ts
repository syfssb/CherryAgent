/**
 * 法律文档内容查询辅助函数
 *
 * 从 legal_contents 表查询隐私政策、服务条款、关于我们等法律文档
 * 支持多语言（i18n）和兼容性回退到 system_configs 表
 */

import { pool } from '../db/index.js';
import { getSystemConfig } from '../services/config.js';

/**
 * 法律文档类型
 */
export type LegalContentType = 'privacy_policy' | 'terms_of_service' | 'about_us';

/**
 * 获取法律文档内容
 *
 * @param type - 文档类型：privacy_policy, terms_of_service, about_us
 * @param lang - 语言代码，默认 'en'
 * @returns 文档内容（Markdown 格式）
 *
 * @example
 * ```typescript
 * // 获取英文隐私政策
 * const policy = await getLegalContent('privacy_policy', 'en');
 *
 * // 获取中文服务条款
 * const terms = await getLegalContent('terms_of_service', 'zh');
 * ```
 */
export async function getLegalContent(
  type: LegalContentType,
  lang: string = 'en'
): Promise<string> {
  try {
    // 1. 从 legal_contents 表查询
    const result = await pool.query(
      `SELECT content, i18n FROM legal_contents WHERE type = $1 AND is_active = true LIMIT 1`,
      [type]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0] as { content: string; i18n: Record<string, { content?: string }> | null };

      // 如果请求英文，直接返回 content 字段
      if (lang === 'en') {
        return row.content;
      }

      // 尝试从 i18n 字段获取指定语言的内容
      if (row.i18n && typeof row.i18n === 'object' && row.i18n[lang]?.content) {
        return row.i18n[lang].content;
      }

      // 回退到英文内容
      return row.content;
    }

    // 2. 兼容性回退：从 system_configs 表读取
    const fallbackContent = await getSystemConfig(type, '');
    return fallbackContent;

  } catch (error) {
    console.error(`[getLegalContent] 查询失败:`, {
      type,
      lang,
      error: error instanceof Error ? error.message : String(error),
    });

    // 发生错误时，尝试从 system_configs 读取
    try {
      return await getSystemConfig(type, '');
    } catch (fallbackError) {
      console.error(`[getLegalContent] 兼容性回退也失败:`, fallbackError);
      return '';
    }
  }
}

/**
 * 批量获取多个法律文档内容
 *
 * @param types - 文档类型数组
 * @param lang - 语言代码，默认 'en'
 * @returns Map<type, content>
 */
export async function getLegalContents(
  types: LegalContentType[],
  lang: string = 'en'
): Promise<Map<LegalContentType, string>> {
  const result = new Map<LegalContentType, string>();

  // 并行查询所有文档
  await Promise.all(
    types.map(async (type) => {
      const content = await getLegalContent(type, lang);
      result.set(type, content);
    })
  );

  return result;
}
