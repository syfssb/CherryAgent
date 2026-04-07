/**
 * Data Import Module - 数据导入功能
 *
 * 功能:
 * - 从 ZIP/导出文件导入数据
 * - 验证文件完整性和版本兼容性
 * - 支持多种导入策略 (合并/覆盖/仅新增)
 * - 冲突处理和错误恢复
 * - 进度回调
 */

import { existsSync, readFileSync } from "fs";
import { createHash } from "crypto";
import type * as BetterSqlite3 from "better-sqlite3";
import type { StoredSession, Tag } from "./session-store.js";
import type { MemoryBlock, ArchivalMemory, Skill, LocalSetting } from "../types/local-db.js";
import type { StreamMessage } from "../types.js";
import type { ExportManifest, ExportProgress, ExportStage } from "./data-export.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 导入策略
 */
export type ImportStrategy = "merge" | "overwrite" | "add_only";

/**
 * 冲突解决策略
 */
export type ConflictResolution = "keep_local" | "keep_remote" | "keep_newer" | "skip";

/**
 * 导入选项
 */
export interface ImportOptions {
  /** 导入策略 */
  strategy?: ImportStrategy;
  /** 冲突解决策略 */
  conflictResolution?: ConflictResolution;
  /** 要导入的数据类型 */
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
  onProgress?: (progress: ImportProgress) => void;
  /** 冲突回调 (用于交互式解决) */
  onConflict?: (conflict: ConflictInfo) => Promise<ConflictResolution>;
  /** 是否执行验证但不实际导入 (dry run) */
  dryRun?: boolean;
  /** 是否在出错时回滚 */
  rollbackOnError?: boolean;
}

/**
 * 导入进度
 */
export interface ImportProgress {
  /** 当前阶段 */
  stage: ImportStage;
  /** 当前阶段进度 (0-100) */
  progress: number;
  /** 当前处理的项目 */
  currentItem?: string;
  /** 总项目数 */
  totalItems?: number;
  /** 已处理项目数 */
  processedItems?: number;
  /** 跳过的项目数 */
  skippedItems?: number;
  /** 冲突数 */
  conflictCount?: number;
}

/**
 * 导入阶段
 */
export type ImportStage =
  | "validating"
  | "reading_archive"
  | "importing_tags"
  | "importing_sessions"
  | "importing_messages"
  | "importing_session_tags"
  | "importing_memories"
  | "importing_archival_memories"
  | "importing_skills"
  | "importing_settings"
  | "finalizing"
  | "completed"
  | "rolled_back";

/**
 * 冲突信息
 */
export interface ConflictInfo {
  /** 冲突类型 */
  type: "session" | "tag" | "memory" | "skill" | "setting";
  /** 本地数据 */
  local: unknown;
  /** 远程数据 */
  remote: unknown;
  /** 冲突的 ID */
  id: string;
  /** 冲突描述 */
  description: string;
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  /** 导入的数据统计 */
  stats?: ImportStats;
  /** 错误信息 */
  error?: string;
  /** 警告信息 */
  warnings?: string[];
  /** 冲突列表 */
  conflicts?: ConflictInfo[];
  /** 耗时（毫秒） */
  duration?: number;
  /** 是否为 dry run */
  dryRun?: boolean;
}

/**
 * 导入统计
 */
export interface ImportStats {
  sessions: { imported: number; skipped: number; updated: number };
  messages: { imported: number; skipped: number };
  tags: { imported: number; skipped: number; updated: number };
  memoryBlocks: { imported: number; skipped: number; updated: number };
  archivalMemories: { imported: number; skipped: number };
  skills: { imported: number; skipped: number; updated: number };
  settings: { imported: number; skipped: number; updated: number };
}

/**
 * 导出文件中的消息结构
 */
interface ExportedMessage {
  id: string;
  sessionId: string;
  data: StreamMessage;
  createdAt: number;
}

/**
 * 导出文件中的会话标签关联
 */
interface ExportedSessionTag {
  sessionId: string;
  tagId: string;
  createdAt: number;
}

/**
 * 归档数据结构
 * messages 字段支持新版 JSONL 格式（messages.jsonl）和旧版 JSON 数组格式（messages.json）
 */
interface ArchiveData {
  "manifest.json"?: string;
  "sessions.json"?: string;
  /** 新版格式：JSONL，每行一个消息对象 */
  "messages.jsonl"?: string;
  /** 旧版格式：JSON 数组，向后兼容 */
  "messages.json"?: string;
  "tags.json"?: string;
  "session_tags.json"?: string;
  "memory_blocks.json"?: string;
  "archival_memories.json"?: string;
  "skills.json"?: string;
  "settings.json"?: string;
}

// ============================================================================
// 常量
// ============================================================================

/** 支持的导出格式版本 */
const SUPPORTED_VERSIONS = ["1.0.0"];

/** 默认导入选项 */
const DEFAULT_OPTIONS: Required<Omit<ImportOptions, "onProgress" | "onConflict">> = {
  strategy: "merge",
  conflictResolution: "keep_newer",
  include: {
    sessions: true,
    messages: true,
    tags: true,
    memories: true,
    archivalMemories: true,
    skills: true,
    settings: true
  },
  dryRun: false,
  rollbackOnError: true
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 计算字符串的 SHA256 校验和
 */
function calculateChecksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * 验证校验和
 */
function verifyChecksum(content: string, expectedChecksum: string): boolean {
  return calculateChecksum(content) === expectedChecksum;
}

/**
 * 安全解析 JSON
 */
function safeParseJson<T>(content: string, defaultValue: T): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

// ============================================================================
// 数据导入类
// ============================================================================

/**
 * DataImporter 类
 * 负责从导出文件导入数据
 */
export class DataImporter {
  private db: BetterSqlite3.Database;
  private options: Required<Omit<ImportOptions, "onProgress" | "onConflict">> & {
    onProgress: (progress: ImportProgress) => void;
    onConflict?: (conflict: ConflictInfo) => Promise<ConflictResolution>;
  };
  private archiveData: ArchiveData;
  private manifest: ExportManifest | null;
  private stats: ImportStats;
  private warnings: string[];
  private conflicts: ConflictInfo[];

  constructor(db: BetterSqlite3.Database, options: ImportOptions = {}) {
    this.db = db;
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      include: { ...DEFAULT_OPTIONS.include, ...options.include },
      onProgress: options.onProgress ?? (() => {})
    };
    if (options.onConflict) {
      this.options.onConflict = options.onConflict;
    }
    this.archiveData = {};
    this.manifest = null;
    this.stats = this.createEmptyStats();
    this.warnings = [];
    this.conflicts = [];
  }

  /**
   * 创建空的统计对象
   */
  private createEmptyStats(): ImportStats {
    return {
      sessions: { imported: 0, skipped: 0, updated: 0 },
      messages: { imported: 0, skipped: 0 },
      tags: { imported: 0, skipped: 0, updated: 0 },
      memoryBlocks: { imported: 0, skipped: 0, updated: 0 },
      archivalMemories: { imported: 0, skipped: 0 },
      skills: { imported: 0, skipped: 0, updated: 0 },
      settings: { imported: 0, skipped: 0, updated: 0 }
    };
  }

  /**
   * 执行导入
   */
  async import(filePath: string): Promise<ImportResult> {
    const startTime = Date.now();

    try {
      // 验证文件
      this.emitProgress("validating", 0);
      await this.validateFile(filePath);

      // 读取归档
      this.emitProgress("reading_archive", 0);
      await this.readArchive(filePath);

      // 验证清单
      this.emitProgress("validating", 50);
      await this.validateManifest();

      // 验证数据完整性
      this.emitProgress("validating", 75);
      await this.validateChecksums();

      if (this.options.dryRun) {
        // 仅验证，不实际导入
        this.emitProgress("completed", 100);
        return {
          success: true,
          stats: this.stats,
          warnings: this.warnings,
          duration: Date.now() - startTime,
          dryRun: true
        };
      }

      // 开始事务
      const transaction = this.db.transaction(() => {
        // 按依赖顺序导入
        if (this.options.include.tags) {
          this.importTags();
        }

        if (this.options.include.sessions) {
          this.importSessions();
        }

        if (this.options.include.messages) {
          this.importMessages();
        }

        if (this.options.include.tags) {
          this.importSessionTags();
        }

        if (this.options.include.memories) {
          this.importMemoryBlocks();
        }

        if (this.options.include.archivalMemories) {
          this.importArchivalMemories();
        }

        if (this.options.include.skills) {
          this.importSkills();
        }

        if (this.options.include.settings) {
          this.importSettings();
        }
      });

      try {
        transaction();
      } catch (error) {
        if (this.options.rollbackOnError) {
          this.emitProgress("rolled_back", 100);
          throw error;
        }
        this.warnings.push(`Import partially failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      this.emitProgress("completed", 100);

      return {
        success: true,
        stats: this.stats,
        warnings: this.warnings.length > 0 ? this.warnings : undefined,
        conflicts: this.conflicts.length > 0 ? this.conflicts : undefined,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        warnings: this.warnings.length > 0 ? this.warnings : undefined,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 验证文件是否存在且可读
   */
  private async validateFile(filePath: string): Promise<void> {
    if (!existsSync(filePath)) {
      throw new Error(`Import file not found: ${filePath}`);
    }

    // 检查文件扩展名
    if (!filePath.endsWith(".cowork-export") && !filePath.endsWith(".zip")) {
      throw new Error("Unsupported file format. Expected .cowork-export or .zip file");
    }
  }

  /**
   * 读取归档文件
   */
  private async readArchive(filePath: string): Promise<void> {
    try {
      const content = readFileSync(filePath, "utf8");
      this.archiveData = JSON.parse(content) as ArchiveData;
      this.emitProgress("reading_archive", 100);
    } catch (error) {
      throw new Error(`Failed to read archive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 验证清单
   */
  private async validateManifest(): Promise<void> {
    const manifestContent = this.archiveData["manifest.json"];
    if (!manifestContent) {
      throw new Error("Archive is missing manifest.json");
    }

    this.manifest = safeParseJson<ExportManifest | null>(manifestContent, null);
    if (!this.manifest) {
      throw new Error("Invalid manifest.json format");
    }

    // 检查版本兼容性
    if (!SUPPORTED_VERSIONS.includes(this.manifest.version)) {
      throw new Error(
        `Unsupported export version: ${this.manifest.version}. Supported versions: ${SUPPORTED_VERSIONS.join(", ")}`
      );
    }
  }

  /**
   * 验证数据校验和
   */
  private async validateChecksums(): Promise<void> {
    if (!this.manifest) return;

    for (const [fileName, expectedChecksum] of Object.entries(this.manifest.checksums)) {
      const content = this.archiveData[fileName as keyof ArchiveData];
      if (content && !verifyChecksum(content, expectedChecksum)) {
        this.warnings.push(`Checksum mismatch for ${fileName}`);
      }
    }
  }

  /**
   * 导入标签
   */
  private importTags(): void {
    this.emitProgress("importing_tags", 0);

    const content = this.archiveData["tags.json"];
    if (!content) {
      this.emitProgress("importing_tags", 100);
      return;
    }

    const tags = safeParseJson<Tag[]>(content, []);
    const total = tags.length;
    let processed = 0;

    for (const tag of tags) {
      try {
        this.importTag(tag);
        processed++;
      } catch (error) {
        this.warnings.push(`Failed to import tag "${tag.name}": ${error instanceof Error ? error.message : String(error)}`);
        this.stats.tags.skipped++;
      }
      this.emitProgress("importing_tags", Math.round((processed / total) * 100), tag.name, total, processed);
    }
  }

  /**
   * 导入单个标签
   */
  private importTag(tag: Tag): void {
    // 检查是否存在
    const existing = this.db
      .prepare("SELECT id, name, color, created_at FROM tags WHERE id = ? OR name = ?")
      .get(tag.id, tag.name) as Record<string, unknown> | undefined;

    if (existing) {
      if (this.options.strategy === "add_only") {
        this.stats.tags.skipped++;
        return;
      }

      const shouldUpdate = this.shouldUpdate(
        { updatedAt: Number(existing.created_at) },
        { updatedAt: tag.createdAt }
      );

      if (shouldUpdate) {
        this.db
          .prepare("UPDATE tags SET name = ?, color = ?, created_at = ? WHERE id = ?")
          .run(tag.name, tag.color, tag.createdAt, existing.id);
        this.stats.tags.updated++;
      } else {
        this.stats.tags.skipped++;
      }
    } else {
      this.db
        .prepare("INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)")
        .run(tag.id, tag.name, tag.color, tag.createdAt);
      this.stats.tags.imported++;
    }
  }

  /**
   * 导入会话
   */
  private importSessions(): void {
    this.emitProgress("importing_sessions", 0);

    const content = this.archiveData["sessions.json"];
    if (!content) {
      this.emitProgress("importing_sessions", 100);
      return;
    }

    const sessions = safeParseJson<StoredSession[]>(content, []);
    const total = sessions.length;
    let processed = 0;

    for (const session of sessions) {
      try {
        this.importSession(session);
        processed++;
      } catch (error) {
        this.warnings.push(`Failed to import session "${session.title}": ${error instanceof Error ? error.message : String(error)}`);
        this.stats.sessions.skipped++;
      }
      this.emitProgress("importing_sessions", Math.round((processed / total) * 100), session.title, total, processed);
    }
  }

  /**
   * 导入单个会话
   */
  private importSession(session: StoredSession): void {
    const existing = this.db
      .prepare("SELECT id, updated_at FROM sessions WHERE id = ?")
      .get(session.id) as Record<string, unknown> | undefined;

    if (existing) {
      if (this.options.strategy === "add_only") {
        this.stats.sessions.skipped++;
        return;
      }

      const shouldUpdate = this.shouldUpdate(
        { updatedAt: Number(existing.updated_at) },
        { updatedAt: session.updatedAt }
      );

      if (shouldUpdate) {
        this.db
          .prepare(
            `UPDATE sessions SET
              title = ?, claude_session_id = ?, status = ?, cwd = ?,
              allowed_tools = ?, active_skill_ids = ?, skill_mode = ?, permission_mode = ?, last_prompt = ?, is_pinned = ?, is_archived = ?,
              provider = ?, provider_thread_id = ?, runtime = ?,
              created_at = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(
            session.title,
            session.claudeSessionId ?? null,
            session.status,
            session.cwd ?? null,
            session.allowedTools ?? null,
            Array.isArray(session.activeSkillIds)
              ? JSON.stringify(session.activeSkillIds)
              : typeof session.activeSkillIds === "string"
                ? session.activeSkillIds
                : null,
            session.skillMode ?? "auto",
            (session as any).permissionMode ?? "bypassPermissions",
            session.lastPrompt ?? null,
            session.isPinned ? 1 : 0,
            session.isArchived ? 1 : 0,
            (session as any).provider ?? 'claude',
            (session as any).providerThreadId ?? null,
            (session as any).runtime ?? 'claude-sdk',
            session.createdAt,
            session.updatedAt,
            session.id
          );
        this.stats.sessions.updated++;
      } else {
        this.stats.sessions.skipped++;
      }
    } else {
      this.db
        .prepare(
          `INSERT INTO sessions
            (id, title, claude_session_id, status, cwd, allowed_tools, active_skill_ids, skill_mode, permission_mode, last_prompt, is_pinned, is_archived, provider, provider_thread_id, runtime, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          session.id,
          session.title,
          session.claudeSessionId ?? null,
          session.status,
          session.cwd ?? null,
          session.allowedTools ?? null,
          Array.isArray(session.activeSkillIds)
            ? JSON.stringify(session.activeSkillIds)
            : typeof session.activeSkillIds === "string"
              ? session.activeSkillIds
              : null,
          session.skillMode ?? "auto",
          (session as any).permissionMode ?? "bypassPermissions",
          session.lastPrompt ?? null,
          session.isPinned ? 1 : 0,
          session.isArchived ? 1 : 0,
          (session as any).provider ?? 'claude',
          (session as any).providerThreadId ?? null,
          (session as any).runtime ?? 'claude-sdk',
          session.createdAt,
          session.updatedAt
        );
      this.stats.sessions.imported++;
    }
  }

  /**
   * 导入消息
   *
   * 格式兼容策略：
   * 1. 优先读取新版 messages.jsonl（JSONL 格式，每行一个对象）
   * 2. 降级到旧版 messages.json（JSON 数组格式）
   * 两种格式统一转成逐条迭代处理，不在内存中积累完整数组。
   */
  private importMessages(): void {
    this.emitProgress("importing_messages", 0);

    // 优先读取新版 JSONL，降级到旧版 JSON 数组
    const jsonlContent = this.archiveData["messages.jsonl"];
    const jsonContent = this.archiveData["messages.json"];

    if (!jsonlContent && !jsonContent) {
      this.emitProgress("importing_messages", 100);
      return;
    }

    // 统一构建消息迭代器，避免一次性将全部消息放入数组
    const parseMessages = (): ExportedMessage[] => {
      if (jsonlContent !== undefined) {
        // 新版 JSONL：按行解析，过滤空行和解析失败的行
        const messages: ExportedMessage[] = [];
        for (const line of jsonlContent.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            messages.push(JSON.parse(trimmed) as ExportedMessage);
          } catch {
            // 跳过格式异常的行
          }
        }
        return messages;
      }
      // 旧版 JSON 数组
      return safeParseJson<ExportedMessage[]>(jsonContent!, []);
    };

    const messages = parseMessages();
    const total = messages.length;
    let processed = 0;

    for (const message of messages) {
      try {
        this.importMessage(message);
        processed++;
      } catch {
        this.stats.messages.skipped++;
      }

      // 每处理 100 条更新一次进度
      if (processed % 100 === 0 || processed === total) {
        this.emitProgress("importing_messages", Math.round((processed / total) * 100), undefined, total, processed);
      }
    }
  }

  /**
   * 导入单个消息
   */
  private importMessage(message: ExportedMessage): void {
    // 检查会话是否存在
    const sessionExists = this.db
      .prepare("SELECT 1 FROM sessions WHERE id = ?")
      .get(message.sessionId);

    if (!sessionExists) {
      this.stats.messages.skipped++;
      return;
    }

    // 检查消息是否存在
    const existing = this.db
      .prepare("SELECT 1 FROM messages WHERE id = ?")
      .get(message.id);

    if (existing) {
      this.stats.messages.skipped++;
      return;
    }

    this.db
      .prepare("INSERT OR IGNORE INTO messages (id, session_id, data, created_at) VALUES (?, ?, ?, ?)")
      .run(message.id, message.sessionId, JSON.stringify(message.data), message.createdAt);
    this.stats.messages.imported++;
  }

  /**
   * 导入会话标签关联
   */
  private importSessionTags(): void {
    this.emitProgress("importing_session_tags", 0);

    const content = this.archiveData["session_tags.json"];
    if (!content) {
      this.emitProgress("importing_session_tags", 100);
      return;
    }

    const sessionTags = safeParseJson<ExportedSessionTag[]>(content, []);
    let processed = 0;

    for (const st of sessionTags) {
      try {
        this.db
          .prepare("INSERT OR IGNORE INTO session_tags (session_id, tag_id, created_at) VALUES (?, ?, ?)")
          .run(st.sessionId, st.tagId, st.createdAt);
        processed++;
      } catch {
        // 忽略关联导入错误
      }
    }

    this.emitProgress("importing_session_tags", 100);
  }

  /**
   * 导入记忆块
   */
  private importMemoryBlocks(): void {
    this.emitProgress("importing_memories", 0);

    const content = this.archiveData["memory_blocks.json"];
    if (!content) {
      this.emitProgress("importing_memories", 100);
      return;
    }

    const blocks = safeParseJson<MemoryBlock[]>(content, []);
    const total = blocks.length;
    let processed = 0;

    for (const block of blocks) {
      try {
        this.importMemoryBlock(block);
        processed++;
      } catch (error) {
        this.warnings.push(`Failed to import memory block "${block.label}": ${error instanceof Error ? error.message : String(error)}`);
        this.stats.memoryBlocks.skipped++;
      }
      this.emitProgress("importing_memories", Math.round((processed / total) * 100), block.label, total, processed);
    }
  }

  /**
   * 导入单个记忆块
   */
  private importMemoryBlock(block: MemoryBlock): void {
    const existing = this.db
      .prepare("SELECT id, updated_at FROM memory_blocks WHERE id = ? OR label = ?")
      .get(block.id, block.label) as Record<string, unknown> | undefined;

    if (existing) {
      if (this.options.strategy === "add_only") {
        this.stats.memoryBlocks.skipped++;
        return;
      }

      const shouldUpdate = this.shouldUpdate(
        { updatedAt: Number(existing.updated_at) },
        { updatedAt: block.updatedAt }
      );

      if (shouldUpdate) {
        this.db
          .prepare(
            `UPDATE memory_blocks SET
              label = ?, description = ?, value = ?, char_limit = ?, created_at = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(block.label, block.description, block.value, block.charLimit, block.createdAt, block.updatedAt, existing.id);
        this.stats.memoryBlocks.updated++;
      } else {
        this.stats.memoryBlocks.skipped++;
      }
    } else {
      this.db
        .prepare(
          `INSERT INTO memory_blocks (id, label, description, value, char_limit, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(block.id, block.label, block.description, block.value, block.charLimit, block.createdAt, block.updatedAt);
      this.stats.memoryBlocks.imported++;
    }
  }

  /**
   * 导入归档记忆
   */
  private importArchivalMemories(): void {
    this.emitProgress("importing_archival_memories", 0);

    const content = this.archiveData["archival_memories.json"];
    if (!content) {
      this.emitProgress("importing_archival_memories", 100);
      return;
    }

    const memories = safeParseJson<Omit<ArchivalMemory, "embedding">[]>(content, []);
    const total = memories.length;
    let processed = 0;

    for (const memory of memories) {
      try {
        const existing = this.db
          .prepare("SELECT 1 FROM archival_memories WHERE id = ?")
          .get(memory.id);

        if (!existing) {
          this.db
            .prepare(
              `INSERT INTO archival_memories (id, content, source_session_id, tags, created_at)
               VALUES (?, ?, ?, ?, ?)`
            )
            .run(memory.id, memory.content, memory.sourceSessionId ?? null, JSON.stringify(memory.tags), memory.createdAt);
          this.stats.archivalMemories.imported++;
        } else {
          this.stats.archivalMemories.skipped++;
        }
        processed++;
      } catch (error) {
        this.stats.archivalMemories.skipped++;
      }

      if (processed % 100 === 0 || processed === total) {
        this.emitProgress("importing_archival_memories", Math.round((processed / total) * 100), undefined, total, processed);
      }
    }
  }

  /**
   * 导入技能
   */
  private importSkills(): void {
    this.emitProgress("importing_skills", 0);

    const content = this.archiveData["skills.json"];
    if (!content) {
      this.emitProgress("importing_skills", 100);
      return;
    }

    const skills = safeParseJson<Skill[]>(content, []);
    const total = skills.length;
    let processed = 0;

    for (const skill of skills) {
      try {
        this.importSkill(skill);
        processed++;
      } catch (error) {
        this.warnings.push(`Failed to import skill "${skill.name}": ${error instanceof Error ? error.message : String(error)}`);
        this.stats.skills.skipped++;
      }
      this.emitProgress("importing_skills", Math.round((processed / total) * 100), skill.name, total, processed);
    }
  }

  /**
   * 导入单个技能
   */
  private importSkill(skill: Skill): void {
    // 不导入内置技能
    if (skill.source === "builtin") {
      this.stats.skills.skipped++;
      return;
    }

    const existing = this.db
      .prepare("SELECT id, updated_at, source FROM skills WHERE id = ? OR name = ?")
      .get(skill.id, skill.name) as Record<string, unknown> | undefined;

    if (existing) {
      // 不覆盖内置技能
      if (String(existing.source) === "builtin") {
        this.stats.skills.skipped++;
        return;
      }

      if (this.options.strategy === "add_only") {
        this.stats.skills.skipped++;
        return;
      }

      const shouldUpdate = this.shouldUpdate(
        { updatedAt: Number(existing.updated_at) },
        { updatedAt: skill.updatedAt }
      );

      if (shouldUpdate) {
        this.db
          .prepare(
            `UPDATE skills SET
              name = ?, description = ?, content = ?, source = ?, is_enabled = ?,
              icon = ?, category = ?, created_at = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(
            skill.name,
            skill.description,
            skill.content,
            skill.source,
            skill.isEnabled ? 1 : 0,
            skill.icon ?? null,
            skill.category,
            skill.createdAt,
            skill.updatedAt,
            existing.id
          );
        this.stats.skills.updated++;
      } else {
        this.stats.skills.skipped++;
      }
    } else {
      this.db
        .prepare(
          `INSERT INTO skills
            (id, name, description, content, source, is_enabled, icon, category, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          skill.id,
          skill.name,
          skill.description,
          skill.content,
          skill.source,
          skill.isEnabled ? 1 : 0,
          skill.icon ?? null,
          skill.category,
          skill.createdAt,
          skill.updatedAt
        );
      this.stats.skills.imported++;
    }
  }

  /**
   * 导入设置
   */
  private importSettings(): void {
    this.emitProgress("importing_settings", 0);

    const content = this.archiveData["settings.json"];
    if (!content) {
      this.emitProgress("importing_settings", 100);
      return;
    }

    // 检查设置表是否存在
    const tableExists = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='local_settings'")
      .get();

    if (!tableExists) {
      this.warnings.push("Settings table does not exist, skipping settings import");
      this.emitProgress("importing_settings", 100);
      return;
    }

    const settings = safeParseJson<LocalSetting[]>(content, []);
    const total = settings.length;
    let processed = 0;

    for (const setting of settings) {
      try {
        const existing = this.db
          .prepare("SELECT key, updated_at FROM local_settings WHERE key = ?")
          .get(setting.key) as Record<string, unknown> | undefined;

        if (existing) {
          if (this.options.strategy === "add_only") {
            this.stats.settings.skipped++;
          } else {
            const shouldUpdate = this.shouldUpdate(
              { updatedAt: Number(existing.updated_at) },
              { updatedAt: setting.updatedAt }
            );

            if (shouldUpdate) {
              this.db
                .prepare("UPDATE local_settings SET value = ?, updated_at = ? WHERE key = ?")
                .run(setting.value, setting.updatedAt, setting.key);
              this.stats.settings.updated++;
            } else {
              this.stats.settings.skipped++;
            }
          }
        } else {
          this.db
            .prepare("INSERT INTO local_settings (key, value, updated_at) VALUES (?, ?, ?)")
            .run(setting.key, setting.value, setting.updatedAt);
          this.stats.settings.imported++;
        }
        processed++;
      } catch (error) {
        this.stats.settings.skipped++;
      }

      this.emitProgress("importing_settings", Math.round((processed / total) * 100), setting.key, total, processed);
    }
  }

  /**
   * 判断是否应该更新
   */
  private shouldUpdate(local: { updatedAt: number }, remote: { updatedAt: number }): boolean {
    switch (this.options.strategy) {
      case "overwrite":
        return true;
      case "add_only":
        return false;
      case "merge":
      default:
        switch (this.options.conflictResolution) {
          case "keep_remote":
            return true;
          case "keep_local":
            return false;
          case "keep_newer":
          default:
            return remote.updatedAt > local.updatedAt;
        }
    }
  }

  /**
   * 发送进度事件
   */
  private emitProgress(
    stage: ImportStage,
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
      processedItems,
      conflictCount: this.conflicts.length
    });
  }
}

// ============================================================================
// 导出函数
// ============================================================================

/**
 * 从文件导入数据
 *
 * @param db - 数据库实例
 * @param filePath - 导入文件路径
 * @param options - 导入选项
 * @returns 导入结果
 */
export async function importData(
  db: BetterSqlite3.Database,
  filePath: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const importer = new DataImporter(db, options);
  return importer.import(filePath);
}

/**
 * 验证导入文件（不执行实际导入）
 *
 * @param db - 数据库实例
 * @param filePath - 导入文件路径
 * @returns 验证结果
 */
export async function validateImportFile(
  db: BetterSqlite3.Database,
  filePath: string
): Promise<ImportResult> {
  const importer = new DataImporter(db, { dryRun: true });
  return importer.import(filePath);
}

export default { importData, validateImportFile, DataImporter };
