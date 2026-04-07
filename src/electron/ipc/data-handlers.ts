import { app, ipcMain } from "electron";
import { createHash, randomBytes } from "crypto";
import { join } from "path";
import { unlinkSync, writeFileSync } from "fs";
import { initializeSessions, db } from "./core.js";

function calculateChecksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function getDbVersion(): number {
  try {
    const result = db
      .prepare("SELECT MAX(version) as version FROM migrations")
      .get() as { version?: number } | undefined;
    return result?.version ?? 0;
  } catch {
    return 0;
  }
}

function normalizeSettings(
  settings: unknown,
): Array<{ key: string; value: string; updatedAt: number }> {
  if (Array.isArray(settings)) {
    return settings
      .map((item) => {
        const record = item as Record<string, unknown>;
        if (!record.key) return null;
        return {
          key: String(record.key),
          value: String(record.value ?? ""),
          updatedAt: Number(record.updatedAt ?? Date.now()),
        };
      })
      .filter((item): item is { key: string; value: string; updatedAt: number } => Boolean(item));
  }

  if (settings && typeof settings === "object") {
    return Object.entries(settings as Record<string, { value?: unknown; updatedAt?: unknown }>).map(([key, value]) => ({
      key,
      value: String(value?.value ?? ""),
      updatedAt: Number(value?.updatedAt ?? Date.now()),
    }));
  }

  return [];
}

function buildSimpleArchive(data: unknown): Record<string, string> {
  const payload = (data ?? {}) as Record<string, unknown>;
  const content = (payload.data ?? {}) as Record<string, unknown>;
  const checksums: Record<string, string> = {};
  const archiveData: Record<string, string> = {};

  const addFile = (name: string, value: unknown) => {
    const json = JSON.stringify(value);
    archiveData[name] = json;
    checksums[name] = calculateChecksum(json);
  };

  const sessions = Array.isArray(content.sessions) ? content.sessions : [];
  const messages = Array.isArray(content.messages) ? content.messages : [];
  const tags = Array.isArray(content.tags) ? content.tags : [];
  const sessionTags = Array.isArray(content.sessionTags) ? content.sessionTags : [];
  const memories = Array.isArray(content.memories) ? content.memories : [];
  const skills = Array.isArray(content.skills) ? content.skills : [];
  const settings = normalizeSettings(content.settings);

  addFile("sessions.json", sessions);
  addFile("messages.json", messages);
  addFile("tags.json", tags);
  addFile("session_tags.json", sessionTags);
  addFile("memory_blocks.json", memories);
  addFile("skills.json", skills);
  addFile("settings.json", settings);

  const manifest = {
    version: "1.0.0",
    exportedAt: Date.now(),
    appVersion: app.getVersion(),
    dbVersion: getDbVersion(),
    stats: {
      sessions: sessions.length,
      messages: messages.length,
      tags: tags.length,
      memoryBlocks: memories.length,
      archivalMemories: 0,
      skills: skills.length,
      settings: settings.length,
    },
    checksums,
    platform: process.platform,
  };

  archiveData["manifest.json"] = JSON.stringify(manifest);
  return archiveData;
}

/**
 * 注册数据导入导出相关的 IPC 处理器
 */
export function registerDataHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const dataChannels = [
    "data:export", "data:import", "data:importSimple", "data:validate",
  ];
  for (const ch of dataChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  // 确保 sessions 已初始化
  initializeSessions();

  // data:export - 导出数据到文件
  ipcMain.handle(
    "data:export",
    async (
      _,
      options?: {
        outputDir?: string;
        fileName?: string;
        include?: {
          sessions?: boolean;
          messages?: boolean;
          tags?: boolean;
          memories?: boolean;
          archivalMemories?: boolean;
          skills?: boolean;
          settings?: boolean;
        };
      }
    ) => {
      try {
        const { exportData } = await import("../libs/data-export.js");

        const result = await exportData(db, options);
        return {
          success: result.success,
          data: result.success
            ? {
                filePath: result.filePath,
                stats: result.stats,
                duration: result.duration
              }
            : undefined,
          error: result.error
        };
      } catch (error) {
        console.error("[ipc-handlers] data:export failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to export data"
        };
      }
    }
  );

  // data:exportSimple - 导出简单的 JSON 格式数据（用于前端 DataManagement 组件）
  ipcMain.handle(
    "data:exportSimple",
    async () => {
      try {
        // 确保 sessions 已初始化
        initializeSessions();

        // 读取 sessions
        const sessionsRows = db.prepare(
          `SELECT id, title, claude_session_id, status, cwd, permission_mode, skill_mode, active_skill_ids,
                  provider, provider_thread_id, runtime, created_at, updated_at
           FROM sessions
           ORDER BY updated_at DESC`
        ).all() as Array<{
          id: string;
          title: string;
          claude_session_id: string | null;
          status: string;
          cwd: string | null;
          permission_mode: string | null;
          skill_mode: string | null;
          active_skill_ids: string | null;
          provider: string | null;
          provider_thread_id: string | null;
          runtime: string | null;
          created_at: number;
          updated_at: number;
        }>;

        const messageRows = db.prepare(
          `SELECT id, session_id, data, created_at
           FROM messages
           ORDER BY created_at ASC`
        ).all() as Array<{
          id: string;
          session_id: string;
          data: string;
          created_at: number;
        }>;

        const tagRows = db.prepare(
          `SELECT id, name, color, created_at
           FROM tags
           ORDER BY created_at ASC`
        ).all() as Array<{
          id: string;
          name: string;
          color: string;
          created_at: number;
        }>;

        const sessionTagRows = db.prepare(
          `SELECT session_id, tag_id, created_at
           FROM session_tags
           ORDER BY created_at ASC`
        ).all() as Array<{
          session_id: string;
          tag_id: string;
          created_at: number;
        }>;

        // 读取 memory_blocks
        const memoryRows = db.prepare(
          `SELECT id, label, description, value, char_limit, created_at, updated_at
           FROM memory_blocks
           ORDER BY created_at ASC`
        ).all() as Array<{
          id: string;
          label: string;
          description: string;
          value: string;
          char_limit: number;
          created_at: number;
          updated_at: number;
        }>;

        // 读取 skills
        const skillsRows = db.prepare(
          `SELECT id, name, description, content, source, is_enabled, icon, category, created_at, updated_at
           FROM skills
           ORDER BY name ASC`
        ).all() as Array<{
          id: string;
          name: string;
          description: string;
          content: string;
          source: string;
          is_enabled: number;
          icon: string | null;
          category: string;
          created_at: number;
          updated_at: number;
        }>;

        // 读取 local_settings
        const settingsRows = db.prepare(
          `SELECT key, value, updated_at
           FROM local_settings
           ORDER BY key ASC`
        ).all() as Array<{
          key: string;
          value: string;
          updated_at: number;
        }>;

        // 构建导出数据
        const exportData = {
          version: "1.0.0",
          exportedAt: new Date().toISOString(),
          data: {
            sessions: sessionsRows.map(row => ({
              id: row.id,
              title: row.title,
              claudeSessionId: row.claude_session_id,
              status: row.status,
              cwd: row.cwd,
              permissionMode: row.permission_mode,
              skillMode: row.skill_mode,
              activeSkillIds: row.active_skill_ids
                ? (() => {
                    try {
                      const parsed = JSON.parse(row.active_skill_ids);
                      return Array.isArray(parsed) ? parsed : [];
                    } catch {
                      return [];
                    }
                  })()
                : [],
              provider: row.provider,
              providerThreadId: row.provider_thread_id,
              runtime: row.runtime,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            })),
            messages: messageRows.map(row => ({
              id: row.id,
              sessionId: row.session_id,
              data: (() => {
                try {
                  return JSON.parse(row.data);
                } catch {
                  return row.data;
                }
              })(),
              createdAt: row.created_at,
            })),
            tags: tagRows.map(row => ({
              id: row.id,
              name: row.name,
              color: row.color,
              createdAt: row.created_at,
            })),
            sessionTags: sessionTagRows.map(row => ({
              sessionId: row.session_id,
              tagId: row.tag_id,
              createdAt: row.created_at,
            })),
            memories: memoryRows.map(row => ({
              id: row.id,
              label: row.label,
              description: row.description,
              value: row.value,
              charLimit: row.char_limit,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            })),
            skills: skillsRows.map(row => ({
              id: row.id,
              name: row.name,
              description: row.description,
              content: row.content,
              source: row.source,
              isEnabled: Boolean(row.is_enabled),
              icon: row.icon,
              category: row.category,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            })),
            settings: settingsRows.reduce((acc, row) => {
              acc[row.key] = {
                value: row.value,
                updatedAt: row.updated_at,
              };
              return acc;
            }, {} as Record<string, { value: string; updatedAt: number }>),
          },
        };

        return {
          success: true,
          data: exportData,
        };
      } catch (error) {
        console.error("[ipc-handlers] data:exportSimple failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to export data",
        };
      }
    }
  );

  // data:import - 从文件导入数据
  ipcMain.handle(
    "data:import",
    async (
      _,
      filePath: string,
      options?: {
        strategy?: "merge" | "overwrite" | "add_only";
        conflictResolution?: "keep_local" | "keep_remote" | "keep_newer";
        include?: {
          sessions?: boolean;
          messages?: boolean;
          tags?: boolean;
          memories?: boolean;
          archivalMemories?: boolean;
          skills?: boolean;
          settings?: boolean;
        };
        dryRun?: boolean;
      }
    ) => {
      try {
        const { importData } = await import("../libs/data-import.js");

        const result = await importData(db, filePath, options);
        return {
          success: result.success,
          data: result.success
            ? {
                stats: result.stats,
                warnings: result.warnings,
                conflicts: result.conflicts,
                duration: result.duration,
                dryRun: result.dryRun
              }
            : undefined,
          error: result.error
        };
      } catch (error) {
        console.error("[ipc-handlers] data:import failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to import data"
        };
      }
    }
  );

  // data:importSimple - 从前端 JSON 备份导入数据
  ipcMain.handle(
    "data:importSimple",
    async (
      _,
      simpleData: unknown,
      options?: {
        strategy?: "merge" | "overwrite" | "add_only";
        conflictResolution?: "keep_local" | "keep_remote" | "keep_newer";
        include?: {
          sessions?: boolean;
          messages?: boolean;
          tags?: boolean;
          memories?: boolean;
          archivalMemories?: boolean;
          skills?: boolean;
          settings?: boolean;
        };
        dryRun?: boolean;
      },
    ) => {
      const tempFilePath = join(
        app.getPath("temp"),
        `cherry-agent-import-${Date.now()}-${randomBytes(4).toString("hex")}.cowork-export`,
      );

      try {
        const { importData } = await import("../libs/data-import.js");
        const archive = buildSimpleArchive(simpleData);
        writeFileSync(tempFilePath, JSON.stringify(archive), "utf8");

        const result = await importData(db, tempFilePath, options);
        return {
          success: result.success,
          data: result.success
            ? {
                stats: result.stats,
                warnings: result.warnings,
                conflicts: result.conflicts,
                duration: result.duration,
                dryRun: result.dryRun,
              }
            : undefined,
          error: result.error,
        };
      } catch (error) {
        console.error("[ipc-handlers] data:importSimple failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to import simple data",
        };
      } finally {
        try {
          unlinkSync(tempFilePath);
        } catch {
          // ignore cleanup failure
        }
      }
    },
  );

  // data:validate - 验证导入文件
  ipcMain.handle("data:validate", async (_, filePath: string) => {
    try {
      const { validateImportFile } = await import("../libs/data-import.js");

      const result = await validateImportFile(db, filePath);
      return {
        success: result.success,
        data: result.success
          ? {
              warnings: result.warnings,
              duration: result.duration
            }
          : undefined,
        error: result.error
      };
    } catch (error) {
      console.error("[ipc-handlers] data:validate failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to validate import file"
      };
    }
  });

  console.info("[ipc-handlers] Data handlers registered");
}
