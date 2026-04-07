/**
 * 国际化键验证测试
 * 确保所有使用的翻译键在两种语言的配置文件中都存在
 */

import { describe, it, expect } from 'vitest';
import zhLocale from '../locales/zh.json';
import enLocale from '../locales/en.json';

/**
 * 获取对象的所有键路径
 * @param obj - 对象
 * @param prefix - 前缀
 * @returns 键路径数组
 */
function getKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];

  for (const key in obj) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      keys.push(...getKeys(obj[key], path));
    } else {
      keys.push(path);
    }
  }

  return keys;
}

describe('国际化配置验证', () => {
  it('中文配置包含所有必需的键', () => {
    const zhKeys = getKeys(zhLocale);

    // 验证关键键存在
    const requiredKeys = [
      'app.name',
      'chat.inputPlaceholder',
      'chat.copy',
      'chat.copied',
      'chat.regenerate',
      'chat.edit',
      'chat.delete',
      'chat.retry',
      'chat.thinking',
      'chat.userLabel',
      'chat.assistantLabel',
      'chat.thinkingProcess',
      'chat.errorRetry',
      'time.justNow',
      'time.today',
      'time.yesterday',
      'time.minutesAgo',
      'time.hoursAgo',
      'time.daysAgo',
      'common.ok',
      'common.cancel',
      'error.unknown',
    ];

    requiredKeys.forEach((key) => {
      expect(zhKeys).toContain(key);
    });
  });

  it('英文配置包含所有必需的键', () => {
    const enKeys = getKeys(enLocale);

    // 验证关键键存在
    const requiredKeys = [
      'app.name',
      'chat.inputPlaceholder',
      'chat.copy',
      'chat.copied',
      'chat.regenerate',
      'chat.edit',
      'chat.delete',
      'chat.retry',
      'chat.thinking',
      'chat.userLabel',
      'chat.assistantLabel',
      'chat.thinkingProcess',
      'chat.errorRetry',
      'time.justNow',
      'time.today',
      'time.yesterday',
      'time.minutesAgo',
      'time.hoursAgo',
      'time.daysAgo',
      'common.ok',
      'common.cancel',
      'error.unknown',
    ];

    requiredKeys.forEach((key) => {
      expect(enKeys).toContain(key);
    });
  });

  it('中英文配置的键结构应该一致', () => {
    const zhKeys = getKeys(zhLocale).sort();
    const enKeys = getKeys(enLocale).sort();

    // 找出只在中文中存在的键
    const onlyInZh = zhKeys.filter((key) => !enKeys.includes(key));
    // 找出只在英文中存在的键
    const onlyInEn = enKeys.filter((key) => !zhKeys.includes(key));

    if (onlyInZh.length > 0) {
      console.warn('只在中文配置中存在的键:', onlyInZh);
    }

    if (onlyInEn.length > 0) {
      console.warn('只在英文配置中存在的键:', onlyInEn);
    }

    // 两者应该完全相同
    expect(onlyInZh.length).toBe(0);
    expect(onlyInEn.length).toBe(0);
  });

  it('对话相关的所有文案都应该有翻译', () => {
    const zhKeys = getKeys(zhLocale);
    const enKeys = getKeys(enLocale);

    const chatKeys = zhKeys.filter((key) => key.startsWith('chat.'));

    expect(chatKeys.length).toBeGreaterThan(0);

    // 所有 chat 开头的键在两种语言中都应该存在
    chatKeys.forEach((key) => {
      expect(enKeys).toContain(key);
    });
  });

  it('时间格式化相关的所有文案都应该有翻译', () => {
    const zhKeys = getKeys(zhLocale);
    const enKeys = getKeys(enLocale);

    const timeKeys = zhKeys.filter((key) => key.startsWith('time.'));

    expect(timeKeys.length).toBeGreaterThan(0);

    // 所有 time 开头的键在两种语言中都应该存在
    timeKeys.forEach((key) => {
      expect(enKeys).toContain(key);
    });
  });

  it('所有翻译值都不应该为空', () => {
    function checkEmpty(obj: any, path = ''): string[] {
      const empty: string[] = [];

      for (const key in obj) {
        const currentPath = path ? `${path}.${key}` : key;

        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          empty.push(...checkEmpty(obj[key], currentPath));
        } else if (!obj[key] || obj[key].trim() === '') {
          empty.push(currentPath);
        }
      }

      return empty;
    }

    const emptyZh = checkEmpty(zhLocale);
    const emptyEn = checkEmpty(enLocale);

    if (emptyZh.length > 0) {
      console.warn('中文配置中的空值:', emptyZh);
    }

    if (emptyEn.length > 0) {
      console.warn('英文配置中的空值:', emptyEn);
    }

    expect(emptyZh.length).toBe(0);
    expect(emptyEn.length).toBe(0);
  });
});
