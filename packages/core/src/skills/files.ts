/**
 * Skill 文件管理 - 平台无关的核心逻辑
 *
 * 从 src/electron/libs/skill-files.ts 抽离
 * 所有路径通过 IPathResolver 注入，不依赖 Electron
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, cpSync } from "fs";
import { join } from "path";
import type { IPathResolver } from "@cherry-agent/shared";

const MANAGED_PREFIX = "db-";
const MAX_DIRNAME_LENGTH = 64;

// ==================== 类型定义 ====================

export type SkillFrontmatter = {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  source?: string;
  enabled?: boolean;
  skillId?: string;
  managedBy?: string;
  tags?: string[];
  author?: string;
  version?: string;
};

export interface SkillData {
  id: string;
  name: string;
  description: string;
  content: string;
  source: string;
  isEnabled: boolean;
  icon?: string;
  category: string;
  compatibleRuntimes?: string[];
  createdAt: number;
  updatedAt: number;
}

// ==================== 纯函数工具 ====================

function sanitizeDirName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "skill";
  const cleaned = trimmed
    .replace(/[\\/<>:"|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, MAX_DIRNAME_LENGTH);
  return cleaned || "skill";
}

export function parseFrontmatter(content: string): { meta: SkillFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const raw = match[1];
  const body = match[2] ?? "";
  const meta: SkillFrontmatter = {};
  for (const line of raw.split("\n")) {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) continue;
    const value = rest.join(":").trim();
    switch (key.trim()) {
      case "name": meta.name = value; break;
      case "description": meta.description = value; break;
      case "category": meta.category = value; break;
      case "icon": meta.icon = value; break;
      case "source": meta.source = value; break;
      case "enabled": meta.enabled = value === "true"; break;
      case "skillId": meta.skillId = value; break;
      case "managedBy": meta.managedBy = value; break;
      case "author": meta.author = value; break;
      case "version": meta.version = value; break;
      case "tags":
        meta.tags = value.split(",").map((v) => v.trim()).filter(Boolean);
        break;
      default: break;
    }
  }
  return { meta, body: body.trim() };
}

export function buildFrontmatter(meta: SkillFrontmatter): string {
  const lines: string[] = ["---"];
  if (meta.name) lines.push(`name: ${meta.name}`);
  if (meta.description) lines.push(`description: ${meta.description}`);
  if (meta.category) lines.push(`category: ${meta.category}`);
  if (meta.icon) lines.push(`icon: ${meta.icon}`);
  if (meta.source) lines.push(`source: ${meta.source}`);
  if (typeof meta.enabled === "boolean") lines.push(`enabled: ${meta.enabled}`);
  if (meta.skillId) lines.push(`skillId: ${meta.skillId}`);
  if (meta.managedBy) lines.push(`managedBy: ${meta.managedBy}`);
  if (meta.author) lines.push(`author: ${meta.author}`);
  if (meta.version) lines.push(`version: ${meta.version}`);
  if (meta.tags && meta.tags.length > 0) lines.push(`tags: ${meta.tags.join(", ")}`);
  lines.push("---", "");
  return lines.join("\n");
}

function getManagedDirName(skillId: string): string {
  return `${MANAGED_PREFIX}${sanitizeDirName(skillId)}`;
}

// ==================== SkillFileManager 类 ====================

/**
 * Skill 文件管理器
 * 通过 IPathResolver 注入路径，不依赖 Electron
 */
export class SkillFileManager {
  private readonly pathResolver: IPathResolver;

  constructor(pathResolver: IPathResolver) {
    this.pathResolver = pathResolver;
  }

  /** 获取 skills 根目录 */
  getSkillsDir(): string {
    const dir = join(this.pathResolver.getUserDataPath(), "skills");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /** 获取 skills plugin 根路径 (传给 SDK) */
  getSkillsPluginRoot(): string {
    return this.getSkillsDir();
  }

  /** 获取 SDK 期望的 skills 子目录 */
  private getSDKSkillsDir(): string {
    const skillsDir = this.getSkillsDir();
    const sdkSkillsDir = join(skillsDir, "skills");
    if (!existsSync(sdkSkillsDir)) {
      mkdirSync(sdkSkillsDir, { recursive: true });
    }
    return sdkSkillsDir;
  }

  /** 获取所有 skill 目录路径 (用于 SDK plugins 配置) */
  getSkillPluginPaths(): string[] {
    const skillsDir = this.getSkillsDir();
    if (!existsSync(skillsDir)) return [];

    const paths: string[] = [];
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillDir = join(skillsDir, entry.name);
      const skillFile = join(skillDir, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      paths.push(skillDir);
    }
    return paths;
  }

  /** 写入数据库管理的 skill 文件 */
  writeManagedSkillFile(skill: SkillData, content?: string): string {
    const sdkSkillsDir = this.getSDKSkillsDir();
    const dirName = getManagedDirName(skill.id);
    const skillDir = join(sdkSkillsDir, dirName);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    const skillContent = content ?? skill.content ?? "";
    const { meta, body } = parseFrontmatter(skillContent);

    const frontmatter = buildFrontmatter({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      icon: skill.icon ?? "",
      source: skill.source,
      enabled: skill.isEnabled ?? false,
      skillId: skill.id,
      managedBy: "db",
      tags: meta.tags,
      author: meta.author,
      version: meta.version,
    });

    const finalContent = `${frontmatter}${body || skillContent}`.trim() + "\n";
    writeFileSync(join(skillDir, "SKILL.md"), finalContent, "utf-8");
    return skillDir;
  }

  /** 删除数据库管理的 skill 文件 */
  removeManagedSkillFile(skillId: string): boolean {
    const sdkSkillsDir = this.getSDKSkillsDir();
    const dirName = getManagedDirName(skillId);
    const skillDir = join(sdkSkillsDir, dirName);
    if (!existsSync(skillDir)) return false;
    rmSync(skillDir, { recursive: true, force: true });
    return true;
  }

  /** 同步所有数据库管理的 skills 到文件系统 */
  syncManagedSkills(skills: SkillData[]): void {
    for (const skill of skills) {
      if (skill.isEnabled) {
        this.writeManagedSkillFile(skill);
      } else {
        this.removeManagedSkillFile(skill.id);
      }
    }
  }

  /** 列出预设 skills */
  listPresetSkills(): Array<{
    name: string;
    description: string;
    content: string;
    category?: string;
    icon?: string;
  }> {
    const sdkSkillsDir = this.getSDKSkillsDir();
    if (!existsSync(sdkSkillsDir)) return [];

    const presets: Array<{
      name: string;
      description: string;
      content: string;
      category?: string;
      icon?: string;
    }> = [];

    for (const entry of readdirSync(sdkSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(MANAGED_PREFIX)) continue;
      const skillDir = join(sdkSkillsDir, entry.name);
      const skillFile = join(skillDir, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const content = readFileSync(skillFile, "utf-8");
      const { meta } = parseFrontmatter(content);
      if (meta.managedBy !== "preset") continue;

      presets.push({
        name: meta.name || entry.name,
        description: meta.description || "",
        content,
        category: meta.category,
        icon: meta.icon,
      });
    }

    if (presets.length > 0) return presets;

    // Fallback: read preset skills from bundled resources
    const resourceDir = this.getPresetSkillsResourceDir();
    if (!resourceDir || !existsSync(resourceDir)) return presets;

    for (const entry of readdirSync(resourceDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillDir = join(resourceDir, entry.name);
      const skillFile = join(skillDir, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      const content = readFileSync(skillFile, "utf-8");
      const { meta } = parseFrontmatter(content);
      presets.push({
        name: meta.name || entry.name,
        description: meta.description || "",
        content,
        category: meta.category,
        icon: meta.icon,
      });
    }

    return presets;
  }

  /** 获取预设 skills 资源目录 */
  private getPresetSkillsResourceDir(): string | null {
    if (this.pathResolver.isPackaged()) {
      return join(this.pathResolver.getResourcesPath(), "preset-skills");
    }
    const candidatePaths = [
      join(this.pathResolver.getAppPath(), "resources/preset-skills"),
      join(process.cwd(), "resources/preset-skills"),
    ];
    for (const candidate of candidatePaths) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  /**
   * 确保 SDK plugin manifest 存在
   * 将根目录的 skill 目录迁移到 skills/ 子目录
   */
  ensureSkillsPluginManifest(): void {
    const skillsDir = this.getSkillsDir();
    const claudePluginDir = join(skillsDir, ".claude-plugin");
    const manifestPath = join(claudePluginDir, "plugin.json");
    const sdkSkillsDir = join(skillsDir, "skills");

    // Collect all skill directories (excluding .claude-plugin and skills/)
    const skillDirs: string[] = [];
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".claude-plugin" || entry.name === "skills") continue;
      const skillDir = join(skillsDir, entry.name);
      const skillFile = join(skillDir, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      skillDirs.push(entry.name);
    }

    // Create skills/ subdirectory if needed
    if (!existsSync(sdkSkillsDir)) {
      mkdirSync(sdkSkillsDir, { recursive: true });
    }

    // Move skill directories to skills/ subdirectory (if not already there)
    let movedCount = 0;
    for (const skillName of skillDirs) {
      const srcPath = join(skillsDir, skillName);
      const destPath = join(sdkSkillsDir, skillName);
      if (!existsSync(destPath)) {
        const srcStat = readdirSync(srcPath, { withFileTypes: true });
        mkdirSync(destPath, { recursive: true });
        for (const item of srcStat) {
          const srcItem = join(srcPath, item.name);
          const destItem = join(destPath, item.name);
          if (item.isDirectory()) {
            cpSync(srcItem, destItem, { recursive: true });
          } else {
            const content = readFileSync(srcItem, "utf-8");
            writeFileSync(destItem, content, "utf-8");
          }
        }
        rmSync(srcPath, { recursive: true, force: true });
        movedCount++;
      }
    }

    if (movedCount > 0) {
      console.info(`[skill-files] Moved ${movedCount} skill directories to skills/ subdirectory`);
    }

    // Create plugin manifest
    const manifest = {
      name: "cherry-agent-skills",
      description: "Skills managed by Cherry Agent",
      version: "1.0.0",
    };

    if (!existsSync(claudePluginDir)) {
      mkdirSync(claudePluginDir, { recursive: true });
    }

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    // Count skills in the correct location
    let skillCount = 0;
    if (existsSync(sdkSkillsDir)) {
      for (const entry of readdirSync(sdkSkillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillFile = join(sdkSkillsDir, entry.name, "SKILL.md");
        if (existsSync(skillFile)) skillCount++;
      }
    }

    console.info(`[skill-files] Created plugin manifest with ${skillCount} skills in skills/ directory`);
  }

  /** 扫描用户手动创建的 skills */
  scanUserCreatedSkills(): Array<{
    name: string;
    description: string;
    content: string;
    category?: string;
    icon?: string;
    dirName: string;
  }> {
    const sdkSkillsDir = this.getSDKSkillsDir();
    if (!existsSync(sdkSkillsDir)) return [];

    const userSkills: Array<{
      name: string;
      description: string;
      content: string;
      category?: string;
      icon?: string;
      dirName: string;
    }> = [];

    for (const entry of readdirSync(sdkSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(MANAGED_PREFIX)) continue;
      // remote 预设技能由专门流程管理，不应在“用户自建技能刷新”中重复导入。
      if (entry.name.startsWith("remote-")) continue;

      const skillDir = join(sdkSkillsDir, entry.name);
      const skillFile = join(skillDir, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const content = readFileSync(skillFile, "utf-8");
      const { meta } = parseFrontmatter(content);

      if (meta.managedBy === "preset") continue;
      if (meta.managedBy === "db") continue;
      if (meta.managedBy === "remote-preset") continue;
      if (meta.source === "remote") continue;

      userSkills.push({
        name: meta.name || entry.name,
        description: meta.description || "",
        content,
        category: meta.category,
        icon: meta.icon,
        dirName: entry.name,
      });
    }

    return userSkills;
  }
}
