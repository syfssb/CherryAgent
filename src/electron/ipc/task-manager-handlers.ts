import { app, ipcMain } from "electron";

// ==========================================
// 任务队列管理相关处理器
// ==========================================

/** 用于在 cleanup 时销毁 TaskManager 单例 */
let _taskManagerInstance: import("@cherry-agent/core").TaskManager | null = null;

export function registerTaskManagerHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const taskChannels = [
    "task:getQueueStatus", "task:getTask", "task:cancel",
    "task:cancelAll", "task:pause", "task:resume",
  ];
  for (const ch of taskChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  const getTaskManager = (): import("@cherry-agent/core").TaskManager => {
    if (!_taskManagerInstance) {
      // 懒初始化：首次调用时才加载 TaskManager
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { TaskManager } = require("@cherry-agent/core") as typeof import("@cherry-agent/core");
      _taskManagerInstance = new TaskManager({ concurrency: 3 });
    }
    return _taskManagerInstance;
  };

  // task:getQueueStatus - 获取队列状态
  ipcMain.handle("task:getQueueStatus", async () => {
    try {
      const tm = getTaskManager();
      return { success: true, data: tm.getQueueStatus() };
    } catch (error) {
      console.error("[ipc-handlers] task:getQueueStatus failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get queue status",
      };
    }
  });

  // task:getTask - 获取指定任务信息（剔除不可序列化的 abortController）
  ipcMain.handle("task:getTask", async (_, taskId: string) => {
    try {
      const tm = getTaskManager();
      const task = tm.getTask(taskId);
      if (!task) {
        return { success: false, error: "Task not found" };
      }
      // abortController 不能跨进程序列化，需要剔除
      const { abortController: _, ...serializable } = task;
      return { success: true, data: serializable };
    } catch (error) {
      console.error("[ipc-handlers] task:getTask failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get task",
      };
    }
  });

  // task:cancel - 取消指定任务
  ipcMain.handle("task:cancel", async (_, taskId: string, reason?: string) => {
    try {
      const tm = getTaskManager();
      const result = tm.cancel(taskId, reason);
      return {
        success: result,
        error: result ? undefined : "Task not found or already completed",
      };
    } catch (error) {
      console.error("[ipc-handlers] task:cancel failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to cancel task",
      };
    }
  });

  // task:cancelAll - 取消所有任务
  ipcMain.handle("task:cancelAll", async (_, reason?: string) => {
    try {
      const tm = getTaskManager();
      const count = tm.cancelAll(reason);
      return { success: true, data: { cancelledCount: count } };
    } catch (error) {
      console.error("[ipc-handlers] task:cancelAll failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to cancel all tasks",
      };
    }
  });

  // task:pause - 暂停队列（不影响正在执行的任务）
  ipcMain.handle("task:pause", async () => {
    try {
      const tm = getTaskManager();
      tm.pause();
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] task:pause failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to pause queue",
      };
    }
  });

  // task:resume - 恢复队列
  ipcMain.handle("task:resume", async () => {
    try {
      const tm = getTaskManager();
      tm.resume();
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] task:resume failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to resume queue",
      };
    }
  });

  // 监听 app 退出事件，自动销毁 TaskManager
  app.on("before-quit", () => {
    if (_taskManagerInstance && !_taskManagerInstance.isDisposed) {
      _taskManagerInstance.dispose();
      _taskManagerInstance = null;
    }
  });

  console.info("[ipc-handlers] TaskManager handlers registered");
}

/**
 * 手动清理 TaskManager 单例。
 * 可在 main.ts 的 cleanup() 中调用，确保资源释放。
 */
export function cleanupTaskManager(): void {
  if (_taskManagerInstance && !_taskManagerInstance.isDisposed) {
    _taskManagerInstance.dispose();
    _taskManagerInstance = null;
    console.info("[ipc-handlers] TaskManager cleaned up");
  }
}
