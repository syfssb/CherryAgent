import { useEffect, useRef, useCallback } from "react";
import type { ServerEvent } from "../types";

/** 前台批处理间隔 (ms) */
const BATCH_INTERVAL = 50;

/** 后台切换时每批处理数量 */
const BACKGROUND_BATCH_SIZE = 25;

/** requestIdleCallback 超时 (ms) */
const IDLE_TIMEOUT = 100;

/** 高优先级事件类型 - 这些事件需要立即处理，不入队 */
const HIGH_PRIORITY_EVENTS = new Set([
  "permission.request",
  "session.status",
  "session.deleted",
  "runner.error",
  "session.compacting",
  "session.compact",
  "stream.user_prompt",
  "stream.message",
  "session.titleUpdated",
  "session.history",
  "session.list",
]);

interface EventQueueOptions {
  /** 批量处理回调 */
  onBatchProcess: (events: ServerEvent[]) => void;
  /** 单事件处理回调（用于高优先级事件） */
  onSingleProcess: (event: ServerEvent) => void;
}

/**
 * 事件队列 Hook
 *
 * 功能：
 * 1. 前台模式：每 50ms 批量处理消息
 * 2. 后台模式：只缓存消息，切回时分批处理
 * 3. 高优先级事件直接处理，不入队
 */
export function useEventQueue(options: EventQueueOptions) {
  const { onBatchProcess, onSingleProcess } = options;

  const queueRef = useRef<ServerEvent[]>([]);
  const isVisibleRef = useRef(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );
  const timerRef = useRef<number | null>(null);
  const idleCallbackRef = useRef<number | null>(null);

  /** 清空并处理队列 */
  const flushQueue = useCallback(() => {
    if (queueRef.current.length === 0) return;

    const events = queueRef.current;
    queueRef.current = [];
    onBatchProcess(events);
  }, [onBatchProcess]);

  /** 使用 requestIdleCallback 调度 flush */
  const scheduleFlush = useCallback(() => {
    if (idleCallbackRef.current !== null) return;

    if ("requestIdleCallback" in window) {
      idleCallbackRef.current = window.requestIdleCallback(
        () => {
          idleCallbackRef.current = null;
          flushQueue();
        },
        { timeout: IDLE_TIMEOUT }
      );
    } else {
      // Fallback for older browsers
      idleCallbackRef.current = globalThis.setTimeout(() => {
        idleCallbackRef.current = null;
        flushQueue();
      }, BATCH_INTERVAL) as unknown as number;
    }
  }, [flushQueue]);

  /** 入队事件 */
  const enqueueEvent = useCallback(
    (event: ServerEvent) => {
      // 高优先级事件直接处理
      if (HIGH_PRIORITY_EVENTS.has(event.type)) {
        onSingleProcess(event);
        return;
      }

      queueRef.current.push(event);

      // 前台：定时批处理
      if (isVisibleRef.current && timerRef.current === null) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          scheduleFlush();
        }, BATCH_INTERVAL);
      }
      // 后台：只缓存，不处理
    },
    [onSingleProcess, scheduleFlush]
  );

  // 可见性变化处理
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      const isNowVisible = document.visibilityState === "visible";

      if (isNowVisible && !isVisibleRef.current) {
        // 从后台切回前台
        isVisibleRef.current = true;

        // 分批处理积压事件，避免一次性处理过多导致卡顿
        const processBatch = () => {
          if (queueRef.current.length === 0) return;

          const batch = queueRef.current.splice(0, BACKGROUND_BATCH_SIZE);
          onBatchProcess(batch);

          if (queueRef.current.length > 0) {
            // 还有剩余，继续处理（用 setTimeout 而非 RAF，让浏览器有机会处理用户输入）
            setTimeout(processBatch, 0);
          }
        };

        requestAnimationFrame(processBatch);
      } else if (!isNowVisible) {
        // 切到后台
        isVisibleRef.current = false;

        // 清除前台定时器
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      // 清理定时器
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      if (idleCallbackRef.current !== null) {
        if ("cancelIdleCallback" in window) {
          window.cancelIdleCallback(idleCallbackRef.current);
        } else {
          clearTimeout(idleCallbackRef.current);
        }
      }
    };
  }, [onBatchProcess]);

  return { enqueueEvent };
}
