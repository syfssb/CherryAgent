/**
 * 日期时间格式化工具
 */

/**
 * 格式化日期时间为 "YYYY/MM/DD HH:mm:ss" 格式
 * @param date - 日期对象、时间戳或日期字符串
 * @returns 格式化后的日期时间字符串
 */
export function formatDateTime(date: Date | string | number): string {
  const d = new Date(date);

  if (isNaN(d.getTime())) {
    return '无效日期';
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 计算剩余天数
 * @param expiresAt - 到期时间
 * @returns 剩余天数（向上取整）
 */
export function calculateDaysLeft(expiresAt: Date | string | number): number {
  const expireTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const daysLeft = Math.max(0, Math.ceil((expireTime - now) / (1000 * 60 * 60 * 24)));
  return daysLeft;
}
