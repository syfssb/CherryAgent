import { ipcMain } from "electron";
import type { StreamMessage } from "../types.js";
import { generateTitle } from "../libs/title-generator.js";
import { initializeSessions, sessions, tagsStore, broadcast } from "./core.js";

/**
 * 注册会话操作相关的 IPC 处理器
 */
export function registerSessionOperationHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const sessionChannels = [
    "session:addTag", "session:removeTag", "session:getTags",
    "session:togglePinned", "session:toggleArchived", "session:search",
    "session:searchSessions", "session:getArchivedSessions", "session:getPinnedSessions",
    "session:fullSearch", "session:updateTitle", "session:update", "session:generateTitle",
  ];
  for (const ch of sessionChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  // 确保 sessions 已初始化
  initializeSessions();

  // session:addTag - 为会话添加标签
  ipcMain.handle("session:addTag", (_, sessionId: string, tagId: string) => {
    try {
      tagsStore.addTagToSession(sessionId, tagId);
      // 广播会话更新事件
      broadcast({
        type: "session.list",
        payload: { sessions: sessions.listSessions({ includeArchived: true }) }
      });
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] session:addTag failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to add tag"
      };
    }
  });

  // session:removeTag - 从会话移除标签
  ipcMain.handle("session:removeTag", (_, sessionId: string, tagId: string) => {
    try {
      tagsStore.removeTagFromSession(sessionId, tagId);
      // 广播会话更新事件
      broadcast({
        type: "session.list",
        payload: { sessions: sessions.listSessions({ includeArchived: true }) }
      });
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] session:removeTag failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to remove tag"
      };
    }
  });

  // session:getTags - 获取会话的所有标签
  ipcMain.handle("session:getTags", (_, sessionId: string) => {
    try {
      const tags = tagsStore.getSessionTags(sessionId);
      return {
        success: true,
        data: tags
      };
    } catch (error) {
      console.error("[ipc-handlers] session:getTags failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get session tags"
      };
    }
  });

  // session:togglePinned - 切换会话置顶状态
  ipcMain.handle("session:togglePinned", (_, sessionId: string) => {
    try {
      const newPinned = sessions.togglePinned(sessionId);
      // 广播会话更新事件
      broadcast({
        type: "session.list",
        payload: { sessions: sessions.listSessions({ includeArchived: true }) }
      });
      return {
        success: true,
        data: { isPinned: newPinned }
      };
    } catch (error) {
      console.error("[ipc-handlers] session:togglePinned failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to toggle pinned"
      };
    }
  });

  // session:toggleArchived - 切换会话归档状态
  ipcMain.handle("session:toggleArchived", (_, sessionId: string) => {
    try {
      const newArchived = sessions.toggleArchived(sessionId);
      // 广播会话更新事件
      broadcast({
        type: "session.list",
        payload: { sessions: sessions.listSessions({ includeArchived: true }) }
      });
      return {
        success: true,
        data: { isArchived: newArchived }
      };
    } catch (error) {
      console.error("[ipc-handlers] session:toggleArchived failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to toggle archived"
      };
    }
  });

  // session:search - 搜索会话
  ipcMain.handle(
    "session:search",
    (_, query: string, options?: { includeArchived?: boolean; tagId?: string }) => {
      try {
        const results = sessions.searchSessions(query, options);
        return {
          success: true,
          data: results
        };
      } catch (error) {
        console.error("[ipc-handlers] session:search failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to search sessions"
        };
      }
    }
  );

  // session:listWithOptions - 带选项的会话列表
  ipcMain.handle(
    "session:listWithOptions",
    (_, options?: { includeArchived?: boolean; tagId?: string; query?: string }) => {
      try {
        const results = sessions.listSessions(options);
        return {
          success: true,
          data: results
        };
      } catch (error) {
        console.error("[ipc-handlers] session:listWithOptions failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to list sessions"
        };
      }
    }
  );

  // session:getArchivedSessions - 获取所有归档会话
  ipcMain.handle("session:getArchivedSessions", () => {
    try {
      const results = sessions.getArchivedSessions();
      return {
        success: true,
        data: results
      };
    } catch (error) {
      console.error("[ipc-handlers] session:getArchivedSessions failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get archived sessions"
      };
    }
  });

  // session:getPinnedSessions - 获取所有置顶会话
  ipcMain.handle("session:getPinnedSessions", () => {
    try {
      const results = sessions.getPinnedSessions();
      return {
        success: true,
        data: results
      };
    } catch (error) {
      console.error("[ipc-handlers] session:getPinnedSessions failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get pinned sessions"
      };
    }
  });

  // session:searchSessions - 搜索会话（使用 FTS5）
  ipcMain.handle(
    "session:searchSessions",
    (
      _,
      query: string,
      options?: { includeArchived?: boolean; tagId?: string }
    ) => {
      try {
        const results = sessions.searchSessions(query, options);
        return {
          success: true,
          data: results
        };
      } catch (error) {
        console.error("[ipc-handlers] session:searchSessions failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Search failed"
        };
      }
    }
  );

  // session:searchMessages - 搜索消息内容（使用 FTS5）
  ipcMain.handle(
    "session:searchMessages",
    (
      _,
      query: string,
      options?: {
        sessionId?: string;
        limit?: number;
        offset?: number;
        includeArchived?: boolean;
      }
    ) => {
      try {
        const results = sessions.searchMessages(query, options);
        return {
          success: true,
          data: results
        };
      } catch (error) {
        console.error("[ipc-handlers] session:searchMessages failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Message search failed"
        };
      }
    }
  );

  // session:fullSearch - 全文搜索（同时搜索会话和消息）
  ipcMain.handle(
    "session:fullSearch",
    (
      _,
      query: string,
      options?: {
        includeArchived?: boolean;
        tagId?: string;
        messageLimit?: number;
        messageOffset?: number;
      }
    ) => {
      try {
        const { includeArchived, tagId, messageLimit = 20, messageOffset = 0 } = options || {};

        // 同时搜索会话和消息
        const sessionResults = sessions.searchSessions(query, { includeArchived, tagId });
        const messageResults = sessions.searchMessages(query, {
          limit: messageLimit,
          offset: messageOffset,
          includeArchived
        });

        return {
          success: true,
          data: {
            sessions: sessionResults,
            messages: messageResults,
            totalSessions: sessionResults.length,
            totalMessages: messageResults.length
          }
        };
      } catch (error) {
        console.error("[ipc-handlers] session:fullSearch failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Full search failed"
        };
      }
    }
  );

  // session:updateTitle - 手动更新会话标题
  ipcMain.handle("session:updateTitle", (_, sessionId: string, title: string) => {
    try {
      const session = sessions.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: "Session not found"
        };
      }

      sessions.updateSession(sessionId, { title });
      // 广播标题更新事件
      broadcast({
        type: "session.titleUpdated",
        payload: { sessionId, title, isGenerating: false }
      });
      // 同时更新会话列表
      broadcast({
        type: "session.list",
        payload: { sessions: sessions.listSessions({ includeArchived: true }) }
      });

      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] session:updateTitle failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update title"
      };
    }
  });

  // session:update - 通用会话更新（支持 skill 配置等）
  ipcMain.handle(
    "session:update",
    (
      _,
      sessionId: string,
      updates: {
        activeSkillIds?: string[];
        skillMode?: "manual" | "auto";
        permissionMode?: "bypassPermissions" | "acceptEdits" | "default";
        title?: string;
        cwd?: string;
        autoCleanScripts?: boolean;
      }
    ) => {
      try {
        const session = sessions.getSession(sessionId);
        if (!session) {
          return {
            success: false,
            error: "Session not found"
          };
        }

        sessions.updateSession(sessionId, updates);

        // 广播会话列表更新
        broadcast({
          type: "session.list",
          payload: { sessions: sessions.listSessions({ includeArchived: true }) }
        });

        return { success: true };
      } catch (error) {
        console.error("[ipc-handlers] session:update failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update session"
        };
      }
    }
  );

  // session:generateTitle - 触发标题生成
  ipcMain.handle("session:generateTitle", async (_, sessionId: string) => {
    try {
      const session = sessions.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: "Session not found"
        };
      }

      // 通知前端正在生成标题
      broadcast({
        type: "session.titleUpdated",
        payload: { sessionId, title: session.title, isGenerating: true }
      });

      // 获取会话历史消息
      const history = sessions.getSessionHistory(sessionId);
      const messages = history?.messages ?? [];

      // 生成标题
      const result = await generateTitle(messages as StreamMessage[]);

      if (result.success) {
        sessions.updateSession(sessionId, { title: result.title });
        broadcast({
          type: "session.titleUpdated",
          payload: { sessionId, title: result.title, isGenerating: false }
        });
        // 同时更新会话列表
        broadcast({
          type: "session.list",
          payload: { sessions: sessions.listSessions({ includeArchived: true }) }
        });
        return { success: true, title: result.title };
      } else {
        broadcast({
          type: "session.titleUpdated",
          payload: { sessionId, title: session.title, isGenerating: false }
        });
        return {
          success: false,
          error: result.error || "Failed to generate title"
        };
      }
    } catch (error) {
      console.error("[ipc-handlers] session:generateTitle failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate title"
      };
    }
  });

  console.info("[ipc-handlers] Session operation handlers registered");
}
