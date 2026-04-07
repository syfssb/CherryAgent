/**
 * Memory Store - 记忆系统存储管理
 *
 * 功能:
 * - 管理结构化记忆块（MemoryBlock）
 * - 管理归档记忆（ArchivalMemory）
 * - 生成系统提示上下文
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type {
  MemoryBlock,
  ArchivalMemory,
  ArchivalMemoryCreateInput,
  ArchivalMemorySearchResult
} from "../types/local-db.js";

/**
 * 记忆块创建输入
 */
export interface MemoryBlockCreateInput {
  label: string;
  description?: string;
  value?: string;
  charLimit?: number;
}

/**
 * 记忆块更新输入
 */
export interface MemoryBlockUpdateInput {
  label?: string;
  description?: string;
  value?: string;
  charLimit?: number;
}

/**
 * 记忆上下文选项
 */
export interface MemoryContextOptions {
  includeEmpty?: boolean;
  maxBlocks?: number;
}

/**
 * MemoryStore 类
 * 负责管理记忆块和归档记忆
 */
export class MemoryStore {
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  // ============================================================================
  // Memory Block 方法
  // ============================================================================

  /**
   * 获取所有记忆块
   */
  getAllBlocks(): MemoryBlock[] {
    const rows = this.db
      .prepare(
        `SELECT id, label, description, value, char_limit, created_at, updated_at
         FROM memory_blocks
         ORDER BY created_at ASC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapMemoryBlockRow(row));
  }

  /**
   * 根据标签获取记忆块
   */
  getBlock(label: string): MemoryBlock | null {
    const row = this.db
      .prepare(
        `SELECT id, label, description, value, char_limit, created_at, updated_at
         FROM memory_blocks
         WHERE label = ?`
      )
      .get(label) as Record<string, unknown> | undefined;

    return row ? this.mapMemoryBlockRow(row) : null;
  }

  /**
   * 根据 ID 获取记忆块
   */
  getBlockById(id: string): MemoryBlock | null {
    const row = this.db
      .prepare(
        `SELECT id, label, description, value, char_limit, created_at, updated_at
         FROM memory_blocks
         WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.mapMemoryBlockRow(row) : null;
  }

  /**
   * 创建新的记忆块
   */
  createBlock(input: MemoryBlockCreateInput): MemoryBlock {
    const id = `custom_memory_${crypto.randomUUID()}`;
    const now = Date.now();
    const charLimit = input.charLimit ?? 2000;

    // 验证标签唯一性
    const existing = this.getBlock(input.label);
    if (existing) {
      throw new Error(`Memory block with label "${input.label}" already exists`);
    }

    // 验证初始值不超过字符限制
    const value = input.value ?? "";
    if (value.length > charLimit) {
      throw new Error(`Value exceeds character limit of ${charLimit}`);
    }

    this.db
      .prepare(
        `INSERT INTO memory_blocks (id, label, description, value, char_limit, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.label, input.description ?? "", value, charLimit, now, now);

    return {
      id,
      label: input.label,
      description: input.description ?? "",
      value,
      charLimit,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * 更新记忆块
   */
  updateBlock(labelOrId: string, value: string): MemoryBlock | null {
    // 先尝试通过标签查找，再尝试通过 ID 查找
    let block = this.getBlock(labelOrId);
    if (!block) {
      block = this.getBlockById(labelOrId);
    }

    if (!block) {
      return null;
    }

    // 验证字符限制
    if (value.length > block.charLimit) {
      throw new Error(`Value exceeds character limit of ${block.charLimit}. Current length: ${value.length}`);
    }

    const now = Date.now();
    this.db
      .prepare(
        `UPDATE memory_blocks
         SET value = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(value, now, block.id);

    return {
      ...block,
      value,
      updatedAt: now
    };
  }

  /**
   * 更新记忆块的完整信息
   */
  updateBlockFull(id: string, input: MemoryBlockUpdateInput): MemoryBlock | null {
    const block = this.getBlockById(id);
    if (!block) {
      return null;
    }

    const updates: string[] = [];
    const values: Array<string | number> = [];

    if (input.label !== undefined) {
      // 检查新标签是否与其他块冲突
      const existingWithLabel = this.getBlock(input.label);
      if (existingWithLabel && existingWithLabel.id !== id) {
        throw new Error(`Memory block with label "${input.label}" already exists`);
      }
      updates.push("label = ?");
      values.push(input.label);
    }

    if (input.description !== undefined) {
      updates.push("description = ?");
      values.push(input.description);
    }

    const newCharLimit = input.charLimit ?? block.charLimit;
    if (input.charLimit !== undefined) {
      updates.push("char_limit = ?");
      values.push(input.charLimit);
    }

    if (input.value !== undefined) {
      if (input.value.length > newCharLimit) {
        throw new Error(`Value exceeds character limit of ${newCharLimit}`);
      }
      updates.push("value = ?");
      values.push(input.value);
    } else if (block.value.length > newCharLimit) {
      throw new Error(`Current value exceeds new character limit of ${newCharLimit}`);
    }

    if (updates.length === 0) {
      return block;
    }

    const now = Date.now();
    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    this.db
      .prepare(`UPDATE memory_blocks SET ${updates.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getBlockById(id);
  }

  /**
   * 在记忆块中替换文本
   */
  replaceInBlock(labelOrId: string, oldText: string, newText: string): MemoryBlock | null {
    // 先尝试通过标签查找，再尝试通过 ID 查找
    let block = this.getBlock(labelOrId);
    if (!block) {
      block = this.getBlockById(labelOrId);
    }

    if (!block) {
      return null;
    }

    // 检查旧文本是否存在
    if (!block.value.includes(oldText)) {
      throw new Error(`Text "${oldText}" not found in memory block`);
    }

    // 替换文本
    const newValue = block.value.replace(oldText, newText);

    // 验证字符限制
    if (newValue.length > block.charLimit) {
      throw new Error(`Replacement would exceed character limit of ${block.charLimit}`);
    }

    return this.updateBlock(block.id, newValue);
  }

  /**
   * 删除记忆块
   * 注意：不允许删除系统内置的记忆块
   */
  deleteBlock(id: string): boolean {
    // 检查是否为系统内置块
    const systemBlockIds = [
      "core_memory_persona",
      "core_memory_user",
      "core_memory_project"
    ];

    if (systemBlockIds.includes(id)) {
      throw new Error("Cannot delete system memory blocks");
    }

    const result = this.db
      .prepare(`DELETE FROM memory_blocks WHERE id = ?`)
      .run(id);

    return result.changes > 0;
  }

  /**
   * 清空记忆块的值（但保留块本身）
   */
  clearBlock(labelOrId: string): MemoryBlock | null {
    return this.updateBlock(labelOrId, "");
  }

  /**
   * 追加内容到记忆块
   */
  appendToBlock(labelOrId: string, content: string, separator: string = "\n"): MemoryBlock | null {
    let block = this.getBlock(labelOrId);
    if (!block) {
      block = this.getBlockById(labelOrId);
    }

    if (!block) {
      return null;
    }

    const newValue = block.value
      ? `${block.value}${separator}${content}`
      : content;

    return this.updateBlock(block.id, newValue);
  }

  /**
   * 生成记忆上下文（用于系统提示）
   */
  getMemoryContext(options: MemoryContextOptions = {}): string {
    const { includeEmpty = false, maxBlocks } = options;

    let blocks = this.getAllBlocks();

    // 过滤空块
    if (!includeEmpty) {
      blocks = blocks.filter((block) => block.value.trim().length > 0);
    }

    // 限制块数量
    if (maxBlocks !== undefined && maxBlocks > 0) {
      blocks = blocks.slice(0, maxBlocks);
    }

    if (blocks.length === 0) {
      return "";
    }

    const parts: string[] = [
      "# Memory Context",
      "",
      "The following information has been stored in memory and should be considered when responding:",
      ""
    ];

    for (const block of blocks) {
      parts.push(`## ${block.label}`);
      if (block.description) {
        parts.push(`_${block.description}_`);
      }
      parts.push("");
      parts.push(block.value);
      parts.push("");
    }

    return parts.join("\n").trim();
  }

  // ============================================================================
  // Archival Memory 方法
  // ============================================================================

  /**
   * 创建归档记忆
   */
  createArchivalMemory(input: ArchivalMemoryCreateInput): ArchivalMemory {
    const id = crypto.randomUUID();
    const now = Date.now();
    const tags = input.tags ?? [];

    // 处理嵌入向量
    let embeddingBlob: Buffer | null = null;
    if (input.embedding) {
      const float32Array = input.embedding instanceof Float32Array
        ? input.embedding
        : new Float32Array(input.embedding);
      embeddingBlob = Buffer.from(float32Array.buffer);
    }

    this.db
      .prepare(
        `INSERT INTO archival_memories (id, content, embedding, source_session_id, tags, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.content,
        embeddingBlob,
        input.sourceSessionId ?? null,
        JSON.stringify(tags),
        now
      );

    return {
      id,
      content: input.content,
      embedding: input.embedding instanceof Float32Array
        ? input.embedding
        : input.embedding
          ? new Float32Array(input.embedding)
          : null,
      sourceSessionId: input.sourceSessionId,
      tags,
      createdAt: now
    };
  }

  /**
   * 获取归档记忆
   */
  getArchivalMemory(id: string): ArchivalMemory | null {
    const row = this.db
      .prepare(
        `SELECT id, content, embedding, source_session_id, tags, created_at
         FROM archival_memories
         WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.mapArchivalMemoryRow(row) : null;
  }

  /**
   * 获取所有归档记忆
   */
  getAllArchivalMemories(limit?: number, offset?: number): ArchivalMemory[] {
    let sql = `
      SELECT id, content, embedding, source_session_id, tags, created_at
      FROM archival_memories
      ORDER BY created_at DESC
    `;

    const params: number[] = [];
    if (limit !== undefined) {
      sql += " LIMIT ?";
      params.push(limit);
    }
    if (offset !== undefined) {
      sql += " OFFSET ?";
      params.push(offset);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapArchivalMemoryRow(row));
  }

  /**
   * 搜索归档记忆（全文搜索）
   */
  searchArchivalMemories(
    query: string,
    limit: number = 10
  ): ArchivalMemorySearchResult[] {
    const rows = this.db
      .prepare(
        `SELECT am.id, am.content, am.embedding, am.source_session_id, am.tags, am.created_at
         FROM archival_memories_fts fts
         INNER JOIN archival_memories am ON fts.rowid = am.rowid
         WHERE fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(query, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapArchivalMemoryRow(row) as ArchivalMemorySearchResult);
  }

  /**
   * 按标签获取归档记忆
   */
  getArchivalMemoriesByTag(tag: string, limit?: number): ArchivalMemory[] {
    let sql = `
      SELECT id, content, embedding, source_session_id, tags, created_at
      FROM archival_memories
      WHERE tags LIKE ?
      ORDER BY created_at DESC
    `;

    const params: Array<string | number> = [`%"${tag}"%`];
    if (limit !== undefined) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapArchivalMemoryRow(row));
  }

  /**
   * 按会话获取归档记忆
   */
  getArchivalMemoriesBySession(sessionId: string): ArchivalMemory[] {
    const rows = this.db
      .prepare(
        `SELECT id, content, embedding, source_session_id, tags, created_at
         FROM archival_memories
         WHERE source_session_id = ?
         ORDER BY created_at DESC`
      )
      .all(sessionId) as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapArchivalMemoryRow(row));
  }

  /**
   * 更新归档记忆
   */
  updateArchivalMemory(
    id: string,
    updates: { content?: string; tags?: string[]; embedding?: number[] | Float32Array }
  ): ArchivalMemory | null {
    const existing = this.getArchivalMemory(id);
    if (!existing) {
      return null;
    }

    const fields: string[] = [];
    const values: Array<string | Buffer | null> = [];

    if (updates.content !== undefined) {
      fields.push("content = ?");
      values.push(updates.content);
    }

    if (updates.tags !== undefined) {
      fields.push("tags = ?");
      values.push(JSON.stringify(updates.tags));
    }

    if (updates.embedding !== undefined) {
      fields.push("embedding = ?");
      const float32Array = updates.embedding instanceof Float32Array
        ? updates.embedding
        : new Float32Array(updates.embedding);
      values.push(Buffer.from(float32Array.buffer));
    }

    if (fields.length === 0) {
      return existing;
    }

    values.push(id);
    this.db
      .prepare(`UPDATE archival_memories SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getArchivalMemory(id);
  }

  /**
   * 删除归档记忆
   */
  deleteArchivalMemory(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM archival_memories WHERE id = ?`)
      .run(id);

    return result.changes > 0;
  }

  /**
   * 删除会话的所有归档记忆
   */
  deleteArchivalMemoriesBySession(sessionId: string): number {
    const result = this.db
      .prepare(`DELETE FROM archival_memories WHERE source_session_id = ?`)
      .run(sessionId);

    return result.changes;
  }

  /**
   * 获取归档记忆数量
   */
  getArchivalMemoryCount(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM archival_memories`)
      .get() as { count: number };

    return row.count;
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  /**
   * 将数据库行映射为 MemoryBlock 对象
   */
  private mapMemoryBlockRow(row: Record<string, unknown>): MemoryBlock {
    return {
      id: String(row.id),
      label: String(row.label),
      description: String(row.description),
      value: String(row.value),
      charLimit: Number(row.char_limit),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }

  /**
   * 将数据库行映射为 ArchivalMemory 对象
   */
  private mapArchivalMemoryRow(row: Record<string, unknown>): ArchivalMemory {
    let embedding: Float32Array | null = null;
    if (row.embedding && Buffer.isBuffer(row.embedding)) {
      embedding = new Float32Array(
        (row.embedding as Buffer).buffer,
        (row.embedding as Buffer).byteOffset,
        (row.embedding as Buffer).byteLength / Float32Array.BYTES_PER_ELEMENT
      );
    }

    let tags: string[] = [];
    try {
      tags = JSON.parse(String(row.tags)) as string[];
    } catch {
      tags = [];
    }

    return {
      id: String(row.id),
      content: String(row.content),
      embedding,
      sourceSessionId: row.source_session_id ? String(row.source_session_id) : undefined,
      tags,
      createdAt: Number(row.created_at)
    };
  }
}

export default MemoryStore;
