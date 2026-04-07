/**
 * 迁移 004: 创建 Local Settings 系统
 *
 * 变更:
 * - 创建 local_settings 表用于存储本地配置
 * - 支持键值对形式的设置存储
 * - 记录设置更新时间
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 4,
  name: "local-settings",

  up(db: BetterSqlite3.Database): void {
    // 创建 local_settings 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_local_settings_updated_at ON local_settings(updated_at DESC)
    `);

    // 插入默认设置
    const defaultSettings = [
      {
        key: "theme",
        value: JSON.stringify("system") // "light" | "dark" | "system"
      },
      {
        key: "language",
        value: JSON.stringify("zh-CN") // 默认语言
      },
      {
        key: "autoSave",
        value: JSON.stringify(true) // 自动保存会话
      },
      {
        key: "maxHistoryItems",
        value: JSON.stringify(100) // 最大历史记录数
      },
      {
        key: "enableTelemetry",
        value: JSON.stringify(false) // 遥测开关
      },
      {
        key: "editorFontSize",
        value: JSON.stringify(14) // 编辑器字体大小
      },
      {
        key: "editorFontFamily",
        value: JSON.stringify("'Fira Code', 'SF Mono', Menlo, monospace") // 编辑器字体
      },
      {
        key: "sendOnEnter",
        value: JSON.stringify(true) // Enter 发送消息
      },
      {
        key: "showTimestamps",
        value: JSON.stringify(true) // 显示消息时间戳
      },
      {
        key: "compactMode",
        value: JSON.stringify(false) // 紧凑模式
      },
      {
        key: "sidebarWidth",
        value: JSON.stringify(280) // 侧边栏宽度
      },
      {
        key: "windowBounds",
        value: JSON.stringify(null) // 窗口位置和大小
      },
      {
        key: "recentProjects",
        value: JSON.stringify([]) // 最近打开的项目
      },
      {
        key: "shortcuts",
        value: JSON.stringify({
          newSession: "CommandOrControl+N",
          closeSession: "CommandOrControl+W",
          search: "CommandOrControl+F",
          settings: "CommandOrControl+,",
          toggleSidebar: "CommandOrControl+B"
        }) // 快捷键配置
      },
      {
        key: "apiConfig",
        value: JSON.stringify({
          endpoint: null, // 自定义 API 端点
          timeout: 60000, // 请求超时时间
          maxRetries: 3 // 最大重试次数
        }) // API 配置
      },
      {
        key: "memoryConfig",
        value: JSON.stringify({
          autoExtract: true, // 自动提取记忆
          extractThreshold: 5, // 提取阈值（消息数）
          maxArchivalMemories: 1000 // 最大归档记忆数
        }) // 记忆配置
      }
    ];

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO local_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);

    const now = Date.now();
    for (const setting of defaultSettings) {
      insertStmt.run(setting.key, setting.value, now);
    }
  },

  down(db: BetterSqlite3.Database): void {
    // 删除索引
    db.exec(`DROP INDEX IF EXISTS idx_local_settings_updated_at`);

    // 删除表
    db.exec(`DROP TABLE IF EXISTS local_settings`);
  }
};

export default migration;
