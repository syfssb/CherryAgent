/**
 * 会话相关类型定义
 * 从 src/electron/libs/session-store.ts 提取
 */

import type { SessionStatus, PermissionMode, StreamMessage } from './events.js';

export type Tag = {
  id: string;
  name: string;
  color: string;
  createdAt: number;
};

export type PendingPermission = {
  toolUseId: string;
  toolName: string;
  input: unknown;
  resolve: (result: { behavior: "allow" | "deny"; updatedInput?: unknown; message?: string }) => void;
};

export type StoredSession = {
  id: string;
  title: string;
  status: SessionStatus;
  cwd?: string;
  allowedTools?: string;
  activeSkillIds?: string[];
  skillMode?: "manual" | "auto";
  lastPrompt?: string;
  claudeSessionId?: string;
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
  isArchived: boolean;
  permissionMode?: PermissionMode;
  tags?: Tag[];
};

export type SessionListOptions = {
  includeArchived?: boolean;
  tagId?: string;
  query?: string;
};

export type SessionHistory = {
  session: StoredSession;
  messages: StreamMessage[];
};
