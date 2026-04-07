/**
 * 本地数据库类型定义
 * 扩展 Session 及相关实体的类型
 */

import type { SessionStatus, StreamMessage } from "../types.js";

// ============================================================================
// Tag 相关类型
// ============================================================================

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface SessionTag {
  sessionId: string;
  tagId: string;
  createdAt: number;
}

// ============================================================================
// Session 扩展类型
// ============================================================================

export interface ExtendedSession {
  id: string;
  title: string;
  claudeSessionId?: string;
  status: SessionStatus;
  cwd?: string;
  allowedTools?: string;
  activeSkillIds?: string[];
  skillMode?: "manual" | "auto";
  lastPrompt?: string;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SessionWithTags extends ExtendedSession {
  tags: Tag[];
}

export interface ExtendedSessionHistory {
  session: SessionWithTags;
  messages: StreamMessage[];
}

// ============================================================================
// Memory 系统类型
// ============================================================================

export interface MemoryBlock {
  id: string;
  label: string;
  description: string;
  value: string;
  charLimit: number;
  createdAt: number;
  updatedAt: number;
}

export interface ArchivalMemory {
  id: string;
  content: string;
  embedding?: Float32Array | null;
  sourceSessionId?: string;
  tags: string[];
  createdAt: number;
}

export interface ArchivalMemoryCreateInput {
  content: string;
  embedding?: number[] | Float32Array;
  sourceSessionId?: string;
  tags?: string[];
}

export interface ArchivalMemorySearchResult extends ArchivalMemory {
  similarity?: number;
}

// ============================================================================
// Skills 系统类型
// ============================================================================

export type SkillSource = "builtin" | "custom" | "imported";

export type SkillCategory =
  | "development"
  | "writing"
  | "analysis"
  | "automation"
  | "communication"
  | "other";

export type SkillRuntime = "claude" | "codex";

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  source: SkillSource;
  isEnabled: boolean;
  icon?: string;
  category: SkillCategory;
  compatibleRuntimes?: SkillRuntime[];
  createdAt: number;
  updatedAt: number;
}

export interface SkillCreateInput {
  name: string;
  description: string;
  content: string;
  source?: SkillSource;
  isEnabled?: boolean;
  icon?: string;
  category?: SkillCategory;
  compatibleRuntimes?: SkillRuntime[];
}

export interface SkillUpdateInput {
  name?: string;
  description?: string;
  content?: string;
  isEnabled?: boolean;
  icon?: string;
  category?: SkillCategory;
  compatibleRuntimes?: SkillRuntime[];
}

// ============================================================================
// Local Settings 类型
// ============================================================================

export interface LocalSetting {
  key: string;
  value: string;
  updatedAt: number;
}

export interface LocalSettingsMap {
  [key: string]: unknown;
}

// 预定义的设置键
export type SettingKey =
  | "theme"
  | "language"
  | "autoSave"
  | "defaultCwd"
  | "maxHistoryItems"
  | "enableTelemetry"
  | "apiEndpoint"
  | "customPrompt"
  | string;

// ============================================================================
// 迁移系统类型
// ============================================================================

export interface Migration {
  version: number;
  name: string;
  up: (db: import("better-sqlite3").Database) => void;
  down: (db: import("better-sqlite3").Database) => void;
}

export interface MigrationRecord {
  version: number;
  name: string;
  appliedAt: number;
}

// ============================================================================
// 搜索相关类型
// ============================================================================

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export interface SessionSearchResult {
  session: SessionWithTags;
  matchedField: "title" | "content";
  snippet?: string;
}

export interface MessageSearchResult {
  sessionId: string;
  sessionTitle: string;
  messageId: string;
  content: string;
  snippet: string;
  rank: number;
  createdAt: number;
}

export interface FullSearchResult {
  sessions: SessionWithTags[];
  messages: MessageSearchResult[];
  totalSessions: number;
  totalMessages: number;
}
