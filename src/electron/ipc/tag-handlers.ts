import { ipcMain } from "electron";
import { initializeSessions, tagsStore } from "./core.js";

/**
 * 注册标签相关的 IPC 处理器
 */
export function registerTagHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const tagChannels = [
    "tags:getAll", "tags:create", "tags:update", "tags:delete", "tags:getUsageCount",
  ];
  for (const ch of tagChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  // 确保 sessions 已初始化
  initializeSessions();

  // tags:getAll - 获取所有标签（包含使用次数）
  ipcMain.handle("tags:getAll", () => {
    try {
      return {
        success: true,
        data: tagsStore.getTagsWithUsageCount()
      };
    } catch (error) {
      console.error("[ipc-handlers] tags:getAll failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get tags"
      };
    }
  });

  // tags:create - 创建新标签
  ipcMain.handle("tags:create", (_, name: string, color: string) => {
    try {
      // 检查名称是否已存在
      if (tagsStore.isTagNameExists(name)) {
        return {
          success: false,
          error: "Tag name already exists"
        };
      }
      const tag = tagsStore.createTag(name, color);
      return {
        success: true,
        data: { ...tag, usageCount: 0 }
      };
    } catch (error) {
      console.error("[ipc-handlers] tags:create failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create tag"
      };
    }
  });

  // tags:update - 更新标签
  ipcMain.handle("tags:update", (_, id: string, updates: { name?: string; color?: string }) => {
    try {
      // 如果更新名称，检查是否与其他标签冲突
      if (updates.name && tagsStore.isTagNameExists(updates.name, id)) {
        return {
          success: false,
          error: "Tag name already exists"
        };
      }
      const tag = tagsStore.updateTag(id, updates);
      if (!tag) {
        return {
          success: false,
          error: "Tag not found"
        };
      }
      return {
        success: true,
        data: { ...tag, usageCount: tagsStore.getTagUsageCount(id) }
      };
    } catch (error) {
      console.error("[ipc-handlers] tags:update failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update tag"
      };
    }
  });

  // tags:delete - 删除标签
  ipcMain.handle("tags:delete", (_, id: string) => {
    try {
      const result = tagsStore.deleteTag(id);
      return {
        success: result,
        error: result ? undefined : "Tag not found"
      };
    } catch (error) {
      console.error("[ipc-handlers] tags:delete failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete tag"
      };
    }
  });

  // tags:getUsageCount - 获取标签使用次数
  ipcMain.handle("tags:getUsageCount", (_, id: string) => {
    try {
      return {
        success: true,
        data: tagsStore.getTagUsageCount(id)
      };
    } catch (error) {
      console.error("[ipc-handlers] tags:getUsageCount failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get usage count"
      };
    }
  });

  console.info("[ipc-handlers] Tag handlers registered");
}
