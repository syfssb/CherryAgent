import { ipcMain } from "electron";
import { syncManagedSkills, listPresetSkills, removeManagedSkillFile, scanUserCreatedSkills } from "../libs/skill-files.js";
import { validateSyntax } from "../libs/skill-validator.js";
import type { SkillCreateInput, SkillUpdateInput } from "../types/local-db.js";
import type { SkillSearchOptions } from "../libs/skill-store.js";
import { initializeSessions, skillStore } from "./core.js";

/**
 * 注册技能系统相关的 IPC 处理器
 */

/** 不允许导入的技能名称黑名单（这些技能已被移除） */
const BLOCKED_SKILL_NAMES = new Set(['anthropic-ui', 'anthropic-ui-design', 'user-guide-creation']);

export function registerSkillHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const skillChannels = [
    "skill:getAll", "skill:getEnabled", "skill:refresh", "skill:get",
    "skill:create", "skill:update", "skill:delete", "skill:toggle",
    "skill:validate", "skill:search", "skill:getByCategory", "skill:getStats",
    "skill:export", "skill:import", "skill:getContext", "skill:getPrompt",
  ];
  for (const ch of skillChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  // 确保 sessions 已初始化
  initializeSessions();
  try {
    // 清理黑名单技能（用户已移除的预装技能）
    for (const blockedName of BLOCKED_SKILL_NAMES) {
      const existing = skillStore.getSkillByName(blockedName);
      if (existing) {
        skillStore.deleteSkill(existing.id);
        removeManagedSkillFile(existing.id);
        console.info(`[ipc-handlers] Removed blocked skill "${blockedName}" from database`);
      }
    }

    const presetSkills = listPresetSkills();
    const presetNames = presetSkills.map((preset) => preset.name);
    const removed = skillStore.removeBuiltinSkillsNotIn(presetNames);
    for (const skill of removed) {
      removeManagedSkillFile(skill.id);
    }
    for (const preset of presetSkills) {
      try {
        const existing = skillStore.getSkillByName(preset.name);
        if (existing) continue;
        const created = skillStore.createSkill({
          name: preset.name,
          description: preset.description,
          content: preset.content,
          source: "builtin",
          isEnabled: true,
          category: preset.category as any,
          icon: preset.icon,
          compatibleRuntimes: ["claude", "codex"]
        });
        // 不为 builtin skill 写 db-{id}/SKILL.md 副本，它们已有独立目录
      } catch (err) {
        console.error(`[ipc-handlers] Failed to create preset skill "${preset.name}":`, err);
      }
    }
    // 清理 builtin skill 遗留的 db-{id}/SKILL.md 副本（历史 bug 产生的重复文件）。
    // Builtin 技能已有独立目录（如 frontend-design/），db- 副本会导致 SDK 重复发现。
    const builtinSkills = skillStore.getAllSkills().filter((s) => s.source === "builtin");
    for (const bs of builtinSkills) {
      removeManagedSkillFile(bs.id);
    }

    // 只对非 builtin 技能写 db-{id}/SKILL.md 文件。
    const nonBuiltinSkills = skillStore.getAllSkills().filter((s) => s.source !== "builtin");
    syncManagedSkills(nonBuiltinSkills);
  } catch (error) {
    console.error("[ipc-handlers] skill sync failed:", error);
  }

  // skill:getAll - 获取所有技能
  ipcMain.handle("skill:getAll", () => {
    try {
      const skills = skillStore.getAllSkills();
      return {
        success: true,
        data: skills
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:getAll failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get skills"
      };
    }
  });

  // skill:getEnabled - 获取启用的技能
  ipcMain.handle("skill:getEnabled", () => {
    try {
      const skills = skillStore.getEnabledSkills();
      return {
        success: true,
        data: skills
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:getEnabled failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get enabled skills"
      };
    }
  });

  // skill:refresh - 刷新技能列表（同步文件系统中的用户 skill 到数据库）
  ipcMain.handle("skill:refresh", () => {
    try {
      // 扫描用户创建的 skills
      const userSkills = scanUserCreatedSkills();
      let synced = 0;

      // 有效的 category 值
      const validCategories = ['development', 'writing', 'analysis', 'automation', 'communication', 'other'];

      for (const skill of userSkills) {
        // 跳过黑名单技能
        if (BLOCKED_SKILL_NAMES.has(skill.name)) continue;

        // 检查是否已存在
        const existing = skillStore.getSkillByName(skill.name);
        if (existing) continue;

        // 验证 category
        const category = validCategories.includes(skill.category || '') ? skill.category : 'other';

        // 创建 skill
        skillStore.createSkill({
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
        console.log(`[skill:refresh] Synced skill "${skill.name}" to database`);
      }

      if (synced > 0) {
        console.log(`[skill:refresh] Synced ${synced} user-created skills`);
      }

      // 返回最新的 skill 列表
      const skills = skillStore.getAllSkills();
      return {
        success: true,
        data: skills
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:refresh failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to refresh skills"
      };
    }
  });

  // skill:get - 获取单个技能
  ipcMain.handle("skill:get", (_, id: string) => {
    try {
      const skill = skillStore.getSkill(id);
      return {
        success: true,
        data: skill
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:get failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get skill"
      };
    }
  });

  // skill:create - 创建新技能
  ipcMain.handle("skill:create", (_, input: SkillCreateInput) => {
    try {
      const skill = skillStore.createSkill(input);
      syncManagedSkills([skill]);
      return {
        success: true,
        data: skill
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:create failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create skill"
      };
    }
  });

  // skill:update - 更新技能
  ipcMain.handle("skill:update", (_, id: string, input: SkillUpdateInput) => {
    try {
      const skill = skillStore.updateSkill(id, input);
      if (!skill) {
        return {
          success: false,
          error: "Skill not found"
        };
      }
      syncManagedSkills([skill]);
      return {
        success: true,
        data: skill
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:update failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update skill"
      };
    }
  });

  // skill:delete - 删除技能
  ipcMain.handle("skill:delete", (_, id: string) => {
    try {
      const deleted = skillStore.deleteSkill(id);
      syncManagedSkills([
        {
          id,
          name: "",
          description: "",
          content: "",
          source: "custom",
          isEnabled: false,
          icon: "",
          category: "other",
          createdAt: 0,
          updatedAt: 0
        } as any
      ]);
      return {
        success: deleted,
        error: deleted ? undefined : "Skill not found or cannot be deleted"
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:delete failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete skill"
      };
    }
  });

  // skill:toggle - 切换技能启用状态
  ipcMain.handle("skill:toggle", (_, id: string) => {
    try {
      const newEnabled = skillStore.toggleSkill(id);
      const skill = skillStore.getSkill(id);
      if (skill) {
        syncManagedSkills([skill]);
      }
      return {
        success: true,
        data: newEnabled
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:toggle failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to toggle skill"
      };
    }
  });

  // skill:validate - 验证技能内容
  ipcMain.handle("skill:validate", (_, content: string) => {
    try {
      const result = validateSyntax(content);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:validate failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to validate skill"
      };
    }
  });

  // skill:search - 搜索技能
  ipcMain.handle("skill:search", (_, options: SkillSearchOptions) => {
    try {
      const skills = skillStore.searchSkills(options);
      return {
        success: true,
        data: skills
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:search failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to search skills"
      };
    }
  });

  // skill:getByCategory - 按分类获取技能
  ipcMain.handle("skill:getByCategory", (_, category: string) => {
    try {
      const skills = skillStore.getSkillsByCategory(category as any);
      return {
        success: true,
        data: skills
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:getByCategory failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get skills by category"
      };
    }
  });

  // skill:getStats - 获取技能统计
  ipcMain.handle("skill:getStats", () => {
    try {
      const stats = skillStore.getSkillStats();
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:getStats failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get skill stats"
      };
    }
  });

  // skill:export - 导出技能
  ipcMain.handle("skill:export", (_, id: string) => {
    try {
      const content = skillStore.exportSkill(id);
      if (!content) {
        return {
          success: false,
          error: "Skill not found"
        };
      }
      return {
        success: true,
        data: content
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:export failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to export skill"
      };
    }
  });

  // skill:import - 导入技能
  ipcMain.handle("skill:import", (_, content: string, options?: { name?: string; overwrite?: boolean }) => {
    try {
      const skill = skillStore.importSkill(content, options);
      syncManagedSkills([skill]);
      return {
        success: true,
        data: skill
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:import failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to import skill"
      };
    }
  });

  // skill:getContext - 获取技能上下文
  ipcMain.handle("skill:getContext", (_, options?: { skillIds?: string[]; maxSkills?: number }) => {
    try {
      const context = skillStore.getSkillContext(options);
      return {
        success: true,
        data: context
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:getContext failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get skill context"
      };
    }
  });

  // skill:getPrompt - 获取技能提示（处理变量替换）
  ipcMain.handle("skill:getPrompt", (_, skillId: string, variables?: Record<string, string>) => {
    try {
      const prompt = skillStore.getSkillPrompt(skillId, variables);
      if (!prompt) {
        return {
          success: false,
          error: "Skill not found"
        };
      }
      return {
        success: true,
        data: prompt
      };
    } catch (error) {
      console.error("[ipc-handlers] skill:getPrompt failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get skill prompt"
      };
    }
  });

  console.info("[ipc-handlers] Skill handlers registered");
}
