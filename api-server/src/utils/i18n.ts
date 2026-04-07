/**
 * i18n 辅助工具
 *
 * 从数据库行的 i18n JSONB 字段中解析本地化内容，
 * 回退到原始列（英文）作为默认值。
 */

/** 支持的语言列表 */
export const SUPPORTED_LOCALES = ['en', 'zh', 'zh-TW', 'ja'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * 从 i18n JSONB 对象中解析指定语言的字段值
 *
 * @param i18n - 数据库中的 i18n JSONB 对象，如 { "zh": { "name": "前端设计", "description": "..." } }
 * @param locale - 请求的语言代码，如 "zh"、"zh-TW"、"ja"
 * @param fields - 需要解析的字段映射，key 为 i18n 中的字段名，value 为原始列的默认值
 * @returns 解析后的字段值对象
 *
 * @example
 * ```ts
 * const row = { name: 'Frontend Design', description: '...', i18n: { zh: { name: '前端设计', description: '...' } } };
 * const localized = resolveI18n(row.i18n, 'zh', { name: row.name, description: row.description });
 * // => { name: '前端设计', description: '...' }
 * ```
 */
export function resolveI18n<T extends Record<string, string | null>>(
  i18n: Record<string, Record<string, string>> | null | undefined,
  locale: string | undefined,
  fields: T,
): T {
  // 英文或无 locale 时直接返回原始值
  if (!locale || locale === 'en' || !i18n) {
    return fields;
  }

  const translations = i18n[locale];
  if (!translations) {
    return fields;
  }

  const result = { ...fields };
  for (const key of Object.keys(fields)) {
    if (translations[key] != null && translations[key] !== '') {
      (result as Record<string, string | null>)[key] = translations[key];
    }
  }
  return result;
}

/**
 * 从请求的 query 参数中提取 locale
 */
export function getLocaleFromQuery(query: Record<string, unknown>): string | undefined {
  const lang = query.lang as string | undefined;
  if (lang && SUPPORTED_LOCALES.includes(lang as Locale)) {
    return lang;
  }
  return undefined;
}
