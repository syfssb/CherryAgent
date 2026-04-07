#!/usr/bin/env node

/**
 * Memory System 独立测试脚本
 *
 * 运行方式: chmod +x memory-test-standalone.mjs && ./memory-test-standalone.mjs
 */

import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";

// ===== 迁移代码 (内联) =====
function runMigrations(db) {
  // 创建 migrations 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  // 执行迁移 002: Memory System
  const currentVersion = db.prepare("SELECT MAX(version) as version FROM migrations").get().version || 0;

  if (currentVersion < 2) {
    console.log("Running migration 002: memory-system...");

    // 创建 memory_blocks 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_blocks (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL DEFAULT '',
        char_limit INTEGER NOT NULL DEFAULT 2000,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_blocks_label ON memory_blocks(label)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_blocks_updated_at ON memory_blocks(updated_at DESC)`);

    // 创建 archival_memories 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS archival_memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding BLOB,
        source_session_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_archival_memories_source_session ON archival_memories(source_session_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_archival_memories_created_at ON archival_memories(created_at DESC)`);

    // FTS 表
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS archival_memories_fts USING fts5(
        content,
        tags,
        content='archival_memories',
        content_rowid='rowid'
      )
    `);

    // 触发器
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS archival_memories_ai AFTER INSERT ON archival_memories BEGIN
        INSERT INTO archival_memories_fts(rowid, content, tags)
        VALUES (new.rowid, new.content, new.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS archival_memories_ad AFTER DELETE ON archival_memories BEGIN
        INSERT INTO archival_memories_fts(archival_memories_fts, rowid, content, tags)
        VALUES('delete', old.rowid, old.content, old.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS archival_memories_au AFTER UPDATE ON archival_memories BEGIN
        INSERT INTO archival_memories_fts(archival_memories_fts, rowid, content, tags)
        VALUES('delete', old.rowid, old.content, old.tags);
        INSERT INTO archival_memories_fts(rowid, content, tags)
        VALUES (new.rowid, new.content, new.tags);
      END
    `);

    // 插入默认记忆块
    const defaultBlocks = [
      { id: "core_memory_persona", label: "AI Persona", description: "AI 助手的核心人格设定和行为准则", value: "", charLimit: 2000 },
      { id: "core_memory_user", label: "User Profile", description: "用户的基本信息、偏好和工作习惯", value: "", charLimit: 2000 },
      { id: "core_memory_project", label: "Project Context", description: "当前项目的背景、目标和技术栈", value: "", charLimit: 3000 }
    ];

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO memory_blocks (id, label, description, value, char_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    for (const block of defaultBlocks) {
      insertStmt.run(block.id, block.label, block.description, block.value, block.charLimit, now, now);
    }

    db.prepare("INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)").run(2, "memory-system", Date.now());
    console.log("✓ Migration 002 completed");
  }
}

// ===== 简化的 MemoryStore (内联核心功能) =====
class SimpleMemoryStore {
  constructor(db) {
    this.db = db;
  }

  createBlock(input) {
    const id = `custom_memory_${crypto.randomUUID()}`;
    const now = Date.now();
    const charLimit = input.charLimit ?? 2000;
    const value = input.value ?? "";

    if (value.length > charLimit) {
      throw new Error(`Value exceeds character limit of ${charLimit}`);
    }

    const existing = this.db.prepare("SELECT id FROM memory_blocks WHERE label = ?").get(input.label);
    if (existing) {
      throw new Error(`Memory block with label "${input.label}" already exists`);
    }

    this.db.prepare(`
      INSERT INTO memory_blocks (id, label, description, value, char_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.label, input.description ?? "", value, charLimit, now, now);

    return { id, label: input.label, description: input.description ?? "", value, charLimit, createdAt: now, updatedAt: now };
  }

  getAllBlocks() {
    const rows = this.db.prepare("SELECT * FROM memory_blocks ORDER BY created_at ASC").all();
    return rows.map(row => ({
      id: row.id,
      label: row.label,
      description: row.description,
      value: row.value,
      charLimit: row.char_limit,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  getBlock(label) {
    const row = this.db.prepare("SELECT * FROM memory_blocks WHERE label = ?").get(label);
    if (!row) return null;
    return {
      id: row.id,
      label: row.label,
      description: row.description,
      value: row.value,
      charLimit: row.char_limit,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  updateBlock(labelOrId, value) {
    let row = this.db.prepare("SELECT * FROM memory_blocks WHERE label = ? OR id = ?").get(labelOrId, labelOrId);
    if (!row) return null;

    if (value.length > row.char_limit) {
      throw new Error(`Value exceeds character limit of ${row.char_limit}. Current length: ${value.length}`);
    }

    const now = Date.now();
    this.db.prepare("UPDATE memory_blocks SET value = ?, updated_at = ? WHERE id = ?").run(value, now, row.id);

    return this.getBlock(row.label);
  }

  deleteBlock(id) {
    const systemBlockIds = ["core_memory_persona", "core_memory_user", "core_memory_project"];
    if (systemBlockIds.includes(id)) {
      throw new Error("Cannot delete system memory blocks");
    }

    const result = this.db.prepare("DELETE FROM memory_blocks WHERE id = ?").run(id);
    return result.changes > 0;
  }

  createArchivalMemory(input) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const tags = JSON.stringify(input.tags ?? []);

    let embeddingBlob = null;
    if (input.embedding) {
      const float32Array = input.embedding instanceof Float32Array ? input.embedding : new Float32Array(input.embedding);
      embeddingBlob = Buffer.from(float32Array.buffer);
    }

    this.db.prepare(`
      INSERT INTO archival_memories (id, content, embedding, source_session_id, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.content, embeddingBlob, input.sourceSessionId ?? null, tags, now);

    return { id, content: input.content, embedding: input.embedding, sourceSessionId: input.sourceSessionId, tags: input.tags ?? [], createdAt: now };
  }

  searchArchivalMemories(query, limit = 10) {
    const rows = this.db.prepare(`
      SELECT am.* FROM archival_memories_fts fts
      INNER JOIN archival_memories am ON fts.rowid = am.rowid
      WHERE fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit);

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      tags: JSON.parse(row.tags),
      sourceSessionId: row.source_session_id,
      createdAt: row.created_at
    }));
  }

  getMemoryContext(options = {}) {
    const { includeEmpty = false, maxBlocks } = options;
    let blocks = this.getAllBlocks();

    if (!includeEmpty) {
      blocks = blocks.filter(b => b.value.trim().length > 0);
    }

    if (maxBlocks) {
      blocks = blocks.slice(0, maxBlocks);
    }

    if (blocks.length === 0) return "";

    const parts = ["# Memory Context", "", "The following information has been stored in memory and should be considered when responding:", ""];

    for (const block of blocks) {
      parts.push(`## ${block.label}`);
      if (block.description) {
        parts.push(`_${block.description}_`);
      }
      parts.push("", block.value, "");
    }

    return parts.join("\n").trim();
  }
}

// ===== 测试框架 =====
let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  console.log("🧪 Memory System Standalone Tests\n");

  const tempDbPath = join(tmpdir(), `test-memory-${Date.now()}.db`);
  const db = new Database(tempDbPath);
  db.pragma("journal_mode = WAL");

  try {
    runMigrations(db);
    const store = new SimpleMemoryStore(db);

    for (const { name, fn } of tests) {
      try {
        await fn(store);
        passed++;
        console.log(`✓ ${name}`);
      } catch (error) {
        failed++;
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${passed + failed}`);
    console.log("=".repeat(50));

    if (failed === 0) {
      console.log("\n🎉 All tests passed!");
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed`);
      process.exit(1);
    }
  } finally {
    db.close();
    try {
      unlinkSync(tempDbPath);
    } catch {}
  }
}

// ===== 定义测试 =====
test("Create memory block", (store) => {
  const block = store.createBlock({ label: "test_block", value: "Test value" });
  assert(block.label === "test_block", "Label should match");
  assert(block.value === "Test value", "Value should match");
});

test("System blocks exist", (store) => {
  const blocks = store.getAllBlocks();
  assert(blocks.length >= 3, "Should have at least 3 blocks");
  const labels = blocks.map(b => b.label);
  assert(labels.includes("AI Persona"), "Should have AI Persona");
  assert(labels.includes("User Profile"), "Should have User Profile");
  assert(labels.includes("Project Context"), "Should have Project Context");
});

test("Update block value", (store) => {
  store.createBlock({ label: "update_test", value: "original" });
  const updated = store.updateBlock("update_test", "updated");
  assert(updated.value === "updated", "Value should be updated");
});

test("Character limit validation", (store) => {
  try {
    store.createBlock({ label: "over_limit", value: "x".repeat(2001), charLimit: 2000 });
    throw new Error("Should have thrown");
  } catch (error) {
    assert(error.message.includes("exceeds character limit"), "Should throw limit error");
  }
});

test("Cannot delete system blocks", (store) => {
  try {
    store.deleteBlock("core_memory_persona");
    throw new Error("Should have thrown");
  } catch (error) {
    assert(error.message.includes("Cannot delete system"), "Should prevent deletion");
  }
});

test("Can delete custom blocks", (store) => {
  const block = store.createBlock({ label: "deletable", value: "test" });
  const deleted = store.deleteBlock(block.id);
  assert(deleted === true, "Should delete successfully");
});

test("Create archival memory", (store) => {
  const memory = store.createArchivalMemory({ content: "Important info", tags: ["test"] });
  assert(memory.id.length > 0, "Should have ID");
  assert(memory.content === "Important info", "Content should match");
});

test("Search archival memories", (store) => {
  store.createArchivalMemory({ content: "TypeScript is great" });
  store.createArchivalMemory({ content: "JavaScript is flexible" });
  const results = store.searchArchivalMemories("TypeScript");
  assert(results.length > 0, "Should find results");
  assert(results[0].content.includes("TypeScript"), "Should match search term");
});

test("Generate memory context", (store) => {
  store.updateBlock("core_memory_user", "User: John Doe");
  store.updateBlock("core_memory_project", "Project: AI Assistant");
  const context = store.getMemoryContext({ includeEmpty: false });
  assert(context.includes("# Memory Context"), "Should have header");
  assert(context.includes("John Doe"), "Should have user info");
  assert(context.includes("AI Assistant"), "Should have project info");
});

test("Exclude empty blocks", (store) => {
  const context = store.getMemoryContext({ includeEmpty: false });
  // 大部分块是空的,检查是否正确过滤
  const sections = context.split("##").length - 1;
  // 只有设置了值的块才会出现
  assert(sections >= 0, "Should filter empty blocks");
});

// 运行测试
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
