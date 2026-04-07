import { ipcMain } from "electron";
import { initializeSessions, cloudSyncService, db } from "./core.js";

/**
 * 注册云同步相关的 IPC 处理器
 */
export function registerSyncHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const syncChannels = [
    "sync:push", "sync:pull", "sync:sync", "sync:getStatus",
    "sync:enable", "sync:disable", "sync:setAccessToken", "sync:getConflicts",
    "sync:resolveConflict", "sync:getConfig", "sync:updateConfig",
    "sync:getPendingChanges", "sync:getLastSyncTime",
  ];
  for (const ch of syncChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  // 确保 sessions 已初始化
  initializeSessions();

  // 获取 CloudSyncService 实例（已在 initializeSessions 中初始化）
  const getCloudSyncService = async () => {
    if (!cloudSyncService) {
      throw new Error('CloudSyncService not initialized. Please ensure initializeSessions() was called.');
    }
    return cloudSyncService;
  };

  // sync:push - 推送本地变更到服务器
  ipcMain.handle("sync:push", async () => {
    try {
      const service = await getCloudSyncService();
      const result = await service.sync("push");
      return {
        success: result.success,
        data: {
          pushed: result.pushed,
          pulled: result.pulled,
          conflicts: result.conflicts,
          duration: result.duration,
          timestamp: result.timestamp
        },
        error: result.error
      };
    } catch (error) {
      console.error("[ipc-handlers] sync:push failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to push changes"
      };
    }
  });

  // sync:pull - 拉取远端变更
  ipcMain.handle("sync:pull", async () => {
    try {
      const service = await getCloudSyncService();
      const result = await service.sync("pull");
      return {
        success: result.success,
        data: {
          pushed: result.pushed,
          pulled: result.pulled,
          conflicts: result.conflicts,
          duration: result.duration,
          timestamp: result.timestamp
        },
        error: result.error
      };
    } catch (error) {
      console.error("[ipc-handlers] sync:pull failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to pull changes"
      };
    }
  });

  // sync:sync - 执行双向同步
  ipcMain.handle("sync:sync", async (_event, options?: { accessToken?: string }) => {
    try {
      if (!options?.accessToken) {
        return {
          success: false,
          error: "未提供 accessToken，无法同步"
        };
      }

      // 诊断信息：查询本地数据库中的待同步记录
      const pendingCount = db.prepare("SELECT COUNT(*) as count FROM sync_changes WHERE synced = 0").get() as { count: number };
      console.log(`[sync:sync] 本地数据库中有 ${pendingCount.count} 条待同步记录`);

      const service = await getCloudSyncService();
      service.setAccessToken(options.accessToken);

      console.log(`[sync:sync] 开始调用 service.sync("both")`);
      const result = await service.sync("both");
      console.log(`[sync:sync] service.sync 返回结果:`, result);

      return {
        success: result.success,
        data: {
          pushed: result.pushed,
          pulled: result.pulled,
          conflicts: result.conflicts,
          duration: result.duration,
          timestamp: result.timestamp,
          // 添加诊断信息
          debug: {
            localPendingCount: pendingCount.count,
            message: `本地数据库有 ${pendingCount.count} 条待同步记录，实际上传 ${result.pushed} 条`
          }
        },
        error: result.error
      };
    } catch (error) {
      console.error("[ipc-handlers] sync:sync failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync"
      };
    }
  });

  // sync:getStatus - 获取同步状态
  ipcMain.handle("sync:getStatus", async () => {
    try {
      const service = await getCloudSyncService();
      const status = service.getStatus();
      return {
        success: true,
        data: status
      };
    } catch (error) {
      console.error("[ipc-handlers] sync:getStatus failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get sync status"
      };
    }
  });

  // sync:enable - 启用自动同步
  ipcMain.handle("sync:enable", async () => {
    try {
      const service = await getCloudSyncService();
      service.enable();
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] sync:enable failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to enable sync"
      };
    }
  });

  // sync:disable - 禁用自动同步
  ipcMain.handle("sync:disable", async () => {
    try {
      const service = await getCloudSyncService();
      service.disable();
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] sync:disable failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to disable sync"
      };
    }
  });

  // sync:setAccessToken - 设置访问令牌
  ipcMain.handle("sync:setAccessToken", async (_, token: string | null) => {
    try {
      const service = await getCloudSyncService();
      service.setAccessToken(token);
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] sync:setAccessToken failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to set access token"
      };
    }
  });

  // sync:getConflicts - 获取未解决的冲突
  ipcMain.handle("sync:getConflicts", async () => {
    try {
      const service = await getCloudSyncService();
      const conflicts = service.getUnresolvedConflicts();
      return {
        success: true,
        data: conflicts
      };
    } catch (error) {
      console.error("[ipc-handlers] sync:getConflicts failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get conflicts"
      };
    }
  });

  // sync:resolveConflict - 解决冲突
  ipcMain.handle(
    "sync:resolveConflict",
    async (_, conflictId: string, resolution: "keep_local" | "keep_remote" | "manual_merge") => {
      try {
        const service = await getCloudSyncService();
        const result = service.resolveConflict(conflictId, resolution);
        return {
          success: result,
          error: result ? undefined : "Conflict not found"
        };
      } catch (error) {
        console.error("[ipc-handlers] sync:resolveConflict failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to resolve conflict"
        };
      }
    }
  );

  // sync:getConfig - 获取同步配置
  ipcMain.handle("sync:getConfig", async () => {
    try {
      const service = await getCloudSyncService();
      const config = service.getConfig();
      return {
        success: true,
        data: config
      };
    } catch (error) {
      console.error("[ipc-handlers] sync:getConfig failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get sync config"
      };
    }
  });

  // sync:updateConfig - 更新同步配置
  ipcMain.handle(
    "sync:updateConfig",
    async (
      _,
      updates: Partial<{
        apiBaseUrl: string;
        syncInterval: number;
        autoSync: boolean;
        enabledEntities: Array<"session" | "tag" | "memory_block" | "skill" | "setting">;
        conflictStrategy: "keep_local" | "keep_remote" | "manual_merge";
      }>
    ) => {
      try {
        const service = await getCloudSyncService();
        service.updateConfig(updates);
        return { success: true };
      } catch (error) {
        console.error("[ipc-handlers] sync:updateConfig failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update sync config"
        };
      }
    }
  );

  // sync:getPendingChanges - 获取待同步的变更
  ipcMain.handle("sync:getPendingChanges", async () => {
    try {
      const service = await getCloudSyncService();
      const changes = service.getPendingChanges();
      return {
        success: true,
        data: changes
      };
    } catch (error) {
      console.error("[ipc-handlers] sync:getPendingChanges failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get pending changes"
      };
    }
  });

  // sync:getLastSyncTime - 获取上次同步时间
  ipcMain.handle("sync:getLastSyncTime", async () => {
    try {
      const service = await getCloudSyncService();
      const lastSyncTime = service.getLastSyncTime();
      return {
        success: true,
        data: { lastSyncTime }
      };
    } catch (error) {
      console.error("[ipc-handlers] sync:getLastSyncTime failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get last sync time"
      };
    }
  });

  console.info("[ipc-handlers] Sync handlers registered");
}
