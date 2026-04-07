/**
 * Data Export Module - 数据导出功能
 *
 * 功能:
 * - 导出会话、消息、标签、记忆、技能、设置到 ZIP 文件
 * - 生成 manifest.json 包含版本信息和数据校验
 * - 支持进度回调
 * - 大文件分块处理
 *
 * 性能说明：
 * - 所有文件写入均使用 fs.promises（异步），不阻塞 Electron 主进程事件循环
 * - createArchive 并行读取所有临时文件，再异步写入最终归档
 * - cleanup 并行删除所有临时文件
 */

import fs from "fs";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { app } from "electron";
import type * as BetterSqlite3 from "better-sqlite3";
import type { StoredSession, Tag } from "./session-store.js";
import type { MemoryBlock, ArchivalMemory, Skill, LocalSetting } from "../types/local-db.js";
import type { StreamMessage } from "../types.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 导出选项
 */
export interface ExportOptions {
  /** 导出目标目录 */
  outputDir?: string;
  /** 导出文件名（不含扩展名） */
  fileName?: string;
  /** 要导出的数据类型 */
  include?: {
    sessions?: boolean;
    messages?: boolean;
    tags?: boolean;
    memories?: boolean;
    archivalMemories?: boolean;
    skills?: boolean;
    settings?: boolean;
  };
  /** 进度回调 */
  onProgress?: (progress: ExportProgress) => void;
  /** 是否压缩 JSON 数据 */
  minifyJson?: boolean;
}

/**
 * 导出进度
 */
export interface ExportProgress {
  /** 当前阶段 */
  stage: ExportStage;
  /** 当前阶段进度 (0-100) */
  progress: number;
  /** 当前处理的项目 */
  currentItem?: string;
  /** 总项目数 */
  totalItems?: number;
  /** 已处理项目数 */
  processedItems?: number;
}

/**
 * 导出阶段
 */
export type ExportStage =
  | "preparing"
  | "exporting_sessions"
  | "exporting_messages"
  | "exporting_tags"
  | "exporting_memories"
  | "exporting_archival_memories"
  | "exporting_skills"
  | "exporting_settings"
  | "generating_manifest"
  | "creating_archive"
  | "completed";

/**
 * 导出清单 (manifest)
 */
export interface ExportManifest {
  /** 版本号 */
  version: string;
  /** 导出时间 */
  exportedAt: number;
  /** 应用版本 */
  appVersion: string;
  /** 数据库版本 */
  dbVersion: number;
  /** 数据统计 */
  stats: {
    sessions: number;
    messages: number;
    tags: number;
    memoryBlocks: number;
    archivalMemories: number;
    skills: number;
    settings: number;
  };
  /** 文件校验和 */
  checksums: Record<string, string>;
  /** 平台信息 */
  platform: string;
}

/**
 * 导出结果
 */
export interface ExportResult {
  success: boolean;
  /** 导出文件路径 */
  filePath?: string;
  /** 导出的数据统计 */
  stats?: ExportManifest["stats"];
  /** 错误信息 */
  error?: string;
  /** 耗时（毫秒） */
  duration?: number;
}

/**
 * 导出的消息数据结构
 */
interface ExportedMessage {
  id: string;
  sessionId: string;
  data: StreamMessage;
  createdAt: number;
}

/**
 * 导出的会话标签关联
 */
interface ExportedSessionTag {
  sessionId: string;
  tagId: string;
  createdAt: number;
}

// ============================================================================
// 常量
// ============================================================================

/** 导出格式版本 */
const EXPORT_VERSION = "1.0.0";

/** 分块大小 (用于大数据分块处理)，控制单次从 SQLite 读取的行数 */
const CHUNK_SIZE = 500;

/** 所有导出的临时文件名（顺序固定，保持可预测性） */
const TEMP_FILES = [
  "manifest.json",
  "sessions.json",
  "messages.jsonl",
  "tags.json",
  "session_tags.json",
  "memory_blocks.json",
  "archival_memories.json",
  "skills.json",
  "settings.json"
] as const;

/** 默认包含的数据类型 */
const DEFAULT_INCLUDE = {
  sessions: true,
  messages: true,
  tags: true,
  memories: true,
  archivalMemories: true,
  skills: true,
  settings: true
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 计算文件内容的 SHA256 校验和
 */
function calculateChecksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * 生成导出文件名
 */
function generateExportFileName(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "");
  return `cowork-export-${dateStr}-${timeStr}`;
}

/**
 * 确保目录存在（同步，仅在初始化阶段调用一次）
 */
function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 将数据异步写入 JSON 文件，不阻塞事件循环
 * 返回序列化后的内容字符串，供调用方计算校验和
 */
async function writeJsonFile(filePath: string, data: unknown, minify = false): Promise<string> {
  const content = minify ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  await fs.promises.writeFile(filePath, content, "utf8");
  return content;
}

/**
 * 以流式方式将数组逐条写入 JSONL 文件（每行一个 JSON 对象）。
 *
 * 设计要点：
 * - 调用方通过 chunkProvider 按批提供数据，每批写入后立即释放引用，GC 可回收
 * - 使用 fs.createWriteStream + drain 回压控制，避免缓冲区积压
 * - 返回完整文件内容（用于计算校验和）
 *
 * @param filePath   目标文件路径
 * @param chunkProvider  异步生成器，每次 yield 一批行数据（T[]）
 * @returns 完整的文件内容字符串（用于校验和计算）
 */
async function writeJsonlFileStreaming<T>(
  filePath: string,
  chunkProvider: AsyncIterable<T[]>
): Promise<string> {
  const writeStream = fs.createWriteStream(filePath, { encoding: "utf8" });

  // 将 stream write 包装为 Promise，支持回压
  const writeChunk = (chunk: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const ok = writeStream.write(chunk, "utf8");
      if (ok) {
        resolve();
      } else {
        writeStream.once("drain", resolve);
        writeStream.once("error", reject);
      }
    });

  const closeStream = (): Promise<void> =>
    new Promise((resolve, reject) => {
      writeStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });

  // 收集所有行片段，用于最终返回完整内容字符串（供调用方计算校验和）
  const parts: string[] = [];

  try {
    for await (const rows of chunkProvider) {
      for (const row of rows) {
        const line = JSON.stringify(row) + "\n";
        parts.push(line);
        await writeChunk(line);
      }
    }
    await closeStream();
  } catch (err) {
    writeStream.destroy();
    throw err;
  }

  return parts.join("");
}

// ============================================================================
// 数据导出类
// ============================================================================

/**
 * DataExporter 类
 * 负责将应用数据导出为归档文件，全程异步 I/O，不阻塞 Electron 主进程
 */
export class DataExporter {
  private db: BetterSqlite3.Database;
  private options: Required<ExportOptions>;
  private tempDir: string;
  private stats: ExportManifest["stats"];
  private checksums: Record<string, string>;

  constructor(db: BetterSqlite3.Database, options: ExportOptions = {}) {
    this.db = db;
    this.options = {
      outputDir: options.outputDir ?? join(app.getPath("documents"), "Cowork Exports"),
      fileName: options.fileName ?? generateExportFileName(),
      include: { ...DEFAULT_INCLUDE, ...options.include },
      onProgress: options.onProgress ?? (() => {}),
      minifyJson: options.minifyJson ?? false
    };
    this.tempDir = join(app.getPath("temp"), `cowork-export-${Date.now()}`);
    this.stats = {
      sessions: 0,
      messages: 0,
      tags: 0,
      memoryBlocks: 0,
      archivalMemories: 0,
      skills: 0,
      settings: 0
    };
    this.checksums = {};
  }

  /**
   * 执行导出
   */
  async export(): Promise<ExportResult> {
    const startTime = Date.now();

    try {
      // 准备阶段（目录创建是轻量同步操作，只执行一次）
      this.emitProgress("preparing", 0);
      ensureDir(this.tempDir);
      ensureDir(this.options.outputDir);

      // 导出各类数据
      if (this.options.include.sessions) {
        await this.exportSessions();
      }

      if (this.options.include.messages) {
        await this.exportMessages();
      }

      if (this.options.include.tags) {
        await this.exportTags();
      }

      if (this.options.include.memories) {
        await this.exportMemoryBlocks();
      }

      if (this.options.include.archivalMemories) {
        await this.exportArchivalMemories();
      }

      if (this.options.include.skills) {
        await this.exportSkills();
      }

      if (this.options.include.settings) {
        await this.exportSettings();
      }

      // 生成 manifest
      this.emitProgress("generating_manifest", 0);
      await this.generateManifest();

      // 创建归档
      this.emitProgress("creating_archive", 0);
      const zipPath = await this.createArchive();

      // 清理临时文件
      await this.cleanup();

      this.emitProgress("completed", 100);

      return {
        success: true,
        filePath: zipPath,
        stats: this.stats,
        duration: Date.now() - startTime
      };
    } catch (error) {
      // 清理临时文件（忽略清理失败）
      await this.cleanup();

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 导出会话数据
   */
  private async exportSessions(): Promise<void> {
    this.emitProgress("exporting_sessions", 0);

    const sessions = this.db
      .prepare(
        `SELECT id, title, claude_session_id, status, cwd, allowed_tools,
                active_skill_ids, skill_mode, permission_mode, last_prompt, is_pinned, is_archived,
                provider, provider_thread_id, runtime,
                created_at, updated_at
         FROM sessions
         ORDER BY created_at ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const mappedSessions: StoredSession[] = sessions.map((row) => {
      const providerRaw = row.provider ? String(row.provider) : undefined;
      const provider: 'claude' | 'codex' = providerRaw === 'codex' ? 'codex' : 'claude';
      return {
        id: String(row.id),
        title: String(row.title),
        status: row.status as StoredSession["status"],
        cwd: row.cwd ? String(row.cwd) : undefined,
        allowedTools: row.allowed_tools ? String(row.allowed_tools) : undefined,
        activeSkillIds: row.active_skill_ids
          ? (() => {
              try {
                const parsed = JSON.parse(String(row.active_skill_ids));
                return Array.isArray(parsed) ? parsed.map((item) => String(item)) : undefined;
              } catch {
                return String(row.active_skill_ids)
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean);
              }
            })()
          : undefined,
        skillMode: row.skill_mode ? (String(row.skill_mode) as "manual" | "auto") : undefined,
        permissionMode: row.permission_mode
          ? (String(row.permission_mode) as StoredSession["permissionMode"])
          : undefined,
        lastPrompt: row.last_prompt ? String(row.last_prompt) : undefined,
        claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        isPinned: Boolean(row.is_pinned),
        isArchived: Boolean(row.is_archived),
        provider,
        providerThreadId: row.provider_thread_id ? String(row.provider_thread_id) : undefined,
        runtime: row.runtime ? String(row.runtime) : (provider === 'codex' ? 'codex-sdk' : 'claude-sdk')
      };
    });

    this.stats.sessions = mappedSessions.length;
    const filePath = join(this.tempDir, "sessions.json");
    const content = await writeJsonFile(filePath, mappedSessions, this.options.minifyJson);
    this.checksums["sessions.json"] = calculateChecksum(content);

    this.emitProgress("exporting_sessions", 100, undefined, mappedSessions.length, mappedSessions.length);
  }

  /**
   * 导出消息数据（流式分块写入 JSONL，内存峰值 O(CHUNK_SIZE) 而非 O(N)）
   *
   * 文件格式：JSONL（每行一个 JSON 对象），文件名 messages.jsonl
   * 导入端 data-import.ts 已同步更新为按行解析，兼容此格式。
   */
  private async exportMessages(): Promise<void> {
    this.emitProgress("exporting_messages", 0);

    const countResult = this.db
      .prepare("SELECT COUNT(*) as count FROM messages")
      .get() as { count: number };
    const totalMessages = countResult.count;

    if (totalMessages === 0) {
      // 空文件：写入空内容，校验和为空字符串的哈希
      const filePath = join(this.tempDir, "messages.jsonl");
      await fs.promises.writeFile(filePath, "", "utf8");
      this.checksums["messages.jsonl"] = calculateChecksum("");
      this.stats.messages = 0;
      return;
    }

    // 异步生成器：按批从 DB 读取，每批只持有 CHUNK_SIZE 条记录
    const self = this;
    async function* messageChunks(): AsyncIterable<ExportedMessage[]> {
      let offset = 0;
      let processedCount = 0;

      while (offset < totalMessages) {
        const rows = self.db
          .prepare(
            `SELECT id, session_id, data, created_at
             FROM messages
             ORDER BY created_at ASC
             LIMIT ? OFFSET ?`
          )
          .all(CHUNK_SIZE, offset) as Array<Record<string, unknown>>;

        const batch: ExportedMessage[] = [];
        for (const row of rows) {
          let messageData: StreamMessage;
          try {
            messageData = JSON.parse(String(row.data)) as StreamMessage;
          } catch {
            continue; // 跳过无法解析的消息
          }
          batch.push({
            id: String(row.id),
            sessionId: String(row.session_id),
            data: messageData,
            createdAt: Number(row.created_at)
          });
          processedCount++;
        }

        if (batch.length > 0) {
          yield batch;
        }

        offset += CHUNK_SIZE;
        const progress = Math.min(99, Math.round((offset / totalMessages) * 100));
        self.emitProgress("exporting_messages", progress, undefined, totalMessages, processedCount);
      }
    }

    const filePath = join(this.tempDir, "messages.jsonl");
    const content = await writeJsonlFileStreaming(filePath, messageChunks());
    this.checksums["messages.jsonl"] = calculateChecksum(content);
    this.stats.messages = totalMessages;

    this.emitProgress("exporting_messages", 100, undefined, totalMessages, totalMessages);
  }

  /**
   * 导出标签数据
   */
  private async exportTags(): Promise<void> {
    this.emitProgress("exporting_tags", 0);

    // 导出标签
    const tags = this.db
      .prepare("SELECT id, name, color, created_at FROM tags ORDER BY name")
      .all() as Array<Record<string, unknown>>;

    const mappedTags: Tag[] = tags.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      color: String(row.color),
      createdAt: Number(row.created_at)
    }));

    // 导出会话-标签关联
    const sessionTags = this.db
      .prepare("SELECT session_id, tag_id, created_at FROM session_tags")
      .all() as Array<Record<string, unknown>>;

    const mappedSessionTags: ExportedSessionTag[] = sessionTags.map((row) => ({
      sessionId: String(row.session_id),
      tagId: String(row.tag_id),
      createdAt: Number(row.created_at)
    }));

    this.stats.tags = mappedTags.length;

    // 两个文件并行写入，缩短总耗时
    const [tagsContent, sessionTagsContent] = await Promise.all([
      writeJsonFile(join(this.tempDir, "tags.json"), mappedTags, this.options.minifyJson),
      writeJsonFile(join(this.tempDir, "session_tags.json"), mappedSessionTags, this.options.minifyJson)
    ]);
    this.checksums["tags.json"] = calculateChecksum(tagsContent);
    this.checksums["session_tags.json"] = calculateChecksum(sessionTagsContent);

    this.emitProgress("exporting_tags", 100);
  }

  /**
   * 导出记忆块数据
   */
  private async exportMemoryBlocks(): Promise<void> {
    this.emitProgress("exporting_memories", 0);

    const memoryBlocks = this.db
      .prepare(
        `SELECT id, label, description, value, char_limit, created_at, updated_at
         FROM memory_blocks
         ORDER BY created_at ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const mappedBlocks: MemoryBlock[] = memoryBlocks.map((row) => ({
      id: String(row.id),
      label: String(row.label),
      description: String(row.description),
      value: String(row.value),
      charLimit: Number(row.char_limit),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }));

    this.stats.memoryBlocks = mappedBlocks.length;
    const filePath = join(this.tempDir, "memory_blocks.json");
    const content = await writeJsonFile(filePath, mappedBlocks, this.options.minifyJson);
    this.checksums["memory_blocks.json"] = calculateChecksum(content);

    this.emitProgress("exporting_memories", 100);
  }

  /**
   * 导出归档记忆数据
   */
  private async exportArchivalMemories(): Promise<void> {
    this.emitProgress("exporting_archival_memories", 0);

    const archivalMemories = this.db
      .prepare(
        `SELECT id, content, source_session_id, tags, created_at
         FROM archival_memories
         ORDER BY created_at ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const mappedMemories: Omit<ArchivalMemory, "embedding">[] = archivalMemories.map((row) => {
      let tags: string[] = [];
      try {
        tags = JSON.parse(String(row.tags)) as string[];
      } catch {
        tags = [];
      }

      return {
        id: String(row.id),
        content: String(row.content),
        sourceSessionId: row.source_session_id ? String(row.source_session_id) : undefined,
        tags,
        createdAt: Number(row.created_at)
      };
    });

    this.stats.archivalMemories = mappedMemories.length;
    const filePath = join(this.tempDir, "archival_memories.json");
    const content = await writeJsonFile(filePath, mappedMemories, this.options.minifyJson);
    this.checksums["archival_memories.json"] = calculateChecksum(content);

    this.emitProgress("exporting_archival_memories", 100);
  }

  /**
   * 导出技能数据
   */
  private async exportSkills(): Promise<void> {
    this.emitProgress("exporting_skills", 0);

    const skills = this.db
      .prepare(
        `SELECT id, name, description, content, source, is_enabled, icon, category, created_at, updated_at
         FROM skills
         ORDER BY name ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const mappedSkills: Skill[] = skills.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      content: String(row.content),
      source: String(row.source) as Skill["source"],
      isEnabled: Boolean(row.is_enabled),
      icon: row.icon ? String(row.icon) : undefined,
      category: String(row.category) as Skill["category"],
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }));

    this.stats.skills = mappedSkills.length;
    const filePath = join(this.tempDir, "skills.json");
    const content = await writeJsonFile(filePath, mappedSkills, this.options.minifyJson);
    this.checksums["skills.json"] = calculateChecksum(content);

    this.emitProgress("exporting_skills", 100);
  }

  /**
   * 导出设置数据
   */
  private async exportSettings(): Promise<void> {
    this.emitProgress("exporting_settings", 0);

    // 检查设置表是否存在
    const tableExists = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='local_settings'"
      )
      .get();

    let mappedSettings: LocalSetting[] = [];

    if (tableExists) {
      const settings = this.db
        .prepare("SELECT key, value, updated_at FROM local_settings")
        .all() as Array<Record<string, unknown>>;

      mappedSettings = settings.map((row) => ({
        key: String(row.key),
        value: String(row.value),
        updatedAt: Number(row.updated_at)
      }));
    }

    this.stats.settings = mappedSettings.length;
    const filePath = join(this.tempDir, "settings.json");
    const content = await writeJsonFile(filePath, mappedSettings, this.options.minifyJson);
    this.checksums["settings.json"] = calculateChecksum(content);

    this.emitProgress("exporting_settings", 100);
  }

  /**
   * 生成导出清单
   */
  private async generateManifest(): Promise<void> {
    const manifest: ExportManifest = {
      version: EXPORT_VERSION,
      exportedAt: Date.now(),
      appVersion: app.getVersion(),
      dbVersion: this.getDbVersion(),
      stats: this.stats,
      checksums: this.checksums,
      platform: process.platform
    };

    const filePath = join(this.tempDir, "manifest.json");
    await writeJsonFile(filePath, manifest, false); // manifest 始终格式化

    this.emitProgress("generating_manifest", 100);
  }

  /**
   * 获取数据库版本
   */
  private getDbVersion(): number {
    try {
      const result = this.db
        .prepare("SELECT MAX(version) as version FROM migrations")
        .get() as { version: number } | undefined;
      return result?.version ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * 创建归档文件
   *
   * 归档格式：JSON 对象，key 为文件名，value 为文件内容字符串。
   * 为避免一次性将所有文件内容读入内存再序列化，改为逐文件流式追加写入：
   * 手动拼接 JSON 对象结构（`{`, key:value, ..., `}`），每次只持有一个文件的内容。
   *
   * messages.jsonl 体积最大，通过流式读取 + 追加的方式将其内存占用降至单次读取量。
   */
  private async createArchive(): Promise<string> {
    const outputPath = join(this.options.outputDir, `${this.options.fileName}.zip`);
    const exportPath = outputPath.replace(".zip", ".cowork-export");

    const writeStream = fs.createWriteStream(exportPath, { encoding: "utf8" });

    const write = (chunk: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const ok = writeStream.write(chunk, "utf8");
        if (ok) resolve();
        else {
          writeStream.once("drain", resolve);
          writeStream.once("error", reject);
        }
      });

    const close = (): Promise<void> =>
      new Promise((resolve, reject) => {
        writeStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
      });

    try {
      await write("{");
      let isFirst = true;

      for (const file of TEMP_FILES) {
        const filePath = join(this.tempDir, file);
        let content: string;
        try {
          content = await fs.promises.readFile(filePath, "utf8");
        } catch {
          // 文件不存在时跳过（部分数据类型可能未导出）
          continue;
        }

        const separator = isFirst ? "" : ",";
        // 手动序列化 key（文件名不含特殊字符，可安全转义）
        await write(`${separator}${JSON.stringify(file)}:${JSON.stringify(content)}`);
        isFirst = false;

        // 写完后立即解除引用，让 GC 尽早回收大字符串
        (content as unknown) = null;
      }

      await write("}");
      await close();
    } catch (err) {
      writeStream.destroy();
      throw err;
    }

    this.emitProgress("creating_archive", 100);
    return exportPath;
  }

  /**
   * 清理临时文件
   * 并行删除所有临时文件，再删除临时目录
   */
  private async cleanup(): Promise<void> {
    try {
      // 并行删除所有临时文件（忽略不存在的文件）
      await Promise.all(
        TEMP_FILES.map((file) =>
          fs.promises.unlink(join(this.tempDir, file)).catch(() => {})
        )
      );

      // 删除临时目录（rm 递归更健壮，不依赖目录为空）
      await fs.promises.rm(this.tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误，不影响导出结果
    }
  }

  /**
   * 发送进度事件
   */
  private emitProgress(
    stage: ExportStage,
    progress: number,
    currentItem?: string,
    totalItems?: number,
    processedItems?: number
  ): void {
    this.options.onProgress({
      stage,
      progress,
      currentItem,
      totalItems,
      processedItems
    });
  }
}

// ============================================================================
// 导出函数
// ============================================================================

/**
 * 导出数据到文件
 *
 * @param db - 数据库实例
 * @param options - 导出选项
 * @returns 导出结果
 */
export async function exportData(
  db: BetterSqlite3.Database,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const exporter = new DataExporter(db, options);
  return exporter.export();
}

export default { exportData, DataExporter };
