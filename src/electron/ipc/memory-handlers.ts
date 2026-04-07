import { ipcMain } from "electron";
import { initializeSessions, memoryStore } from "./core.js";

/**
 * 注册记忆系统相关的 IPC 处理器
 */
export function registerMemoryHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const memoryChannels = ["memory:get", "memory:set", "memory:clear"];
  for (const ch of memoryChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  // 确保 sessions 已初始化
  initializeSessions();

  // memory:get - 获取用户记忆内容
  ipcMain.handle("memory:get", () => {
    try {
      const memory = memoryStore.get();
      return {
        success: true,
        data: memory
      };
    } catch (error) {
      console.error("[ipc-handlers] memory:get failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get memory"
      };
    }
  });

  // memory:set - 保存用户记忆内容
  ipcMain.handle("memory:set", (_, content: string) => {
    try {
      memoryStore.set(content ?? "");
      return {
        success: true
      };
    } catch (error) {
      console.error("[ipc-handlers] memory:set failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save memory"
      };
    }
  });

  // memory:clear - 清空用户记忆
  ipcMain.handle("memory:clear", () => {
    try {
      memoryStore.clear();
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] memory:clear failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to clear memory"
      };
    }
  });

  console.info("[ipc-handlers] Memory handlers registered");
}
