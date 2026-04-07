/**
 * 时间格式化工具函数
 */

/**
 * 时间间隔常量（毫秒）
 */
export const TIME_INTERVALS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000,
} as const;

/**
 * 格式化相对时间（不依赖 i18n）
 * @param timestamp - 时间戳（毫秒或 Date 对象）
 * @param locale - 语言环境，默认 'zh-CN'
 * @returns 相对时间字符串
 */
export function formatRelativeTime(
  timestamp: number | Date,
  locale: string = 'zh-CN'
): string {
  const time = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  const now = Date.now();
  const diff = now - time;
  const normalized = locale.toLowerCase();
  const isZhTW = normalized.startsWith('zh-tw');
  const isZh = normalized.startsWith('zh') && !isZhTW;
  const isJa = normalized.startsWith('ja');

  // 未来时间
  if (diff < 0) {
    if (isZh) return '即将';
    if (isZhTW) return '即將';
    if (isJa) return 'まもなく';
    return 'Soon';
  }

  // 刚刚（1分钟内）
  if (diff < TIME_INTERVALS.MINUTE) {
    if (isZh) return '刚刚';
    if (isZhTW) return '剛剛';
    if (isJa) return 'たった今';
    return 'Just now';
  }

  // 几分钟前（1小时内）
  if (diff < TIME_INTERVALS.HOUR) {
    const minutes = Math.floor(diff / TIME_INTERVALS.MINUTE);
    if (isZh) return `${minutes}分钟前`;
    if (isZhTW) return `${minutes}分鐘前`;
    if (isJa) return `${minutes}分前`;
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }

  // 几小时前（24小时内）
  if (diff < TIME_INTERVALS.DAY) {
    const hours = Math.floor(diff / TIME_INTERVALS.HOUR);
    if (isZh) return `${hours}小时前`;
    if (isZhTW) return `${hours}小時前`;
    if (isJa) return `${hours}時間前`;
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  // 几天前（7天内）
  if (diff < TIME_INTERVALS.WEEK) {
    const days = Math.floor(diff / TIME_INTERVALS.DAY);
    if (isZh) return `${days}天前`;
    if (isZhTW) return `${days}天前`;
    if (isJa) return `${days}日前`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  // 几周前（30天内）
  if (diff < TIME_INTERVALS.MONTH) {
    const weeks = Math.floor(diff / TIME_INTERVALS.WEEK);
    if (isZh) return `${weeks}周前`;
    if (isZhTW) return `${weeks}週前`;
    if (isJa) return `${weeks}週間前`;
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }

  // 几个月前（1年内）
  if (diff < TIME_INTERVALS.YEAR) {
    const months = Math.floor(diff / TIME_INTERVALS.MONTH);
    if (isZh) return `${months}个月前`;
    if (isZhTW) return `${months}個月前`;
    if (isJa) return `${months}か月前`;
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }

  // 几年前
  const years = Math.floor(diff / TIME_INTERVALS.YEAR);
  if (isZh) return `${years}年前`;
  if (isZhTW) return `${years}年前`;
  if (isJa) return `${years}年前`;
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

/**
 * 格式化完整日期时间
 * @param timestamp - 时间戳（毫秒或 Date 对象）
 * @param locale - 语言环境，默认 'zh-CN'
 * @param options - 格式化选项
 * @returns 格式化的日期时间字符串
 */
export function formatFullDateTime(
  timestamp: number | Date,
  locale: string = 'zh-CN',
  options?: Intl.DateTimeFormatOptions
): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options,
  };

  return date.toLocaleString(locale, defaultOptions);
}

/**
 * 格式化时间（仅显示时分秒）
 * @param timestamp - 时间戳（毫秒或 Date 对象）
 * @param locale - 语言环境，默认 'zh-CN'
 * @returns 格式化的时间字符串
 */
export function formatTime(
  timestamp: number | Date,
  locale: string = 'zh-CN'
): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 格式化日期（仅显示年月日）
 * @param timestamp - 时间戳（毫秒或 Date 对象）
 * @param locale - 语言环境，默认 'zh-CN'
 * @returns 格式化的日期字符串
 */
export function formatDate(
  timestamp: number | Date,
  locale: string = 'zh-CN'
): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * 格式化智能日期时间
 * 今天显示时间，昨天显示"昨天 + 时间"，更早显示完整日期时间
 * @param timestamp - 时间戳（毫秒或 Date 对象）
 * @param locale - 语言环境，默认 'zh-CN'
 * @returns 格式化的日期时间字符串
 */
export function formatSmartDateTime(
  timestamp: number | Date,
  locale: string = 'zh-CN'
): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = new Date();
  const normalized = locale.toLowerCase();
  const isZhTW = normalized.startsWith('zh-tw');
  const isZh = normalized.startsWith('zh') && !isZhTW;
  const isJa = normalized.startsWith('ja');

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  };

  // 如果是今天，只显示时间
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    const timeStr = date.toLocaleTimeString(locale, timeOptions);
    if (isZh) return `今天 ${timeStr}`;
    if (isZhTW) return `今天 ${timeStr}`;
    if (isJa) return `今日 ${timeStr}`;
    return `Today ${timeStr}`;
  }

  // 如果是昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    const timeStr = date.toLocaleTimeString(locale, timeOptions);
    if (isZh) return `昨天 ${timeStr}`;
    if (isZhTW) return `昨天 ${timeStr}`;
    if (isJa) return `昨日 ${timeStr}`;
    return `Yesterday ${timeStr}`;
  }

  // 如果是今年，不显示年份
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleString(locale, {
      month: '2-digit',
      day: '2-digit',
      ...timeOptions,
    });
  }

  // 完整日期时间
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...timeOptions,
  });
}

/**
 * 格式化持续时间（毫秒转换为人类可读格式）
 * @param milliseconds - 毫秒数
 * @param locale - 语言环境，默认 'zh-CN'
 * @returns 格式化的持续时间字符串
 */
export function formatDuration(
  milliseconds: number,
  locale: string = 'zh-CN'
): string {
  const seconds = Math.floor(milliseconds / 1000);
  const normalized = locale.toLowerCase();
  const isZhTW = normalized.startsWith('zh-tw');
  const isZh = normalized.startsWith('zh') && !isZhTW;
  const isJa = normalized.startsWith('ja');

  if (seconds < 60) {
    if (isZh || isZhTW || isJa) return `${seconds}秒`;
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    if (isZh || isZhTW || isJa) return `${minutes}分${remainingSeconds}秒`;
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (isZh) return `${hours}小时${remainingMinutes}分`;
  if (isZhTW) return `${hours}小時${remainingMinutes}分`;
  if (isJa) return `${hours}時間${remainingMinutes}分`;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * 判断是否是今天
 * @param timestamp - 时间戳（毫秒或 Date 对象）
 * @returns 是否是今天
 */
export function isToday(timestamp: number | Date): boolean {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * 判断是否是昨天
 * @param timestamp - 时间戳（毫秒或 Date 对象）
 * @returns 是否是昨天
 */
export function isYesterday(timestamp: number | Date): boolean {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  );
}

/**
 * 计算自动刷新间隔
 * 根据时间差返回合适的刷新间隔
 * @param timestamp - 时间戳（毫秒或 Date 对象）
 * @returns 建议的刷新间隔（毫秒）
 */
export function calculateRefreshInterval(timestamp: number | Date): number {
  const time = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  const diff = Date.now() - time;

  // 1分钟内：每10秒刷新
  if (diff < TIME_INTERVALS.MINUTE) {
    return 10 * TIME_INTERVALS.SECOND;
  }

  // 1小时内：每分钟刷新
  if (diff < TIME_INTERVALS.HOUR) {
    return TIME_INTERVALS.MINUTE;
  }

  // 24小时内：每5分钟刷新
  if (diff < TIME_INTERVALS.DAY) {
    return 5 * TIME_INTERVALS.MINUTE;
  }

  // 超过24小时：每小时刷新
  return TIME_INTERVALS.HOUR;
}
