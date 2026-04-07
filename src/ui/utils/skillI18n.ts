import type { TFunction } from 'i18next';

/**
 * 获取 skill 的本地化显示名称
 * 优先使用 i18n 翻译，无翻译时回退到原始 name
 */
export function getSkillDisplayName(skillName: string, t: TFunction): string {
  const key = `skills.presets.${skillName}.displayName`;
  const translated = t(key, { defaultValue: '' });
  return translated || skillName;
}

/**
 * 获取 skill 的本地化描述
 * 优先使用 i18n 翻译，无翻译时回退到原始 description
 */
export function getSkillDescription(
  skillName: string,
  fallback: string,
  t: TFunction
): string {
  const key = `skills.presets.${skillName}.description`;
  const translated = t(key, { defaultValue: '' });
  return translated || fallback;
}
