/**
 * Simple Memory Store - 单一 Markdown 用户记忆
 *
 * 只存全局用户级记忆：一条 Markdown 文本
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { CloudSyncService } from "./cloud-sync.js";

const DEFAULT_ID = "default";
const MEMORY_SETTING_KEY = "user_memory_markdown";

export class SimpleMemoryStore {
  private db: BetterSqlite3.Database;
  private syncService?: CloudSyncService;

  constructor(db: BetterSqlite3.Database, syncService?: CloudSyncService) {
    this.db = db;
    this.syncService = syncService;
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_memory (
        id TEXT PRIMARY KEY DEFAULT '${DEFAULT_ID}',
        content TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      )
    `);

    // local_settings 用于跨设备同步记忆
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 确保有一条默认 user_memory 记录
    const memoryRow = this.db
      .prepare("SELECT content, updated_at FROM user_memory WHERE id = ?")
      .get(DEFAULT_ID) as { content?: string; updated_at?: number } | undefined;
    const now = Date.now();

    if (!memoryRow) {
      this.upsertUserMemory("", now);
    }

    // 保证 local_settings 中存在一份可同步的记忆副本，并以其为准回填 user_memory
    const settingRow = this.db
      .prepare("SELECT value, updated_at FROM local_settings WHERE key = ?")
      .get(MEMORY_SETTING_KEY) as { value?: string; updated_at?: number } | undefined;

    if (!settingRow) {
      const fallbackContent = memoryRow?.content ?? "";
      const fallbackUpdatedAt = memoryRow?.updated_at ?? now;
      this.upsertMemorySetting(fallbackContent, fallbackUpdatedAt);
      return;
    }

    const syncedContent = this.decodeSettingValue(settingRow.value ?? "");
    const syncedUpdatedAt = settingRow.updated_at ?? now;
    this.upsertUserMemory(syncedContent, syncedUpdatedAt);
  }

  get(): { content: string; updatedAt: number | null } {
    try {
      const settingRow = this.db
        .prepare("SELECT value, updated_at FROM local_settings WHERE key = ?")
        .get(MEMORY_SETTING_KEY) as { value?: string; updated_at?: number } | undefined;

      if (settingRow) {
        const content = this.decodeSettingValue(settingRow.value ?? "");
        const updatedAt = settingRow.updated_at ?? Date.now();
        this.upsertUserMemory(content, updatedAt);
        return { content, updatedAt };
      }

      const memoryRow = this.db
        .prepare("SELECT content, updated_at FROM user_memory WHERE id = ?")
        .get(DEFAULT_ID) as { content?: string; updated_at?: number } | undefined;

      return {
        content: memoryRow?.content ?? "",
        updatedAt: memoryRow?.updated_at ?? null,
      };
    } catch (error) {
      console.error("[simple-memory-store] get() failed:", error);
      return { content: "", updatedAt: null };
    }
  }

  set(content: string): void {
    try {
      const current = this.get();
      if (current.content === content) {
        return;
      }

      const now = Date.now();

      this.upsertUserMemory(content, now);
      this.upsertMemorySetting(content, now);

      if (this.syncService) {
        this.syncService.recordChange("setting", MEMORY_SETTING_KEY, "update", {
          key: MEMORY_SETTING_KEY,
          value: JSON.stringify(content),
          updatedAt: now,
        });
      }
    } catch (error) {
      console.error("[simple-memory-store] set() failed:", error);
    }
  }

  clear(): void {
    this.set("");
  }

  private upsertUserMemory(content: string, updatedAt: number): void {
    this.db
      .prepare(`
        INSERT INTO user_memory (id, content, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET content = ?, updated_at = ?
      `)
      .run(DEFAULT_ID, content, updatedAt, content, updatedAt);
  }

  private upsertMemorySetting(content: string, updatedAt: number): void {
    this.db
      .prepare(`
        INSERT INTO local_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
      `)
      .run(
        MEMORY_SETTING_KEY,
        JSON.stringify(content),
        updatedAt,
        JSON.stringify(content),
        updatedAt
      );
  }

  private decodeSettingValue(rawValue: string): string {
    try {
      const parsed = JSON.parse(rawValue);
      return typeof parsed === "string" ? parsed : rawValue;
    } catch {
      return rawValue;
    }
  }
}

export default SimpleMemoryStore;
