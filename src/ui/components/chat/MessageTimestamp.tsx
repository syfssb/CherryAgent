import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/ui/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/components/ui';
import { getLocaleFromLanguage } from '@/ui/i18n/config';

/**
 * MessageTimestamp 组件属性
 */
export interface MessageTimestampProps {
  /** 时间戳（毫秒或 Date 对象） */
  timestamp: number | Date;
  /** 是否显示完整时间 */
  showFullTime?: boolean;
  /** 自动刷新间隔（毫秒，0 表示不刷新） */
  refreshInterval?: number;
  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * 时间间隔常量（毫秒）
 */
const INTERVALS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000,
};

/**
 * 格式化相对时间（支持国际化）
 * @param timestamp - 时间戳（毫秒）
 * @param t - i18n 翻译函数
 * @returns 相对时间字符串
 */
function formatRelativeTime(timestamp: number, t: (key: string, options?: any) => string): string {
  const now = Date.now();
  const diff = now - timestamp;

  // 未来时间
  if (diff < 0) {
    return t('time.justNow');
  }

  // 刚刚（1分钟内）
  if (diff < INTERVALS.MINUTE) {
    return t('time.justNow');
  }

  // 几分钟前（1小时内）
  if (diff < INTERVALS.HOUR) {
    const minutes = Math.floor(diff / INTERVALS.MINUTE);
    return t('time.minutesAgo', { count: minutes });
  }

  // 几小时前（24小时内）
  if (diff < INTERVALS.DAY) {
    const hours = Math.floor(diff / INTERVALS.HOUR);
    return t('time.hoursAgo', { count: hours });
  }

  // 几天前（7天内）
  if (diff < INTERVALS.WEEK) {
    const days = Math.floor(diff / INTERVALS.DAY);
    return t('time.daysAgo', { count: days });
  }

  // 几周前（30天内）
  if (diff < INTERVALS.MONTH) {
    const weeks = Math.floor(diff / INTERVALS.WEEK);
    return t('time.weeksAgo', { count: weeks });
  }

  // 几个月前（1年内）
  if (diff < INTERVALS.YEAR) {
    const months = Math.floor(diff / INTERVALS.MONTH);
    return t('time.monthsAgo', { count: months });
  }

  // 几年前
  const years = Math.floor(diff / INTERVALS.YEAR);
  return t('time.yearsAgo', { count: years });
}

/**
 * 格式化完整时间（支持国际化）
 * @param timestamp - 时间戳（毫秒）
 * @param t - i18n 翻译函数
 * @param language - 当前语言
 * @returns 完整时间字符串
 */
function formatFullTime(timestamp: number, t: (key: string) => string, language: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const locale = getLocaleFromLanguage(language);

  const options: Intl.DateTimeFormatOptions = {
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
    const timeStr = date.toLocaleTimeString(locale, options);
    return t('time.today') + ' ' + timeStr;
  }

  // 如果是昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    const timeStr = date.toLocaleTimeString(locale, options);
    return t('time.yesterday') + ' ' + timeStr;
  }

  // 如果是今年，不显示年份
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleString(locale, {
      month: '2-digit',
      day: '2-digit',
      ...options,
    });
  }

  // 完整日期时间
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options,
  });
}

/**
 * 计算下次刷新间隔
 * @param diff - 当前时间差（毫秒）
 * @returns 建议的刷新间隔（毫秒）
 */
function calculateRefreshInterval(diff: number): number {
  // 1分钟内：每10秒刷新
  if (diff < INTERVALS.MINUTE) {
    return 10 * INTERVALS.SECOND;
  }
  // 1小时内：每分钟刷新
  if (diff < INTERVALS.HOUR) {
    return INTERVALS.MINUTE;
  }
  // 24小时内：每5分钟刷新
  if (diff < INTERVALS.DAY) {
    return 5 * INTERVALS.MINUTE;
  }
  // 超过24小时：每小时刷新
  return INTERVALS.HOUR;
}

/**
 * 消息时间戳组件
 * 显示相对时间，悬停显示完整时间，支持自动刷新
 *
 * @example
 * // 基础用法
 * <MessageTimestamp timestamp={Date.now() - 60000} />
 *
 * @example
 * // 使用 Date 对象
 * <MessageTimestamp timestamp={new Date('2024-01-15T10:30:00')} />
 *
 * @example
 * // 显示完整时间
 * <MessageTimestamp timestamp={Date.now()} showFullTime={true} />
 *
 * @example
 * // 自定义刷新间隔
 * <MessageTimestamp timestamp={Date.now()} refreshInterval={5000} />
 */
export function MessageTimestamp({
  timestamp,
  showFullTime = false,
  refreshInterval: customRefreshInterval,
  className,
}: MessageTimestampProps) {
  const { t, i18n } = useTranslation();

  // 规范化时间戳为毫秒
  const normalizedTimestamp = useMemo(() => {
    if (timestamp instanceof Date) {
      return timestamp.getTime();
    }
    return timestamp;
  }, [timestamp]);

  // 强制重新渲染的触发器
  const [, setTick] = useState(0);

  /**
   * 相对时间显示
   */
  const relativeTime = useMemo(() => {
    return formatRelativeTime(normalizedTimestamp, t);
  }, [normalizedTimestamp, t]);

  /**
   * 完整时间显示
   */
  const fullTime = useMemo(() => {
    return formatFullTime(normalizedTimestamp, t, i18n.language);
  }, [normalizedTimestamp, t, i18n.language]);

  /**
   * 计算刷新间隔
   */
  const refreshInterval = useMemo(() => {
    if (customRefreshInterval !== undefined) {
      return customRefreshInterval;
    }
    const diff = Date.now() - normalizedTimestamp;
    return calculateRefreshInterval(diff);
  }, [customRefreshInterval, normalizedTimestamp]);

  /**
   * 自动刷新
   */
  useEffect(() => {
    if (refreshInterval <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setTick((prev) => prev + 1);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [refreshInterval]);

  // 如果直接显示完整时间
  if (showFullTime) {
    return (
      <span className={cn('text-xs text-muted tabular-nums', className)} title={fullTime}>
        {fullTime}
      </span>
    );
  }

  // 显示相对时间，悬停显示完整时间
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'text-xs text-muted tabular-nums cursor-default',
              'hover:text-ink-600 transition-colors',
              className
            )}
          >
            {relativeTime}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {fullTime}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default MessageTimestamp;
