import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { checkinApi, type CheckInStatus, type CheckInCalendarItem } from '../lib/checkin-api';

interface CheckInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 7 天签到进度 — 圆形格子 + 勾号
 */
function RewardProgress({
  consecutiveDays,
  checkedInToday,
}: {
  consecutiveDays: number;
  checkedInToday: boolean;
}) {
  const { t } = useTranslation();
  const days = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="flex items-center justify-between">
      {days.map((day, idx) => {
        const isCompleted = checkedInToday
          ? day <= consecutiveDays
          : day < consecutiveDays;
        const isCurrent = checkedInToday
          ? day === consecutiveDays
          : day === consecutiveDays + 1;

        return (
          <div key={day} className="flex flex-col items-center gap-1.5">
            {/* 连接线（第一个元素不需要左边线） */}
            <div className="relative flex items-center justify-center">
              {/* 圆形格子 */}
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center transition-all
                  ${isCompleted
                    ? 'bg-[#ae5630] text-white'
                    : isCurrent
                      ? 'border-[1.5px] border-dashed border-[#ae5630] text-[#ae5630]'
                      : 'bg-[#e3dacc] dark:bg-[#4a4944]'
                  }
                `}
              >
                {isCompleted ? (
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5l3 3 6-6.5" />
                  </svg>
                ) : (
                  <span className={`text-xs font-semibold tabular-nums ${
                    isCurrent ? 'text-[#ae5630]' : 'text-[#87867f]'
                  }`}>
                    {day}
                  </span>
                )}
              </div>
            </div>
            {/* 标签 */}
            <span
              className={`text-[11px] tracking-[0.05em] ${
                isCompleted || isCurrent
                  ? 'text-[#ae5630] font-medium'
                  : 'text-[#87867f]'
              }`}
            >
              {t('checkin.dayN', '第{{n}}天', { n: day })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 迷你日历组件
 */
function MiniCalendar({
  year,
  month,
  checkedDates,
  onMonthChange,
}: {
  year: number;
  month: number;
  checkedDates: Set<string>;
  onMonthChange: (year: number, month: number) => void;
}) {
  const { t } = useTranslation();

  const weekDays = [
    t('checkin.weekSun', '日'),
    t('checkin.weekMon', '一'),
    t('checkin.weekTue', '二'),
    t('checkin.weekWed', '三'),
    t('checkin.weekThu', '四'),
    t('checkin.weekFri', '五'),
    t('checkin.weekSat', '六'),
  ];

  const { days, startDay } = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    return {
      days: lastDay.getDate(),
      startDay: firstDay.getDay(),
    };
  }, [year, month]);

  const today = useMemo(() => {
    const now = new Date();
    const cstOffset = 8 * 60 * 60 * 1000;
    const cstDate = new Date(now.getTime() + cstOffset);
    return cstDate.toISOString().split('T')[0] as string;
  }, []);

  const handlePrevMonth = () => {
    if (month === 1) {
      onMonthChange(year - 1, 12);
    } else {
      onMonthChange(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      onMonthChange(year + 1, 1);
    } else {
      onMonthChange(year, month + 1);
    }
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= days; d++) {
    cells.push(d);
  }

  return (
    <div>
      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-3">
        <button
          className="rounded-lg p-1.5 text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a] transition-colors"
          onClick={handlePrevMonth}
          aria-label={t('checkin.prevMonth', '上个月')}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-[#141413] dark:text-[#faf9f5]">
          {year}{t('checkin.yearUnit', '年')}{month}{t('checkin.monthUnit', '月')}
        </span>
        <button
          className="rounded-lg p-1.5 text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a] transition-colors"
          onClick={handleNextMonth}
          aria-label={t('checkin.nextMonth', '下个月')}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* 星期头 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map((wd) => (
          <div
            key={wd}
            className="text-center text-[11px] uppercase tracking-[0.05em] font-medium text-[#87867f] py-1"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="h-8" />;
          }

          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isChecked = checkedDates.has(dateStr);
          const isToday = dateStr === today;

          return (
            <div
              key={day}
              className={`
                h-8 flex items-center justify-center rounded-full text-[14px] tabular-nums transition-colors
                ${isChecked
                  ? 'bg-[#ae5630] text-white font-semibold'
                  : isToday
                    ? 'border border-dashed border-[#ae5630] text-[#ae5630] font-semibold'
                    : 'text-[#141413] dark:text-[#faf9f5] hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]'
                }
              `}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 签到弹窗 — Anthropic UI 设计系统
 */
export function CheckInModal({ open, onOpenChange }: CheckInModalProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CheckInStatus | null>(null);
  const [calendar, setCalendar] = useState<CheckInCalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<{
    creditsEarned: number;
    consecutiveDays: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 日历月份
  const now = new Date();
  const cstOffset = 8 * 60 * 60 * 1000;
  const cstNow = new Date(now.getTime() + cstOffset);
  const [calYear, setCalYear] = useState(cstNow.getUTCFullYear());
  const [calMonth, setCalMonth] = useState(cstNow.getUTCMonth() + 1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusData, calendarData] = await Promise.all([
        checkinApi.getStatus(),
        checkinApi.getCalendar(calYear, calMonth),
      ]);
      setStatus(statusData);
      setCalendar(calendarData);
    } catch (err: any) {
      setError(err.message || t('checkin.loadFailed', '加载签到信息失败'));
    } finally {
      setLoading(false);
    }
  }, [calYear, calMonth, t]);

  useEffect(() => {
    if (open) {
      setCheckInResult(null);
      fetchData();
    }
  }, [open, fetchData]);

  const handleMonthChange = useCallback(
    async (year: number, month: number) => {
      setCalYear(year);
      setCalMonth(month);
      try {
        const calendarData = await checkinApi.getCalendar(year, month);
        setCalendar(calendarData);
      } catch {
        // ignore
      }
    },
    []
  );

  const handleCheckIn = useCallback(async () => {
    setCheckingIn(true);
    setError(null);
    try {
      const result = await checkinApi.checkIn();
      setCheckInResult({
        creditsEarned: result.creditsEarned,
        consecutiveDays: result.consecutiveDays,
      });
      // 刷新状态
      const [statusData, calendarData] = await Promise.all([
        checkinApi.getStatus(),
        checkinApi.getCalendar(calYear, calMonth),
      ]);
      setStatus(statusData);
      setCalendar(calendarData);
    } catch (err: any) {
      setError(err.message || t('checkin.failed', '签到失败'));
    } finally {
      setCheckingIn(false);
    }
  }, [calYear, calMonth, t]);

  const checkedDates = useMemo(
    () => new Set(calendar.map((item) => item.date)),
    [calendar]
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* 遮罩 */}
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />

        {/* 弹窗主体 */}
        <Dialog.Content
          className={`
            fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 z-50
            rounded-2xl p-6
            bg-[#faf9f5] dark:bg-[#2b2a27]
            [box-shadow:0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]
          `}
        >
          {/* 标题行 */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <Dialog.Title className="text-lg font-semibold text-[#141413] dark:text-[#faf9f5]" style={{ fontFamily: 'system-ui' }}>
              {t('checkin.title', '每日签到')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded-lg p-1.5 text-[#87867f] hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a] transition-colors"
                aria-label={t('common.close', '关闭')}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          {/* 加载态 */}
          {loading && !status ? (
            <div className="flex items-center justify-center py-12">
              <svg className="h-6 w-6 animate-spin text-[#ae5630]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : error && !status ? (
            /* 错误态 */
            <div className="text-center py-8">
              <p className="text-sm text-[#DC2626] mb-3">{error}</p>
              <button
                className="rounded-xl bg-[#141413] dark:bg-[#faf9f5] px-5 py-2.5 text-sm font-semibold text-[#faf9f5] dark:text-[#141413] hover:bg-[#2b2a27] dark:hover:bg-[#e5e4df] active:scale-[0.98] transition-all"
                onClick={fetchData}
              >
                {t('common.retry', '重试')}
              </button>
            </div>
          ) : status ? (
            <div className="space-y-5">
              {/* 签到成功动画 */}
              {checkInResult && (
                <div className="rounded-xl bg-[#ae5630]/5 border border-[#ae5630]/15 p-4 text-center animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="text-[28px] font-semibold tabular-nums text-[#ae5630] mb-0.5">
                    +{checkInResult.creditsEarned}
                  </div>
                  <p className="text-sm text-[#ae5630] font-medium">
                    {t('checkin.earnedCredits', '获得 {{amount}} 积分', {
                      amount: checkInResult.creditsEarned,
                    })}
                  </p>
                  {checkInResult.consecutiveDays > 1 && (
                    <p className="text-xs text-[#ae5630]/70 mt-1">
                      {t('checkin.consecutiveBonus', '连续签到 {{days}} 天', {
                        days: checkInResult.consecutiveDays,
                      })}
                    </p>
                  )}
                </div>
              )}

              {/* 统计卡片 — 3 列 */}
              <div className="grid grid-cols-3 gap-3">
                {/* 连续签到 */}
                <div className="rounded-xl bg-white dark:bg-[#3d3d3a] border border-[rgba(20,20,19,0.10)] dark:border-[rgba(250,249,245,0.08)] p-3 text-center">
                  <div className="text-[28px] font-semibold tabular-nums text-[#141413] dark:text-[#faf9f5] leading-tight">
                    {status.consecutiveDays}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.05em] text-[#87867f] mt-1">
                    {t('checkin.consecutiveDays', '连续签到')}
                  </div>
                </div>
                {/* 累计签到 */}
                <div className="rounded-xl bg-white dark:bg-[#3d3d3a] border border-[rgba(20,20,19,0.10)] dark:border-[rgba(250,249,245,0.08)] p-3 text-center">
                  <div className="text-[28px] font-semibold tabular-nums text-[#141413] dark:text-[#faf9f5] leading-tight">
                    {status.totalCheckIns}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.05em] text-[#87867f] mt-1">
                    {t('checkin.totalCheckIns', '累计签到')}
                  </div>
                </div>
                {/* 今日可得/已得 */}
                <div className="rounded-xl bg-white dark:bg-[#3d3d3a] border border-[rgba(20,20,19,0.10)] dark:border-[rgba(250,249,245,0.08)] p-3 text-center">
                  <div className="text-[28px] font-semibold tabular-nums text-[#ae5630] leading-tight">
                    {status.checkedInToday ? status.todayReward : status.nextReward}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.05em] text-[#87867f] mt-1">
                    {status.checkedInToday
                      ? t('checkin.todayEarned', '今日获得')
                      : t('checkin.todayReward', '今日可得')}
                  </div>
                </div>
              </div>

              {/* 7 天签到进度 */}
              <div>
                <div className="text-[11px] uppercase tracking-[0.05em] font-medium text-[#87867f] mb-3">
                  {t('checkin.weeklyProgress', '7 天签到进度')}
                </div>
                <RewardProgress
                  consecutiveDays={status.consecutiveDays}
                  checkedInToday={status.checkedInToday}
                />
              </div>

              {/* 签到按钮 — Anthropic CTA 深色 */}
              <button
                className={`
                  w-full rounded-xl py-3 text-[15px] font-semibold transition-all
                  ${status.checkedInToday
                    ? 'bg-[#e3dacc] dark:bg-[#4a4944] text-[#87867f] cursor-not-allowed'
                    : checkingIn
                      ? 'bg-[#141413]/70 dark:bg-[#faf9f5]/70 text-[#faf9f5] dark:text-[#141413] cursor-wait'
                      : 'bg-[#141413] dark:bg-[#faf9f5] text-[#faf9f5] dark:text-[#141413] hover:bg-[#2b2a27] dark:hover:bg-[#e5e4df] active:scale-[0.98]'
                  }
                `}
                disabled={status.checkedInToday || checkingIn}
                onClick={handleCheckIn}
              >
                {status.checkedInToday
                  ? t('checkin.alreadyCheckedIn', '今日已签到')
                  : checkingIn
                    ? t('checkin.checkingIn', '签到中...')
                    : t('checkin.checkInNow', '立即签到')}
              </button>

              {/* 错误提示 */}
              {error && (
                <p className="text-xs text-[#DC2626] text-center">{error}</p>
              )}

              {/* 日历 */}
              <div className="border-t border-[rgba(20,20,19,0.10)] dark:border-[rgba(250,249,245,0.08)] pt-4">
                <MiniCalendar
                  year={calYear}
                  month={calMonth}
                  checkedDates={checkedDates}
                  onMonthChange={handleMonthChange}
                />
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
