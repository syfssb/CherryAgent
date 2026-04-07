/**
 * Skill 文件管理 - Electron 薄封装层
 *
 * 委托给 @cherry-agent/core 的 SkillFileManager
 * 仅负责注入 Electron 特有的路径解析器
 */

import { app } from "electron";
import { SkillFileManager } from "@cherry-agent/core";
import type { SkillData, SkillFrontmatter } from "@cherry-agent/core";
import type { IPathResolver } from "@cherry-agent/shared";
import type { Skill } from "../types/local-db.js";

// ==================== Electron 路径解析器 ====================

const electronPathResolver: IPathResolver = {
  getUserDataPath: () => app.getPath("userData"),
  getAppPath: () => app.getAppPath(),
  getTempPath: () => app.getPath("temp"),
  getDesktopPath: () => app.getPath("desktop"),
  getDocumentsPath: () => app.getPath("documents"),
  getDownloadsPath: () => app.getPath("downloads"),
  isPackaged: () => app.isPackaged,
  getResourcesPath: () => process.resourcesPath,
};

// ==================== 单例实例 ====================

let _manager: SkillFileManager | null = null;

function getManager(): SkillFileManager {
  if (!_manager) {
    _manager = new SkillFileManager(electronPathResolver);
  }
  return _manager;
}

// ==================== 向后兼容的导出 ====================

export type { SkillFrontmatter };

export function getSkillsDir(): string {
  return getManager().getSkillsDir();
}

export function getSkillsPluginRoot(): string {
  return getManager().getSkillsPluginRoot();
}

export function getSkillPluginPaths(): string[] {
  return getManager().getSkillPluginPaths();
}

export function writeManagedSkillFile(skill: Skill, content?: string): string {
  return getManager().writeManagedSkillFile(skill as SkillData, content);
}

export function removeManagedSkillFile(skillId: string): boolean {
  return getManager().removeManagedSkillFile(skillId);
}

export function syncManagedSkills(skills: Skill[], runtime?: string): void {
  const filtered = runtime
    ? skills.filter((s) => {
        const runtimes = s.compatibleRuntimes ?? ["claude"];
        return runtimes.includes(runtime as import("../types/local-db.js").SkillRuntime);
      })
    : skills;
  getManager().syncManagedSkills(filtered as SkillData[]);
}

export function listPresetSkills(): Array<{
  name: string;
  description: string;
  content: string;
  category?: string;
  icon?: string;
}> {
  return getManager().listPresetSkills();
}

export function ensureSkillsPluginManifest(): void {
  getManager().ensureSkillsPluginManifest();
}

export function scanUserCreatedSkills(): Array<{
  name: string;
  description: string;
  content: string;
  category?: string;
  icon?: string;
  dirName: string;
}> {
  return getManager().scanUserCreatedSkills();
}
