/**
 * Skill Store - 技能系统存储管理
 *
 * 功能:
 * - 管理技能的 CRUD 操作
 * - 搜索和过滤技能
 * - 验证技能内容
 * - 生成系统提示上下文
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { CloudSyncService } from "./cloud-sync.js";
import type {
  Skill,
  SkillCreateInput,
  SkillUpdateInput,
  SkillSource,
  SkillCategory,
  SkillRuntime
} from "../types/local-db.js";
import {
  validateSyntax,
  parseSkillMetadata,
  getSkillBody,
  type ValidationResult,
  type SkillMetadata
} from "./skill-validator.js";

/**
 * 技能搜索选项
 */
export interface SkillSearchOptions {
  query?: string;
  category?: SkillCategory;
  source?: SkillSource;
  enabledOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * 技能上下文选项
 */
export interface SkillContextOptions {
  skillIds?: string[];
  maxSkills?: number;
}

/**
 * SkillStore 类
 * 负责管理技能的存储和检索
 */
export class SkillStore {
  private db: BetterSqlite3.Database;
  private syncService?: CloudSyncService;

  constructor(db: BetterSqlite3.Database, syncService?: CloudSyncService) {
    this.db = db;
    this.syncService = syncService;
  }

  /** 获取底层数据库连接（供需要执行 raw SQL 的场景使用） */
  getDatabase(): BetterSqlite3.Database {
    return this.db;
  }

  // ============================================================================
  // 基本 CRUD 操作
  // ============================================================================

  /**
   * 获取所有技能
   */
  getAllSkills(): Skill[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, description, content, source, is_enabled, icon, category, compatible_runtimes, created_at, updated_at
         FROM skills
         ORDER BY name ASC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapSkillRow(row));
  }

  /**
   * 获取启用的技能
   */
  getEnabledSkills(): Skill[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, description, content, source, is_enabled, icon, category, compatible_runtimes, created_at, updated_at
         FROM skills
         WHERE is_enabled = 1
         ORDER BY name ASC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapSkillRow(row));
  }

  /**
   * 根据 ID 获取技能
   */
  getSkill(id: string): Skill | null {
    const row = this.db
      .prepare(
        `SELECT id, name, description, content, source, is_enabled, icon, category, compatible_runtimes, created_at, updated_at
         FROM skills
         WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.mapSkillRow(row) : null;
  }

  /**
   * 根据名称获取技能
   */
  getSkillByName(name: string): Skill | null {
    const row = this.db
      .prepare(
        `SELECT id, name, description, content, source, is_enabled, icon, category, compatible_runtimes, created_at, updated_at
         FROM skills
         WHERE name = ?`
      )
      .get(name) as Record<string, unknown> | undefined;

    return row ? this.mapSkillRow(row) : null;
  }

  /**
   * 删除不在保留列表内的内置技能（用于清理旧内置技能）
   */
  removeBuiltinSkillsNotIn(namesToKeep: string[]): Skill[] {
    const keep = namesToKeep.filter((name) => name && name.trim().length > 0);
    const placeholders = keep.map(() => "?").join(", ");
    const whereNotIn = keep.length > 0 ? ` AND name NOT IN (${placeholders})` : "";
    const selectSql = `
      SELECT id, name, description, content, source, is_enabled, icon, category, compatible_runtimes, created_at, updated_at
      FROM skills
      WHERE source = 'builtin'${whereNotIn}
    `;
    const rows = this.db.prepare(selectSql).all(...keep) as Array<Record<string, unknown>>;
    if (rows.length === 0) return [];

    const deleteSql = `DELETE FROM skills WHERE source = 'builtin'${whereNotIn}`;
    this.db.prepare(deleteSql).run(...keep);
    return rows.map((row) => this.mapSkillRow(row));
  }

  /**
   * 创建新技能
   */
  createSkill(input: SkillCreateInput): Skill {
    // 验证内容
    const validation = this.validateSkillContent(input.content);
    if (!validation.valid) {
      throw new Error(`Invalid skill content: ${validation.errors.join("; ")}`);
    }

    // 检查名称唯一性
    const existing = this.getSkillByName(input.name);
    if (existing) {
      throw new Error(`Skill with name "${input.name}" already exists`);
    }

    const id = `skill_${crypto.randomUUID()}`;
    const now = Date.now();
    const source = input.source ?? "custom";
    const category = input.category ?? "other";
    const isEnabled = input.isEnabled ?? true;
    const compatibleRuntimes = input.compatibleRuntimes ?? ["claude"];

    this.db
      .prepare(
        `INSERT INTO skills (id, name, description, content, source, is_enabled, icon, category, compatible_runtimes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name,
        input.description,
        input.content,
        source,
        isEnabled ? 1 : 0,
        input.icon ?? null,
        category,
        JSON.stringify(compatibleRuntimes),
        now,
        now
      );

    const createdSkill: Skill = {
      id,
      name: input.name,
      description: input.description,
      content: input.content,
      source,
      isEnabled,
      icon: input.icon,
      category,
      compatibleRuntimes,
      createdAt: now,
      updatedAt: now
    };

    if (this.syncService) {
      this.syncService.recordChange("skill", createdSkill.id, "create", createdSkill);
    }

    return createdSkill;
  }

  /**
   * 更新技能
   */
  updateSkill(id: string, input: SkillUpdateInput): Skill | null {
    const existing = this.getSkill(id);
    if (!existing) {
      return null;
    }

    // 不允许修改内置技能的核心内容
    if (existing.source === "builtin") {
      // 只允许切换启用状态
      if (Object.keys(input).some((key) => key !== "isEnabled")) {
        throw new Error("Cannot modify builtin skill content. You can only enable/disable it.");
      }
    }

    // 如果更新内容，验证内容
    if (input.content !== undefined) {
      const validation = this.validateSkillContent(input.content);
      if (!validation.valid) {
        throw new Error(`Invalid skill content: ${validation.errors.join("; ")}`);
      }
    }

    // 如果更新名称，检查唯一性
    if (input.name !== undefined && input.name !== existing.name) {
      const existingWithName = this.getSkillByName(input.name);
      if (existingWithName) {
        throw new Error(`Skill with name "${input.name}" already exists`);
      }
    }

    const updates: string[] = [];
    const values: Array<string | number | null> = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      values.push(input.name);
    }

    if (input.description !== undefined) {
      updates.push("description = ?");
      values.push(input.description);
    }

    if (input.content !== undefined) {
      updates.push("content = ?");
      values.push(input.content);
    }

    if (input.isEnabled !== undefined) {
      updates.push("is_enabled = ?");
      values.push(input.isEnabled ? 1 : 0);
    }

    if (input.icon !== undefined) {
      updates.push("icon = ?");
      values.push(input.icon);
    }

    if (input.category !== undefined) {
      updates.push("category = ?");
      values.push(input.category);
    }

    if (input.compatibleRuntimes !== undefined) {
      updates.push("compatible_runtimes = ?");
      values.push(JSON.stringify(input.compatibleRuntimes));
    }

    if (updates.length === 0) {
      return existing;
    }

    const now = Date.now();
    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    this.db
      .prepare(`UPDATE skills SET ${updates.join(", ")} WHERE id = ?`)
      .run(...values);

    const updatedSkill = this.getSkill(id);
    if (updatedSkill && this.syncService) {
      this.syncService.recordChange("skill", id, "update", updatedSkill);
    }

    return updatedSkill;
  }

  /**
   * 删除技能
   */
  deleteSkill(id: string): boolean {
    const existing = this.getSkill(id);

    // 不允许删除内置技能
    if (existing?.source === "builtin") {
      throw new Error("Cannot delete builtin skills");
    }

    const result = this.db
      .prepare(`DELETE FROM skills WHERE id = ?`)
      .run(id);

    if (result.changes > 0 && this.syncService) {
      this.syncService.recordChange("skill", id, "delete", null);
    }

    return result.changes > 0;
  }

  /**
   * 切换技能启用状态
   */
  toggleSkill(id: string): boolean {
    const existing = this.getSkill(id);
    if (!existing) {
      throw new Error(`Skill not found: ${id}`);
    }

    const newEnabled = !existing.isEnabled;
    const now = Date.now();

    this.db
      .prepare(`UPDATE skills SET is_enabled = ?, updated_at = ? WHERE id = ?`)
      .run(newEnabled ? 1 : 0, now, id);

    const updatedSkill = this.getSkill(id);
    if (updatedSkill && this.syncService) {
      this.syncService.recordChange("skill", id, "update", updatedSkill);
    }

    return newEnabled;
  }

  // ============================================================================
  // 搜索和过滤
  // ============================================================================

  /**
   * 搜索技能
   */
  searchSkills(options: SkillSearchOptions = {}): Skill[] {
    const { query, category, source, enabledOnly, limit, offset } = options;

    // 如果有搜索查询，使用全文搜索
    if (query && query.trim()) {
      return this.fullTextSearch(query, options);
    }

    let sql = `
      SELECT id, name, description, content, source, is_enabled, icon, category, compatible_runtimes, created_at, updated_at
      FROM skills
      WHERE 1=1
    `;
    const params: Array<string | number> = [];

    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }

    if (source) {
      sql += " AND source = ?";
      params.push(source);
    }

    if (enabledOnly) {
      sql += " AND is_enabled = 1";
    }

    sql += " ORDER BY name ASC";

    if (limit !== undefined) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    if (offset !== undefined) {
      sql += " OFFSET ?";
      params.push(offset);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapSkillRow(row));
  }

  /**
   * 全文搜索技能
   */
  private fullTextSearch(query: string, options: SkillSearchOptions): Skill[] {
    const { category, source, enabledOnly, limit = 20, offset = 0 } = options;

    // 构建 FTS 查询
    let sql = `
      SELECT s.id, s.name, s.description, s.content, s.source, s.is_enabled, s.icon, s.category, s.compatible_runtimes, s.created_at, s.updated_at
      FROM skills_fts fts
      INNER JOIN skills s ON fts.rowid = s.rowid
      WHERE fts MATCH ?
    `;
    const params: Array<string | number> = [query];

    if (category) {
      sql += " AND s.category = ?";
      params.push(category);
    }

    if (source) {
      sql += " AND s.source = ?";
      params.push(source);
    }

    if (enabledOnly) {
      sql += " AND s.is_enabled = 1";
    }

    sql += " ORDER BY rank LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapSkillRow(row));
  }

  /**
   * 按分类获取技能
   */
  getSkillsByCategory(category: SkillCategory): Skill[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, description, content, source, is_enabled, icon, category, compatible_runtimes, created_at, updated_at
         FROM skills
         WHERE category = ?
         ORDER BY name ASC`
      )
      .all(category) as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapSkillRow(row));
  }

  /**
   * 按来源获取技能
   */
  getSkillsBySource(source: SkillSource): Skill[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, description, content, source, is_enabled, icon, category, compatible_runtimes, created_at, updated_at
         FROM skills
         WHERE source = ?
         ORDER BY name ASC`
      )
      .all(source) as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapSkillRow(row));
  }

  /**
   * 按 runtime 获取兼容的技能
   * 匹配 compatible_runtimes JSON 数组中包含指定 runtime 的技能
   */
  listSkillsByRuntime(runtime: string): Skill[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, description, content, source, is_enabled, icon, category, compatible_runtimes, created_at, updated_at
         FROM skills
         WHERE is_enabled = 1
         ORDER BY name ASC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows
      .map((row) => this.mapSkillRow(row))
      .filter((skill) => {
        const runtimes = skill.compatibleRuntimes ?? ["claude"];
        return runtimes.includes(runtime as SkillRuntime);
      });
  }

  /**
   * 获取技能数量统计
   */
  getSkillStats(): {
    total: number;
    enabled: number;
    byCategory: Record<SkillCategory, number>;
    bySource: Record<SkillSource, number>;
  } {
    const total = (this.db.prepare(`SELECT COUNT(*) as count FROM skills`).get() as { count: number }).count;
    const enabled = (this.db.prepare(`SELECT COUNT(*) as count FROM skills WHERE is_enabled = 1`).get() as { count: number }).count;

    const categoryCounts = this.db
      .prepare(`SELECT category, COUNT(*) as count FROM skills GROUP BY category`)
      .all() as Array<{ category: string; count: number }>;

    const sourceCounts = this.db
      .prepare(`SELECT source, COUNT(*) as count FROM skills GROUP BY source`)
      .all() as Array<{ source: string; count: number }>;

    const byCategory: Record<SkillCategory, number> = {
      development: 0,
      writing: 0,
      analysis: 0,
      automation: 0,
      communication: 0,
      other: 0
    };

    const bySource: Record<SkillSource, number> = {
      builtin: 0,
      custom: 0,
      imported: 0
    };

    for (const row of categoryCounts) {
      byCategory[row.category as SkillCategory] = row.count;
    }

    for (const row of sourceCounts) {
      bySource[row.source as SkillSource] = row.count;
    }

    return { total, enabled, byCategory, bySource };
  }

  // ============================================================================
  // 验证
  // ============================================================================

  /**
   * 验证技能内容
   */
  validateSkillContent(content: string): ValidationResult {
    return validateSyntax(content);
  }

  /**
   * 解析技能元数据
   */
  parseSkillMetadata(content: string): SkillMetadata | null {
    return parseSkillMetadata(content);
  }

  /**
   * 获取技能正文（不含元数据）
   */
  getSkillBody(content: string): string {
    return getSkillBody(content);
  }

  // ============================================================================
  // 上下文生成
  // ============================================================================

  /**
   * 生成技能上下文（用于系统提示）
   */
  getSkillContext(options: SkillContextOptions = {}): string {
    const { skillIds, maxSkills = 30 } = options;

    let skills: Skill[];

    if (skillIds && skillIds.length > 0) {
      // 获取指定的技能
      skills = skillIds
        .map((id) => this.getSkill(id))
        .filter((skill): skill is Skill => skill !== null && skill.isEnabled);
    } else {
      // 获取所有启用的技能
      skills = this.getEnabledSkills();
    }

    // 限制技能数量
    if (skills.length > maxSkills) {
      skills = skills.slice(0, maxSkills);
    }

    if (skills.length === 0) {
      return "";
    }

    const parts: string[] = [
      "# Available Skills",
      "",
      "The following skills/prompts are available for reference and use:",
      ""
    ];

    for (const skill of skills) {
      parts.push(`## ${skill.name}`);
      if (skill.description) {
        parts.push(`_${skill.description}_`);
      }
      parts.push("");
      parts.push(getSkillBody(skill.content));
      parts.push("");
      parts.push("---");
      parts.push("");
    }

    return parts.join("\n").trim();
  }

  /**
   * 生成技能上下文摘要（仅包含名称和描述的简洁列表）
   */
  getSkillContextSummary(options: SkillContextOptions = {}): string {
    const { skillIds, maxSkills = 30 } = options;

    let skills: Skill[];

    if (skillIds && skillIds.length > 0) {
      skills = skillIds
        .map((id) => this.getSkill(id))
        .filter((skill): skill is Skill => skill !== null && skill.isEnabled);
    } else {
      skills = this.getEnabledSkills();
    }

    if (skills.length > maxSkills) {
      skills = skills.slice(0, maxSkills);
    }

    if (skills.length === 0) {
      return "";
    }

    return skills
      .map((skill) => `- **${skill.name}**: ${skill.description}`)
      .join("\n");
  }

  /**
   * 为特定技能生成提示
   */
  getSkillPrompt(skillId: string, variables?: Record<string, string>): string | null {
    const skill = this.getSkill(skillId);
    if (!skill) {
      return null;
    }

    let content = getSkillBody(skill.content);

    // 替换变量
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      }
    }

    return content;
  }

  // ============================================================================
  // 导入/导出
  // ============================================================================

  /**
   * 导出技能
   */
  exportSkill(id: string): string | null {
    const skill = this.getSkill(id);
    if (!skill) {
      return null;
    }

    // 生成包含元数据的完整技能内容
    const metadata = [
      "---",
      `title: ${skill.name}`,
      `description: ${skill.description}`,
      `category: ${skill.category}`,
      `icon: ${skill.icon || ""}`,
      "---",
      ""
    ].join("\n");

    // 如果原内容已有元数据，使用原内容；否则添加元数据
    if (skill.content.startsWith("---")) {
      return skill.content;
    }

    return metadata + skill.content;
  }

  /**
   * 导入技能
   */
  importSkill(content: string, options?: { name?: string; overwrite?: boolean }): Skill {
    // 解析元数据
    const metadata = parseSkillMetadata(content);
    const name = options?.name || metadata?.title || `Imported Skill ${Date.now()}`;

    // 检查是否已存在
    const existing = this.getSkillByName(name);
    if (existing) {
      if (options?.overwrite) {
        // 更新现有技能
        return this.updateSkill(existing.id, {
          content,
          description: metadata?.description
        }) as Skill;
      } else {
        throw new Error(`Skill with name "${name}" already exists`);
      }
    }

    // 创建新技能
    return this.createSkill({
      name,
      description: metadata?.description || "",
      content,
      source: "imported",
      category: "other"
    });
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  /**
   * 将数据库行映射为 Skill 对象
   */
  private mapSkillRow(row: Record<string, unknown>): Skill {
    let compatibleRuntimes: SkillRuntime[] | undefined;
    if (row.compatible_runtimes) {
      try {
        compatibleRuntimes = JSON.parse(String(row.compatible_runtimes)) as SkillRuntime[];
      } catch {
        compatibleRuntimes = ["claude"];
      }
    }

    return {
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      content: String(row.content),
      source: String(row.source) as SkillSource,
      isEnabled: Boolean(row.is_enabled),
      icon: row.icon ? String(row.icon) : undefined,
      category: String(row.category) as SkillCategory,
      compatibleRuntimes,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }
}

export default SkillStore;
