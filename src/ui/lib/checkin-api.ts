import { apiClient, ApiError } from './api-client';

/**
 * 签到结果
 */
export interface CheckInResult {
  success: boolean;
  date: string;
  consecutiveDays: number;
  creditsEarned: number;
  totalCredits: number;
  message: string;
}

/**
 * 签到状态
 */
export interface CheckInStatus {
  checkedInToday: boolean;
  consecutiveDays: number;
  totalCheckIns: number;
  lastCheckInDate: string | null;
  todayReward: number;
  nextReward: number;
}

/**
 * 签到日历项
 */
export interface CheckInCalendarItem {
  date: string;
  consecutiveDays: number;
  creditsEarned: number;
}

/**
 * 签到 API
 */
export const checkinApi = {
  /**
   * 执行签到
   */
  async checkIn(): Promise<CheckInResult> {
    try {
      const response = await apiClient.post<CheckInResult>(
        '/checkin',
        undefined,
        { requireAuth: true }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || '签到失败');
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '签到请求失败');
    }
  },

  /**
   * 获取签到状态
   */
  async getStatus(): Promise<CheckInStatus> {
    try {
      const response = await apiClient.get<CheckInStatus>(
        '/checkin/status',
        { requireAuth: true }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || '获取签到状态失败');
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '获取签到状态失败');
    }
  },

  /**
   * 获取签到日历
   */
  async getCalendar(year: number, month: number): Promise<CheckInCalendarItem[]> {
    try {
      const response = await apiClient.get<{ calendar: CheckInCalendarItem[] }>(
        `/checkin/calendar?year=${year}&month=${month}`,
        { requireAuth: true }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || '获取签到日历失败');
      }

      return response.data.calendar;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '获取签到日历失败');
    }
  },
};
