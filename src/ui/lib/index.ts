/**
 * Library utilities barrel export file.
 * Import all utility functions from a single location.
 *
 * @example
 * import { cn, formatRelativeTime, formatDuration } from "@/ui/lib"
 */

// UI utilities
export { cn } from './utils';

// Time formatting utilities
export {
  formatRelativeTime,
  formatFullDateTime,
  formatTime,
  formatDate,
  formatSmartDateTime,
  formatDuration,
  isToday,
  isYesterday,
  calculateRefreshInterval,
  TIME_INTERVALS,
} from './time';
