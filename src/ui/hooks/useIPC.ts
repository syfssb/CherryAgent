import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerEvent, ClientEvent } from "../types";
import { useEventQueue } from "./useEventQueue";

// 检查是否在 Electron 环境中
const isElectron = typeof window !== "undefined" && window.electron !== undefined;
type DispatchAck = { success: boolean; error?: string; code?: string };

/**
 * IPC 通信 Hook
 *
 * @param onEvent - 单事件处理回调（用于高优先级事件）
 * @param onBatchEvent - 批量事件处理回调（可选，用于性能优化）
 */
export function useIPC(
  onEvent: (event: ServerEvent) => void,
  onBatchEvent?: (events: ServerEvent[]) => void
) {
  const [connected, setConnected] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 使用事件队列进行批处理
  const { enqueueEvent } = useEventQueue({
    onBatchProcess: onBatchEvent ?? ((events) => events.forEach(onEvent)),
    onSingleProcess: onEvent,
  });

  useEffect(() => {
    // 如果不在 Electron 环境中，跳过 IPC 初始化
    if (!isElectron) {
      console.warn("[useIPC] Not running in Electron environment, IPC disabled");
      return;
    }

    // Subscribe to server events
    const unsubscribe = window.electron.onServerEvent((event: ServerEvent) => {
      // 通过事件队列处理（自动批处理 + 可见性感知）
      enqueueEvent(event);
    });

    unsubscribeRef.current = unsubscribe;
    setConnected(true);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setConnected(false);
    };
  }, [enqueueEvent]);

  const sendEvent = useCallback((event: ClientEvent) => {
    if (!isElectron) {
      console.warn("[useIPC] Cannot send event: not in Electron environment");
      return;
    }
    window.electron.sendClientEvent(event);
  }, []);

  const dispatchEvent = useCallback(async (event: ClientEvent): Promise<DispatchAck> => {
    if (!isElectron) {
      return { success: false, error: "Not running in Electron environment" };
    }
    if (typeof window.electron.dispatchClientEvent === "function") {
      return window.electron.dispatchClientEvent(event);
    }
    window.electron.sendClientEvent(event);
    return { success: true };
  }, []);

  return { connected, sendEvent, dispatchEvent };
}
