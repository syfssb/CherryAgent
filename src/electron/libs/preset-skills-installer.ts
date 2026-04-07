import { app } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, cpSync, readdirSync, rmSync, readFileSync, writeFileSync } from "fs";
import { parseFrontmatter } from "@cherry-agent/core";
import { getSkillsDir, ensureSkillsPluginManifest, scanUserCreatedSkills } from "./skill-files.js";
import type { SkillStore } from "./skill-store.js";
import { getApiOriginBaseUrl } from "./runtime-config.js";

/**
 * 远程 Skill 数据结构（从 API 返回）
 */
interface RemoteSkill {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  skillContent: string;
  icon: string | null;
  sortOrder: number;
  version: string;
  updatedAt: string;
  i18n: Record<string, Record<string, string>> | null;
}

/**
 * 获取 API 基础 URL
 */
function getApiBaseUrl(): string {
  return getApiOriginBaseUrl();
}

/**
 * 从远程 API 获取默认 skill 列表
 */
async function fetchRemoteDefaultSkills(): Promise<RemoteSkill[]> {
  try {
    const url = `${getApiBaseUrl()}/api/skills/defaults`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[preset-skills] Failed to fetch remote skills: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.success || !data.data?.skills) {
      return [];
    }

    return data.data.skills as RemoteSkill[];
  } catch (error) {
    console.warn("[preset-skills] Failed to fetch remote skills:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 检测 SKILL.md 内容中引用了但不存在的本地相对路径文件
 */
function auditSkillDependencies(skillDir: string, skillContent: string): string[] {
  const missing: string[] = [];
  const fileExt = '(?:js|ts|py|md|json|sh|txt)';

  // Pattern 1: ./relative/path.ext (dot-slash prefix)
  const dotSlashRegex = new RegExp(`(?:^|\\s|\`|'|")(\\.[\\/\\\\][\\w\\-.\\/\\\\]+\\.${fileExt})(?:\`|'|"|\\s|$)`, 'gm');
  // Pattern 2: markdown links [text](relative-path.ext) — excludes http(s) URLs
  const mdLinkRegex = new RegExp(`\\]\\(([^)]+\\.${fileExt})\\)`, 'gm');

  for (const regex of [dotSlashRegex, mdLinkRegex]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(skillContent)) !== null) {
      const refPath = match[1];
      if (/^https?:\/\//.test(refPath)) continue;
      const absPath = join(skillDir, refPath);
      if (!existsSync(absPath)) {
        missing.push(refPath);
      }
    }
  }
  return [...new Set(missing)];
}

/**
 * 在 SKILL.md 内容中插入降级模式警告（仅当有缺失资源时）
 */
function addDegradedModeNote(content: string, missingRefs: string[]): string {
  if (missingRefs.length === 0) return content;
  const warningLines = [
    '',
    '> **⚠️ 降级模式运行**：以下本地资源文件在当前环境中不可用，Skill 将在无这些资源的情况下运行，相关功能可能受限：',
    ...missingRefs.map(r => `> - \`${r}\``),
    '> 请仅使用当前已具备的工具和上下文完成任务，不要假设这些本地脚本一定可以执行。',
    '',
  ].join('\n');

  const frontmatterMatch = content.match(/^---[\s\S]*?---\n/);
  if (frontmatterMatch) {
    const insertAt = frontmatterMatch[0].length;
    return content.slice(0, insertAt) + warningLines + content.slice(insertAt);
  }
  return warningLines + '\n' + content;
}

function getPresetSkillsPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "preset-skills");
  }
  const candidates = [
    join(app.getAppPath(), "resources/preset-skills"),
    join(process.cwd(), "resources/preset-skills"),
    join(dirname(fileURLToPath(import.meta.url)), "../../../resources/preset-skills"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1];
}

export function installPresetSkills(externalSkillStore?: SkillStore): { installed: number; skipped: number } {
  const skillsDir = getSkillsDir();
  // SDK expects skills to be in {plugin-root}/skills/ subdirectory
  const sdkSkillsDir = join(skillsDir, "skills");
  const presetPath = getPresetSkillsPath();

  if (!existsSync(presetPath)) {
    console.log("[preset-skills] No preset skills found at", presetPath);
    return { installed: 0, skipped: 0 };
  }

  if (!existsSync(sdkSkillsDir)) {
    mkdirSync(sdkSkillsDir, { recursive: true });
  }

  let installed = 0;
  let skipped = 0;

  for (const skillName of readdirSync(presetPath)) {
    const sourcePath = join(presetPath, skillName);
    const targetPath = join(sdkSkillsDir, skillName);

    const alreadyExists = existsSync(targetPath);
    // Always sync preset skills to ensure existing users get new/updated files
    cpSync(sourcePath, targetPath, { recursive: true });

    // Audit skill dependencies and inject degraded mode note if needed
    const targetSkillFile = join(targetPath, "SKILL.md");
    if (existsSync(targetSkillFile)) {
      const originalContent = readFileSync(targetSkillFile, "utf-8");
      const missingRefs = auditSkillDependencies(targetPath, originalContent);
      if (missingRefs.length > 0) {
        console.warn('[preset-skills] Skill missing local refs, adding degraded note:', skillName, missingRefs);
        const patchedContent = addDegradedModeNote(originalContent, missingRefs);
        writeFileSync(targetSkillFile, patchedContent, "utf-8");
      }
    }

    if (alreadyExists) {
      skipped++;
    } else {
      installed++;
    }
  }

  // Remove old preset skills that no longer exist in the source
  const presetSourceNames = new Set(readdirSync(presetPath));
  let removed = 0;

  // Clean up obsolete presets from SDK skills dir ({userData}/skills/skills/)
  for (const entry of readdirSync(sdkSkillsDir)) {
    if (entry.startsWith("db-")) continue;
    const entryPath = join(sdkSkillsDir, entry);
    const skillFile = join(entryPath, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    try {
      const content = readFileSync(skillFile, "utf-8");
      if (!content.includes("managedBy: preset")) continue;
    } catch {
      continue;
    }

    if (!presetSourceNames.has(entry)) {
      rmSync(entryPath, { recursive: true, force: true });
      removed++;
      console.log(`[preset-skills] removed obsolete preset from sdk dir: ${entry}`);
    }
  }

  // Also clean up the ROOT skills dir ({userData}/skills/) which may contain:
  // 1. Obsolete presets from older installations (before skills/skills/ migration)
  // 2. Duplicate copies that already exist in skills/skills/
  // This MUST run before ensureSkillsPluginManifest() which would otherwise
  // move these stale root dirs back into skills/skills/.
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".claude-plugin" || entry.name === "skills") continue;
    const rootEntryPath = join(skillsDir, entry.name);
    const rootSkillFile = join(rootEntryPath, "SKILL.md");
    if (!existsSync(rootSkillFile)) continue;

    try {
      const content = readFileSync(rootSkillFile, "utf-8");
      const isPreset = content.includes("managedBy: preset");

      // Remove if: obsolete preset OR duplicate already in sdk dir
      const alreadyInSdkDir = existsSync(join(sdkSkillsDir, entry.name));
      const isObsoletePreset = isPreset && !presetSourceNames.has(entry.name);

      if (isObsoletePreset || alreadyInSdkDir) {
        rmSync(rootEntryPath, { recursive: true, force: true });
        removed++;
        console.log(`[preset-skills] removed from root dir: ${entry.name} (${isObsoletePreset ? "obsolete" : "duplicate"})`);
      }
    } catch {
      continue;
    }
  }

  // Ensure plugin manifest exists for SDK to recognize skills
  ensureSkillsPluginManifest();

  // Sync preset skills to SQLite database so they appear in
  // getSkillContextSummary() prompt injection and are discoverable by the AI.
  if (externalSkillStore) {
    syncPresetSkillsToDatabase(presetPath, externalSkillStore);
  }

  console.log(`[preset-skills] installed ${installed}, skipped ${skipped}, removed ${removed}`);
  return { installed, skipped };
}

/**
 * Sync preset skills from the bundled resources to the SQLite database.
 *
 * Why this is needed:
 * - installPresetSkills() copies SKILL.md files to the SDK plugin directory (filesystem)
 * - The SDK plugin system can discover these for the "Skill" tool invocation
 * - BUT getSkillContextSummary() only queries the SQLite `skills` table
 * - Without DB records, preset skills are INVISIBLE to prompt injection (<skill-context>)
 * - The AI never learns about them and never invokes them
 *
 * This function bridges the gap by upserting preset skills into the database
 * with source='builtin', so they appear in the AI's skill context summary.
 */
function syncPresetSkillsToDatabase(presetPath: string, skillStore: SkillStore): void {
  try {
    const db = skillStore.getDatabase();

    // --- One-time deduplication: remove duplicate builtin records ---
    // Previous versions used independent DB connections (WAL isolation),
    // causing the same builtin skill to be inserted multiple times.
    const duplicateRows = db.prepare(`
      SELECT name, COUNT(*) as cnt FROM skills
      WHERE source = 'builtin'
      GROUP BY name HAVING cnt > 1
    `).all() as Array<{ name: string; cnt: number }>;

    if (duplicateRows.length > 0) {
      let deduped = 0;
      for (const row of duplicateRows) {
        // Keep the oldest record (smallest rowid), delete the rest
        const idsToDelete = db.prepare(`
          SELECT id FROM skills
          WHERE source = 'builtin' AND name = ?
          ORDER BY rowid ASC
          LIMIT -1 OFFSET 1
        `).all(row.name) as Array<{ id: string }>;

        for (const { id } of idsToDelete) {
          db.prepare(`DELETE FROM skills WHERE id = ?`).run(id);
          deduped++;
        }
      }
      if (deduped > 0) {
        console.log(`[preset-skills] Deduplicated ${deduped} duplicate builtin records`);
      }
    }

    const presetNames: string[] = [];
    let created = 0;
    let updated = 0;

    for (const skillName of readdirSync(presetPath)) {
      const skillFile = join(presetPath, skillName, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const content = readFileSync(skillFile, "utf-8");
      const { meta } = parseFrontmatter(content);
      if (meta.managedBy !== "preset") continue;

      const name = meta.name || skillName;
      presetNames.push(name);

      const existing = skillStore.getSkillByName(name);
      if (existing) {
        if (existing.source === "builtin" && existing.content !== content) {
          // SkillStore.updateSkill() blocks content changes for builtin skills,
          // so we update directly via SQL to keep preset content in sync.
          db.prepare(
            `UPDATE skills SET content = ?, description = ?, category = ?, icon = ?, updated_at = ? WHERE id = ?`
          ).run(
            content,
            meta.description || "",
            meta.category || "other",
            meta.icon || null,
            Date.now(),
            existing.id
          );
          updated++;
        }
        // If user changed source to custom/imported, don't overwrite their changes
        continue;
      }

      // Create new builtin skill
      skillStore.createSkill({
        name,
        description: meta.description || "",
        content,
        source: "builtin",
        isEnabled: true,
        category: (meta.category || "other") as "development" | "writing" | "analysis" | "automation" | "communication" | "other",
        icon: meta.icon,
        compatibleRuntimes: ["claude", "codex"],
      });
      created++;
    }

    // Remove builtin skills from DB that are no longer in the preset source
    const removed = skillStore.removeBuiltinSkillsNotIn(presetNames);

    if (created > 0 || updated > 0 || removed.length > 0) {
      console.log(`[preset-skills] DB sync: created=${created} updated=${updated} removed=${removed.length}`);
    }
  } catch (error) {
    console.error("[preset-skills] Failed to sync preset skills to database:", error);
  }
}

/**
 * Sync user-created skills from filesystem to database.
 * This allows skills created manually (e.g., by Claude) to appear in the UI.
 */
export function syncUserCreatedSkillsToDb(externalSkillStore?: SkillStore): { synced: number; skipped: number } {
  const userSkills = scanUserCreatedSkills();
  if (userSkills.length === 0) {
    return { synced: 0, skipped: 0 };
  }

  if (!externalSkillStore) {
    console.warn("[user-skills] No skillStore provided, skipping sync");
    return { synced: 0, skipped: 0 };
  }

  let synced = 0;
  let skipped = 0;

  for (const skill of userSkills) {
    try {
      // Check if skill already exists in database
      const existing = externalSkillStore.getSkillByName(skill.name);
      if (existing) {
        skipped++;
        continue;
      }

      // Validate category - only allow valid categories
      const validCategories = ['development', 'writing', 'analysis', 'automation', 'communication', 'other'];
      const category = validCategories.includes(skill.category || '') ? skill.category : 'other';

      // Create skill in database
      externalSkillStore.createSkill({
        name: skill.name,
        description: skill.description,
        content: skill.content,
        source: "custom",
        isEnabled: true,
        category: category as any,
        icon: skill.icon,
        compatibleRuntimes: ["claude", "codex"]
      });
      synced++;
      console.log(`[user-skills] Synced skill "${skill.name}" to database`);
    } catch (error) {
      console.error(`[user-skills] Failed to sync skill "${skill.name}":`, error);
      skipped++;
    }
  }

  if (synced > 0) {
    console.log(`[user-skills] Synced ${synced} user-created skills to database`);
  }

  return { synced, skipped };
}

/**
 * Install a single remote skill to the SDK skills directory.
 * Creates the skill directory and writes SKILL.md with frontmatter.
 */
function installRemoteSkill(sdkSkillsDir: string, skill: RemoteSkill): void {
  const skillDir = join(sdkSkillsDir, `remote-${skill.slug}`);
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
  }

  const frontmatterLines = [
    "---",
    `name: ${skill.name}`,
    skill.description ? `description: ${skill.description}` : null,
    `category: ${skill.category}`,
    skill.icon ? `icon: ${skill.icon}` : null,
    "source: remote",
    "enabled: true",
    `managedBy: remote-preset`,
    `version: ${skill.version}`,
    `remoteId: ${skill.id}`,
    skill.i18n ? `i18n: ${JSON.stringify(skill.i18n)}` : null,
    "---",
  ].filter((line): line is string => line !== null);

  const frontmatter = `${frontmatterLines.join("\n")}\n\n`;
  let contentToWrite = `${frontmatter}${skill.skillContent}`;

  // Audit skill dependencies and inject degraded mode note if needed
  const missingRefs = auditSkillDependencies(skillDir, contentToWrite);
  if (missingRefs.length > 0) {
    console.warn('[preset-skills] Skill missing local refs, adding degraded note:', skill.name, missingRefs);
    contentToWrite = addDegradedModeNote(contentToWrite, missingRefs);
  }

  writeFileSync(join(skillDir, "SKILL.md"), contentToWrite, "utf-8");
}

/**
 * Sync default skills from the remote API.
 * - Fetches the default skill list from GET /api/skills/defaults
 * - Installs missing skills
 * - Updates skills whose version has changed
 * - Removes remote-preset skills that are no longer in the defaults list
 */
export async function syncRemotePresetSkills(): Promise<{ installed: number; updated: number; removed: number }> {
  const remoteSkills = await fetchRemoteDefaultSkills();
  if (remoteSkills.length === 0) {
    return { installed: 0, updated: 0, removed: 0 };
  }

  const skillsDir = getSkillsDir();
  const sdkSkillsDir = join(skillsDir, "skills");
  if (!existsSync(sdkSkillsDir)) {
    mkdirSync(sdkSkillsDir, { recursive: true });
  }

  let installed = 0;
  let updated = 0;
  let removed = 0;

  const remoteSlugs = new Set<string>();

  for (const skill of remoteSkills) {
    const dirName = `remote-${skill.slug}`;
    remoteSlugs.add(dirName);
    const skillDir = join(sdkSkillsDir, dirName);
    const skillFile = join(skillDir, "SKILL.md");

    if (!existsSync(skillFile)) {
      installRemoteSkill(sdkSkillsDir, skill);
      installed++;
      console.log(`[preset-skills] Installed remote skill: ${skill.name} (${skill.slug})`);
      continue;
    }

    // Check version for updates
    try {
      const existingContent = readFileSync(skillFile, "utf-8");
      const versionMatch = existingContent.match(/^version:\s*(.+)$/m);
      const existingVersion = versionMatch ? versionMatch[1].trim() : "";

      if (existingVersion !== skill.version) {
        installRemoteSkill(sdkSkillsDir, skill);
        updated++;
        console.log(`[preset-skills] Updated remote skill: ${skill.name} (${existingVersion} -> ${skill.version})`);
      }
    } catch {
      // If we can't read the file, reinstall
      installRemoteSkill(sdkSkillsDir, skill);
      updated++;
    }
  }

  // Remove remote-preset skills that are no longer in the defaults list
  for (const entry of readdirSync(sdkSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("remote-")) continue;
    if (remoteSlugs.has(entry.name)) continue;

    const entryPath = join(sdkSkillsDir, entry.name);
    const skillFile = join(entryPath, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    try {
      const content = readFileSync(skillFile, "utf-8");
      if (!content.includes("managedBy: remote-preset")) continue;
    } catch {
      continue;
    }

    rmSync(entryPath, { recursive: true, force: true });
    removed++;
    console.log(`[preset-skills] Removed obsolete remote skill: ${entry.name}`);
  }

  if (installed > 0 || updated > 0 || removed > 0) {
    ensureSkillsPluginManifest();
    console.log(`[preset-skills] Remote sync: installed ${installed}, updated ${updated}, removed ${removed}`);
  }

  return { installed, updated, removed };
}

/**
 * 审计所有已安装的 preset skills，返回有缺失本地资源的 skill 列表
 */
export async function auditAllPresetSkills(): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  // 此函数为诊断用途，暂返回空对象
  // 后续可扩展为扫描 skills 目录
  return result;
}
