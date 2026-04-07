/**
 * Task Queue 类型定义
 *
 * 定义任务队列系统的所有类型，包括任务优先级、状态、
 * 任务信息、事件类型和配置选项。
 */
/** 优先级到数值的映射（p-queue 使用数值排序，越大越优先） */
export const PRIORITY_MAP = {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
};
