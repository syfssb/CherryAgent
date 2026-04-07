import Database from "better-sqlite3";
import type { SessionStatus, StreamMessage, PermissionMode } from "../types.js";
import type { CloudSyncService } from "./cloud-sync.js";
import { devLog } from "./dev-logger.js";
import { isAbsolute, resolve } from "path";
import { app } from "electron";

export type PendingPermission = {
  toolUseId: string;
  toolName: string;
  input: unknown;
  resolve: (result: { behavior: "allow" | "deny"; updatedInput?: unknown; message?: string }) => void;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
  createdAt: number;
};

export type Session = {
  id: string;
  title: string;
  claudeSessionId?: string;
  status: SessionStatus;
  cwd?: string;
  allowedTools?: string;
  activeSkillIds?: string[];
  skillMode?: "manual" | "auto";
  lastPrompt?: string;
  pendingPermissions: Map<string, PendingPermission>;
  abortController?: AbortController;
  isPinned?: boolean;
  isArchived?: boolean;
  permissionMode?: PermissionMode;
  provider?: 'claude' | 'codex';
  modelId?: string;
  providerThreadId?: string;
  runtime?: string;
  autoCleanScripts?: boolean;
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
  provider?: 'claude' | 'codex';
  modelId?: string;
  providerThreadId?: string;
  runtime?: string;
  autoCleanScripts?: boolean;
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

// 消息写缓冲条目
type WriteBufferItem = { id: string; sessionId: string; data: string; ts: number };

export class SessionStore {
  private static readonly MAX_LAST_PROMPT_LENGTH = 4000;
  // ── 消息写缓冲（异步批量写入，防止 better-sqlite3 同步写阻塞事件循环） ──
  private static readonly WRITE_FLUSH_MS   = 100;  // 最长等待窗口
  private static readonly WRITE_BUFFER_MAX = 20;   // 超过此数量立即 flush
  private writeBuffer: WriteBufferItem[] = [];
  private writeFlushTimer: ReturnType<typeof setTimeout> | null = null;
  // ─────────────────────────────────────────────────────────────────────────
  private sessions = new Map<string, Session>();
  private sessionsLoaded = false;
  private db: Database.Database;
  private searchIndex = new Map<string, Set<string>>(); // word -> sessionIds
  private searchIndexBuilt = false;
  private syncService?: CloudSyncService;

  constructor(dbPath: string, syncService?: CloudSyncService) {
    // 确保使用绝对路径，避免进程 cwd 变化导致数据库位置漂移
    const absoluteDbPath = isAbsolute(dbPath)
      ? dbPath
      : resolve(app.getPath("userData"), dbPath);
    this.db = new Database(absoluteDbPath);
    this.syncService = syncService;
    this.initialize();
    this.runMigrations();
    // loadSessions() 和 rebuildSearchIndex() 延迟到首次访问时执行
  }

  /**
   * 确保 sessions 已加载到内存（懒初始化）
   */
  private ensureSessionsLoaded(): void {
    if (this.sessionsLoaded) return;
    this.loadSessions();
    this.sessionsLoaded = true;
  }

  /**
   * 确保搜索索引已构建（懒初始化，仅用于 FTS 降级的简单搜索）
   */
  private ensureSearchIndexBuilt(): void {
    if (this.searchIndexBuilt) return;
    this.rebuildSearchIndex();
    this.searchIndexBuilt = true;
  }

  createSession(options: {
    cwd?: string;
    allowedTools?: string;
    activeSkillIds?: string[];
    skillMode?: "manual" | "auto";
    permissionMode?: PermissionMode;
    prompt?: string;
    title: string;
    provider?: 'claude' | 'codex';
    modelId?: string;
  }): Session {
    this.ensureSessionsLoaded();
    const id = crypto.randomUUID();
    const now = Date.now();
    const safeLastPrompt = this.sanitizeLastPrompt(options.prompt);
    const provider = options.provider ?? 'claude';
    const runtime = provider === 'codex' ? 'codex-sdk' : 'claude-sdk';
    const session: Session = {
      id,
      title: options.title,
      status: "idle",
      cwd: options.cwd,
      allowedTools: options.allowedTools,
      activeSkillIds: options.activeSkillIds,
      skillMode: options.skillMode ?? "auto",
      permissionMode: options.permissionMode ?? "bypassPermissions",
      lastPrompt: safeLastPrompt,
      pendingPermissions: new Map(),
      isPinned: false,
      isArchived: false,
      provider,
      runtime,
      modelId: options.modelId
    };
    this.db
      .prepare(
        `insert into sessions
          (id, title, claude_session_id, status, cwd, allowed_tools, active_skill_ids, skill_mode, permission_mode, last_prompt, is_pinned, is_archived, provider, provider_thread_id, runtime, model_id, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        session.title,
        session.claudeSessionId ?? null,
        session.status,
        session.cwd ?? null,
        session.allowedTools ?? null,
        session.activeSkillIds ? JSON.stringify(session.activeSkillIds) : null,
        session.skillMode ?? "auto",
        session.permissionMode ?? "bypassPermissions",
        safeLastPrompt ?? null,
        0,
        0,
        provider,
        session.providerThreadId ?? null,
        runtime,
        session.modelId ?? null,
        now,
        now
      );
    // DB 写入成功后再更新内存，避免 DB 失败留下幽灵 entry
    this.sessions.set(id, session);
    this.updateSearchIndexForSession(id, session.title, session.lastPrompt);

    // 记录同步变更
    if (this.syncService) {
      this.syncService.recordChange('session', id, 'create', session);
    }

    return session;
  }

  getSession(id: string): Session | undefined {
    this.ensureSessionsLoaded();
    return this.sessions.get(id);
  }

  listSessions(options: SessionListOptions = {}): StoredSession[] {
    const { includeArchived = false, tagId, query } = options;

    // 如果有搜索查询，使用搜索功能
    if (query && query.trim()) {
      return this.searchSessions(query, { includeArchived, tagId });
    }

    let sql = `
      select s.id, s.title, s.claude_session_id, s.status, s.cwd, s.allowed_tools,
             s.active_skill_ids, s.skill_mode, s.permission_mode, s.last_prompt, s.is_pinned, s.is_archived,
             s.provider, s.provider_thread_id, s.runtime, s.model_id, s.created_at, s.updated_at
      from sessions s
    `;
    const params: Array<string | number> = [];

    // 如果需要按标签筛选
    if (tagId) {
      sql += ` inner join session_tags st on s.id = st.session_id and st.tag_id = ?`;
      params.push(tagId);
    }

    const conditions: string[] = [];
    if (!includeArchived) {
      conditions.push(`s.is_archived = 0`);
    }

    if (conditions.length > 0) {
      sql += ` where ${conditions.join(" and ")}`;
    }

    // 置顶会话优先，然后按更新时间排序
    sql += ` order by s.is_pinned desc, s.updated_at desc`;

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return this.mapRows(rows);
  }

  listRecentCwds(limit = 8): string[] {
    const rows = this.db
      .prepare(
        `select cwd, max(updated_at) as latest
         from sessions
         where cwd is not null and trim(cwd) != ''
         group by cwd
         order by latest desc
         limit ?`
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => String(row.cwd));
  }

  /**
   * 将会话历史格式化为纯文本对话，用于 SDK 会话 ID 失效时的上下文恢复注入。
   *
   * - 仅提取 user_prompt 和 assistant（文本内容），跳过 tool_use/tool_result/thinking/system 等
   * - maxTurns：保留最近 N 轮（一轮 = 一条 user + 随后的 assistant），防止超长会话撑爆 prompt
   * - maxChars：字符上限兜底截断
   * - 若无可用历史则返回 undefined
   */
  getFormattedHistory(
    id: string,
    options: { maxTurns?: number; maxChars?: number } = {}
  ): string | undefined {
    const { maxTurns = 40, maxChars = 20000 } = options;
    this.flushWriteBuffer();

    const rows = (this.db
      .prepare(
        `select data from messages where session_id = ? order by created_at asc`
      )
      .all(id) as Array<Record<string, unknown>>)
      .map((row) => {
        try {
          return JSON.parse(String(row.data)) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((m): m is Record<string, unknown> => m !== null);

    // 收集对话对，格式：{ role: 'user'|'assistant', text: string }
    type Turn = { role: "user" | "assistant"; text: string };
    const turns: Turn[] = [];

    for (const msg of rows) {
      const type = msg.type as string;
      if (type === "user_prompt") {
        const text = String(msg.prompt ?? "").trim();
        if (text) {
          turns.push({ role: "user", text });
        }
      } else if (type === "assistant") {
        const message = msg.message as Record<string, unknown> | undefined;
        const content = message?.content;
        if (Array.isArray(content)) {
          const textParts: string[] = [];
          for (const block of content as Array<Record<string, unknown>>) {
            if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
              textParts.push(block.text.trim());
            }
          }
          if (textParts.length > 0) {
            turns.push({ role: "assistant", text: textParts.join("\n") });
          }
        }
      }
    }

    if (turns.length === 0) return undefined;

    // 从 turns 数组中，以 user 为轮次起点，保留最近 maxTurns 轮
    // 先找出所有 user turn 的索引
    const userIndices: number[] = [];
    for (let i = 0; i < turns.length; i++) {
      if (turns[i].role === "user") {
        userIndices.push(i);
      }
    }

    // 取最近 maxTurns 轮的起点
    const startTurnIndex =
      userIndices.length <= maxTurns
        ? 0
        : userIndices[userIndices.length - maxTurns];

    const selectedTurns = turns.slice(startTurnIndex);
    const wasTruncated = startTurnIndex > 0;

    // 格式化为文本
    const lines: string[] = [];
    if (wasTruncated) {
      lines.push("（以下为最近部分对话历史，更早的记录已省略）\n");
    }
    for (const turn of selectedTurns) {
      const label = turn.role === "user" ? "[User]" : "[Assistant]";
      lines.push(`${label}: ${turn.text}`);
    }

    let result = lines.join("\n\n");

    // 字符上限兜底截断
    if (result.length > maxChars) {
      result = result.slice(result.length - maxChars);
      // 找到第一个完整的 [User] 或 [Assistant] 行起点，避免截断到一半
      const firstLabelIdx = result.search(/\[(User|Assistant)\]:/);
      if (firstLabelIdx > 0) {
        result = "（历史记录过长，已截取最近部分）\n\n" + result.slice(firstLabelIdx);
      }
    }

    return result;
  }

  getSessionHistory(id: string): SessionHistory | null {
    this.flushWriteBuffer();
    const sessionRow = this.db
      .prepare(
        `select id, title, claude_session_id, status, cwd, allowed_tools, active_skill_ids, skill_mode, last_prompt, is_pinned, is_archived, provider, provider_thread_id, runtime, model_id, created_at, updated_at
         from sessions
         where id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!sessionRow) return null;

    const messages = (this.db
      .prepare(
        `select data, created_at from messages where session_id = ? order by created_at asc`
      )
      .all(id) as Array<Record<string, unknown>>)
      .map((row) => {
        const parsed = JSON.parse(String(row.data)) as StreamMessage;
        const raw = parsed as any;
        if (typeof raw?._createdAt !== "number") {
          raw._createdAt = Number(row.created_at) || Date.now();
        }
        return raw as StreamMessage;
      });

    return {
      session: this.mapRow(sessionRow),
      messages
    };
  }

  /**
   * 分页加载会话历史消息（keyset 分页，避免大会话一次性加载卡顿）
   * 按 turn（user_prompt）为粒度向前翻页，支持游标续取。
   */
  getSessionHistoryPage(sessionId: string, options: {
    beforeCreatedAt?: number;
    beforeRowid?: number;
    targetTurns?: number;
    hardMessageCap?: number;
  } = {}): {
    messages: StreamMessage[];
    hasMore: boolean;
    oldestCursor: { createdAt: number; rowid: number } | null;
    totalMessageCount?: number;
  } | null {
    this.flushWriteBuffer();

    const { beforeCreatedAt, beforeRowid, targetTurns = 3, hardMessageCap = 1000 } = options;
    const hasCursor = beforeCreatedAt !== undefined && beforeRowid !== undefined;

    // 检查 session 存在性
    const sessionRow = this.db
      .prepare(`SELECT id FROM sessions WHERE id = ?`)
      .get(sessionId) as Record<string, unknown> | undefined;
    if (!sessionRow) return null;

    // 多取 1 条用于判断 hasMore
    const fetchLimit = hardMessageCap + 1;
    let rows: Array<Record<string, unknown>>;

    if (hasCursor) {
      // rowid 是 SQLite 单调递增整数，作为同 created_at 消息的确定性 tie-breaker
      rows = this.db
        .prepare(
          `SELECT data, created_at, rowid FROM messages
           WHERE session_id = ? AND (created_at < ? OR (created_at = ? AND rowid < ?))
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?`
        )
        .all(sessionId, beforeCreatedAt, beforeCreatedAt, beforeRowid, fetchLimit) as Array<Record<string, unknown>>;
    } else {
      rows = this.db
        .prepare(
          `SELECT data, created_at, rowid FROM messages
           WHERE session_id = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?`
        )
        .all(sessionId, fetchLimit) as Array<Record<string, unknown>>;
    }

    // 判断 hasMore 并截掉多取的那一条
    let hasMore = rows.length > hardMessageCap;
    if (hasMore) {
      rows = rows.slice(0, hardMessageCap);
    }

    // 按 targetTurns 截断：rows 当前为倒序，遍历计数 user_prompt
    let turnCount = 0;
    let cutIndex = rows.length; // 默认保留全部

    for (let i = 0; i < rows.length; i++) {
      const parsed = JSON.parse(String(rows[i].data)) as Record<string, unknown>;
      if (parsed.type === "user_prompt") {
        turnCount++;
        if (turnCount > targetTurns) {
          // 在这个 user_prompt 处截断（不包含该条）
          cutIndex = i;
          hasMore = true;
          break;
        }
      }
    }

    rows = rows.slice(0, cutIndex);

    // 倒序 → 正序
    rows.reverse();

    // 解析消息（与 getSessionHistory 保持一致）
    const messages = rows.map((row) => {
      const parsed = JSON.parse(String(row.data)) as StreamMessage;
      const raw = parsed as any;
      if (typeof raw?._createdAt !== "number") {
        raw._createdAt = Number(row.created_at) || Date.now();
      }
      return raw as StreamMessage;
    });

    // 构造最早消息游标（rowid 为单调递增整数，保证翻页不丢不重）
    const oldestCursor = messages.length > 0
      ? { createdAt: (messages[0] as any)._createdAt as number, rowid: Number(rows[0]?.rowid ?? 0) }
      : null;

    // 首页时返回总消息数（用于 UI 显示"共 N 条消息"等提示）
    let totalMessageCount: number | undefined;
    if (!hasCursor) {
      const countRow = this.db
        .prepare(`SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?`)
        .get(sessionId) as { cnt: number } | undefined;
      totalMessageCount = countRow?.cnt ?? 0;
    }

    return { messages, hasMore, oldestCursor, totalMessageCount };
  }

  /**
   * 获取指定会话的消息总数
   */
  getMessageCount(sessionId: string): number {
    this.flushWriteBuffer();
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?'
    ).get(sessionId) as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  updateSession(id: string, updates: Partial<Session>): Session | undefined {
    this.ensureSessionsLoaded();
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const normalizedUpdates = { ...updates };
    if (typeof normalizedUpdates.lastPrompt === "string") {
      normalizedUpdates.lastPrompt = this.sanitizeLastPrompt(normalizedUpdates.lastPrompt);
    }

    Object.assign(session, normalizedUpdates);

    try {
      this.persistSession(id, normalizedUpdates);
    } catch (error) {
      console.error("[session-store] Failed to persist session update:", error);
      // 持久化失败不应影响运行中的会话，降级为仅内存更新
    }

    // 记录同步变更
    if (this.syncService) {
      this.syncService.recordChange('session', id, 'update', session);
    }

    return session;
  }

  setAbortController(id: string, controller: AbortController | undefined): void {
    this.ensureSessionsLoaded();
    const session = this.sessions.get(id);
    if (!session) return;
    session.abortController = controller;
  }

  recordMessage(sessionId: string, message: StreamMessage): void {
    const id = ('uuid' in message && message.uuid) ? String(message.uuid) : crypto.randomUUID();
    const data = JSON.stringify(message);

    this.writeBuffer.push({ id, sessionId, data, ts: Date.now() });

    if (this.writeBuffer.length >= SessionStore.WRITE_BUFFER_MAX) {
      // 缓冲满，立即写入（同步，但此时已是批量事务，开销均摊）
      this.flushWriteBuffer();
      return;
    }
    if (this.writeFlushTimer === null) {
      this.writeFlushTimer = setTimeout(() => {
        this.writeFlushTimer = null;
        this.flushWriteBuffer();
      }, SessionStore.WRITE_FLUSH_MS);
    }
  }

  /** 将写缓冲中的所有条目合并为单条多值 INSERT 语句批量写入 SQLite */
  private flushWriteBuffer(): void {
    if (this.writeFlushTimer !== null) {
      clearTimeout(this.writeFlushTimer);
      this.writeFlushTimer = null;
    }
    if (this.writeBuffer.length === 0) return;
    const items = this.writeBuffer.splice(0);
    const t0 = Date.now();
    try {
      // 单条多值 INSERT：N 行合并为一次 prepare + run，消除 N-1 次重复编译开销
      const placeholders = items.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params = items.flatMap(item => [item.id, item.sessionId, item.data, item.data, item.ts]);
      this.db.prepare(
        `INSERT OR IGNORE INTO messages (id, session_id, data, content, created_at) VALUES ${placeholders}`
      ).run(...params);
      devLog.db.flush(items.length, Date.now() - t0);
    } catch (error) {
      console.error("[session-store] Failed to flush message buffer:", error);
    }
  }

  deleteSession(id: string): boolean {
    this.ensureSessionsLoaded();
    const existing = this.sessions.get(id);
    if (existing) {
      this.sessions.delete(id);
    }
    // 删除相关数据
    this.db.prepare(`delete from session_tags where session_id = ?`).run(id);
    this.db.prepare(`delete from messages where session_id = ?`).run(id);
    const result = this.db.prepare(`delete from sessions where id = ?`).run(id);
    // 从搜索索引中移除
    this.removeFromSearchIndex(id);

    // 记录同步变更
    if (this.syncService) {
      this.syncService.recordChange('session', id, 'delete', null);
    }

    const removedFromDb = result.changes > 0;
    return removedFromDb || Boolean(existing);
  }

  // ==================== 标签管理 ====================

  /**
   * 创建新标签
   */
  createTag(name: string, color: string): Tag {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db
      .prepare(`insert into tags (id, name, color, created_at) values (?, ?, ?, ?)`)
      .run(id, name, color, now);

    const tag: Tag = { id, name, color, createdAt: now };
    if (this.syncService) {
      this.syncService.recordChange("tag", id, "create", tag);
    }

    return tag;
  }

  /**
   * 获取所有标签
   */
  getAllTags(): Tag[] {
    const rows = this.db
      .prepare(`select id, name, color, created_at from tags order by name`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      color: String(row.color),
      createdAt: Number(row.created_at)
    }));
  }

  /**
   * 更新标签
   */
  updateTag(id: string, updates: { name?: string; color?: string }): Tag | null {
    const existing = this.db
      .prepare(`select id, name, color, created_at from tags where id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) return null;

    const fields: string[] = [];
    const values: Array<string | number> = [];
    if (updates.name !== undefined) {
      fields.push(`name = ?`);
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      fields.push(`color = ?`);
      values.push(updates.color);
    }
    if (fields.length > 0) {
      values.push(id);
      this.db
        .prepare(`update tags set ${fields.join(", ")} where id = ?`)
        .run(...values);
    }
    const updatedTag: Tag = {
      id: String(existing.id),
      name: updates.name ?? String(existing.name),
      color: updates.color ?? String(existing.color),
      createdAt: Number(existing.created_at)
    };

    if (this.syncService) {
      this.syncService.recordChange("tag", id, "update", updatedTag);
    }

    return updatedTag;
  }

  /**
   * 删除标签
   */
  deleteTag(id: string): boolean {
    // 先删除所有关联
    this.db.prepare(`delete from session_tags where tag_id = ?`).run(id);
    const result = this.db.prepare(`delete from tags where id = ?`).run(id);

    if (result.changes > 0 && this.syncService) {
      this.syncService.recordChange("tag", id, "delete", null);
    }

    return result.changes > 0;
  }

  /**
   * 为会话添加标签
   */
  addTag(sessionId: string, tagId: string): void {
    const now = Date.now();
    this.db
      .prepare(`insert or ignore into session_tags (session_id, tag_id, created_at) values (?, ?, ?)`)
      .run(sessionId, tagId, now);
    this.updateSessionTimestamp(sessionId);

    if (this.syncService) {
      this.syncService.recordChange("session", sessionId, "update", {
        id: sessionId,
        tagId,
        tagsUpdatedAt: now
      });
    }
  }

  /**
   * 移除会话的标签
   */
  removeTag(sessionId: string, tagId: string): void {
    const now = Date.now();
    this.db
      .prepare(`delete from session_tags where session_id = ? and tag_id = ?`)
      .run(sessionId, tagId);
    this.updateSessionTimestamp(sessionId);

    if (this.syncService) {
      this.syncService.recordChange("session", sessionId, "update", {
        id: sessionId,
        tagId,
        tagsUpdatedAt: now
      });
    }
  }

  /**
   * 获取会话的所有标签
   */
  getSessionTags(sessionId: string): Tag[] {
    const rows = this.db
      .prepare(
        `select t.id, t.name, t.color, t.created_at
         from tags t
         inner join session_tags st on t.id = st.tag_id
         where st.session_id = ?
         order by t.name`
      )
      .all(sessionId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      color: String(row.color),
      createdAt: Number(row.created_at)
    }));
  }

  /**
   * 获取具有指定标签的所有会话
   */
  getSessionsByTag(tagId: string): StoredSession[] {
    const rows = this.db
      .prepare(
        `select s.id, s.title, s.claude_session_id, s.status, s.cwd, s.allowed_tools,
                s.active_skill_ids, s.skill_mode, s.last_prompt, s.is_pinned, s.is_archived,
                s.provider, s.provider_thread_id, s.runtime, s.created_at, s.updated_at
         from sessions s
         inner join session_tags st on s.id = st.session_id
         where st.tag_id = ?
         order by s.is_pinned desc, s.updated_at desc`
      )
      .all(tagId) as Array<Record<string, unknown>>;
    return this.mapRows(rows);
  }

  // ==================== 置顶功能 ====================

  /**
   * 切换会话置顶状态
   * @returns 新的置顶状态
   */
  togglePinned(id: string): boolean {
    this.ensureSessionsLoaded();
    const session = this.sessions.get(id);
    const newPinned = session ? !session.isPinned : false;

    this.db
      .prepare(`update sessions set is_pinned = ?, updated_at = ? where id = ?`)
      .run(newPinned ? 1 : 0, Date.now(), id);

    if (session) {
      session.isPinned = newPinned;
    }

    return newPinned;
  }

  /**
   * 获取所有置顶会话
   */
  getPinnedSessions(): StoredSession[] {
    const rows = this.db
      .prepare(
        `select id, title, claude_session_id, status, cwd, allowed_tools,
                active_skill_ids, skill_mode, last_prompt, is_pinned, is_archived,
                provider, provider_thread_id, runtime, created_at, updated_at
         from sessions
         where is_pinned = 1
         order by updated_at desc`
      )
      .all() as Array<Record<string, unknown>>;
    return this.mapRows(rows);
  }

  // ==================== 归档功能 ====================

  /**
   * 切换会话归档状态
   * @returns 新的归档状态
   */
  toggleArchived(id: string): boolean {
    this.ensureSessionsLoaded();
    const session = this.sessions.get(id);
    const newArchived = session ? !session.isArchived : false;

    this.db
      .prepare(`update sessions set is_archived = ?, updated_at = ? where id = ?`)
      .run(newArchived ? 1 : 0, Date.now(), id);

    if (session) {
      session.isArchived = newArchived;
    }

    return newArchived;
  }

  /**
   * 获取所有归档会话
   */
  getArchivedSessions(): StoredSession[] {
    const rows = this.db
      .prepare(
        `select id, title, claude_session_id, status, cwd, allowed_tools,
                active_skill_ids, skill_mode, last_prompt, is_pinned, is_archived,
                provider, provider_thread_id, runtime, created_at, updated_at
         from sessions
         where is_archived = 1
         order by updated_at desc`
      )
      .all() as Array<Record<string, unknown>>;
    return this.mapRows(rows);
  }

  // ==================== 搜索功能 ====================

  /**
   * 搜索会话（使用 FTS5 全文搜索）
   * 搜索范围包括：标题、最后一次提示
   */
  searchSessions(
    query: string,
    options: { includeArchived?: boolean; tagId?: string } = {}
  ): StoredSession[] {
    const { includeArchived = false, tagId } = options;

    if (!query || query.trim().length === 0) {
      return this.listSessions({ includeArchived, tagId });
    }

    // 使用 FTS5 全文搜索
    const ftsQuery = this.prepareFtsQuery(query.trim());

    let sql = `
      SELECT DISTINCT s.id, s.title, s.claude_session_id, s.status, s.cwd, s.allowed_tools,
             s.active_skill_ids, s.skill_mode, s.last_prompt, s.is_pinned, s.is_archived,
             s.provider, s.provider_thread_id, s.runtime, s.created_at, s.updated_at
      FROM sessions s
      INNER JOIN sessions_fts sf ON s.id = sf.id
      WHERE sessions_fts MATCH ?
    `;
    const params: Array<string | number> = [ftsQuery];

    if (tagId) {
      sql += ` AND EXISTS (
        SELECT 1 FROM session_tags st
        WHERE st.session_id = s.id AND st.tag_id = ?
      )`;
      params.push(tagId);
    }

    if (!includeArchived) {
      sql += ` AND s.is_archived = 0`;
    }

    sql += ` ORDER BY s.is_pinned DESC, s.updated_at DESC`;

    try {
      const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
      return this.mapRows(rows);
    } catch (error) {
      console.error("[session-store] FTS search error:", error);
      // 降级到简单搜索
      return this.searchSessionsSimple(query, { includeArchived, tagId });
    }
  }

  /**
   * 简单搜索（不使用 FTS，作为降级方案）
   */
  private searchSessionsSimple(
    query: string,
    options: { includeArchived?: boolean; tagId?: string } = {}
  ): StoredSession[] {
    this.ensureSearchIndexBuilt();
    const { includeArchived = false, tagId } = options;
    const normalizedQuery = this.normalizeText(query.toLowerCase());
    const words = normalizedQuery.split(/\s+/).filter((w) => w.length > 0);

    if (words.length === 0) {
      return this.listSessions({ includeArchived, tagId });
    }

    // 使用内存搜索索引查找匹配的会话ID
    let matchingIds: Set<string> | null = null;
    for (const word of words) {
      const wordMatches = new Set<string>();
      // 查找所有包含该词的索引项
      for (const [indexWord, sessionIds] of this.searchIndex) {
        if (indexWord.includes(word)) {
          for (const sessionId of sessionIds) {
            wordMatches.add(sessionId);
          }
        }
      }
      if (matchingIds === null) {
        matchingIds = wordMatches;
      } else {
        // 交集：必须匹配所有词
        const intersection = new Set<string>();
        for (const id of matchingIds) {
          if (wordMatches.has(id)) {
            intersection.add(id);
          }
        }
        matchingIds = intersection;
      }
    }

    if (!matchingIds || matchingIds.size === 0) {
      return [];
    }

    // 构建SQL查询
    const placeholders = [...matchingIds].map(() => "?").join(",");
    let sql = `
      select s.id, s.title, s.claude_session_id, s.status, s.cwd, s.allowed_tools,
             s.active_skill_ids, s.skill_mode, s.permission_mode, s.last_prompt, s.is_pinned, s.is_archived,
             s.provider, s.provider_thread_id, s.runtime, s.created_at, s.updated_at
      from sessions s
    `;
    const params: Array<string | number> = [...matchingIds];

    if (tagId) {
      sql += ` inner join session_tags st on s.id = st.session_id and st.tag_id = ?`;
      params.push(tagId);
    }

    sql += ` where s.id in (${placeholders})`;

    if (!includeArchived) {
      sql += ` and s.is_archived = 0`;
    }

    sql += ` order by s.is_pinned desc, s.updated_at desc`;

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return this.mapRows(rows);
  }

  /**
   * 全文搜索消息内容（使用 FTS5）
   * @param query 搜索关键词
   * @param options 搜索选项
   * @returns 匹配的消息列表，包含上下文片段
   */
  searchMessages(
    query: string,
    options: {
      sessionId?: string;
      limit?: number;
      offset?: number;
      includeArchived?: boolean;
    } = {}
  ): Array<{
    sessionId: string;
    sessionTitle: string;
    messageId: string;
    content: string;
    snippet: string;
    rank: number;
    createdAt: number;
  }> {
    const { sessionId, limit = 50, offset = 0, includeArchived = false } = options;

    if (!query || query.trim().length === 0) {
      return [];
    }

    const ftsQuery = this.prepareFtsQuery(query.trim());

    let sql = `
      SELECT
        mf.id as message_id,
        mf.session_id,
        s.title as session_title,
        mf.content,
        snippet(messages_fts, 2, '<mark>', '</mark>', '...', 32) as snippet,
        bm25(messages_fts) as rank,
        m.created_at
      FROM messages_fts mf
      INNER JOIN messages m ON mf.id = m.id
      INNER JOIN sessions s ON mf.session_id = s.id
      WHERE messages_fts MATCH ?
    `;
    const params: Array<string | number> = [ftsQuery];

    if (sessionId) {
      sql += ` AND mf.session_id = ?`;
      params.push(sessionId);
    }

    if (!includeArchived) {
      sql += ` AND s.is_archived = 0`;
    }

    sql += ` ORDER BY rank DESC, m.created_at DESC
             LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    try {
      const rows = this.db.prepare(sql).all(...params) as Array<{
        message_id: string;
        session_id: string;
        session_title: string;
        content: string;
        snippet: string;
        rank: number;
        created_at: number;
      }>;

      return rows.map((row) => ({
        sessionId: row.session_id,
        sessionTitle: row.session_title,
        messageId: row.message_id,
        content: row.content,
        snippet: row.snippet,
        rank: row.rank,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error("[session-store] Message FTS search error:", error);
      return [];
    }
  }

  /**
   * 准备 FTS 查询字符串
   * 处理特殊字符和 FTS 语法
   */
  private prepareFtsQuery(query: string): string {
    // 移除特殊的 FTS 字符，避免语法错误
    const cleaned = query
      .replace(/[(){}[\]^"~*:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // 如果查询包含多个词，使用 AND 连接
    const words = cleaned.split(/\s+/);
    if (words.length > 1) {
      // 每个词都加上前缀匹配
      return words.map((word) => `"${word}"*`).join(" ");
    }

    // 单个词使用前缀匹配
    return `"${cleaned}"*`;
  }

  /**
   * 重建搜索索引
   */
  rebuildSearchIndex(): void {
    this.searchIndex.clear();
    const rows = this.db
      .prepare(`select id, title, last_prompt from sessions`)
      .all() as Array<Record<string, unknown>>;

    for (const row of rows) {
      const id = String(row.id);
      const title = row.title ? String(row.title) : "";
      const lastPrompt = row.last_prompt ? String(row.last_prompt) : "";
      this.updateSearchIndexForSession(id, title, lastPrompt);
    }
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 批量获取多个会话的标签（避免 N+1 查询）
   */
  private getSessionTagsBatch(sessionIds: string[]): Map<string, Tag[]> {
    const result = new Map<string, Tag[]>();
    if (sessionIds.length === 0) return result;

    const placeholders = sessionIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT st.session_id, t.id, t.name, t.color, t.created_at
         FROM session_tags st
         JOIN tags t ON st.tag_id = t.id
         WHERE st.session_id IN (${placeholders})
         ORDER BY t.name`
      )
      .all(...sessionIds) as Array<Record<string, unknown>>;

    for (const row of rows) {
      const sessionId = String(row.session_id);
      const tag: Tag = {
        id: String(row.id),
        name: String(row.name),
        color: String(row.color),
        createdAt: Number(row.created_at)
      };
      const tags = result.get(sessionId);
      if (tags) {
        tags.push(tag);
      } else {
        result.set(sessionId, [tag]);
      }
    }

    return result;
  }

  /**
   * 将多行数据批量映射为 StoredSession[]（使用批量标签获取）
   */
  private mapRows(rows: Array<Record<string, unknown>>): StoredSession[] {
    const sessionIds = rows.map((row) => String(row.id));
    const tagsBySession = this.getSessionTagsBatch(sessionIds);
    return rows.map((row) => this.mapRow(row, tagsBySession));
  }

  /**
   * 将行数据映射为 StoredSession
   * @param tagsBySession 可选的预获取标签映射，避免 N+1 查询
   */
  private mapRow(row: Record<string, unknown>, tagsBySession?: Map<string, Tag[]>): StoredSession {
    const sessionId = String(row.id);
    let activeSkillIds: string[] | undefined;
    if (row.active_skill_ids) {
      try {
        const parsed = JSON.parse(String(row.active_skill_ids));
        if (Array.isArray(parsed)) {
          activeSkillIds = parsed.map((item) => String(item));
        }
      } catch {
        const raw = String(row.active_skill_ids);
        if (raw.trim()) {
          activeSkillIds = raw.split(",").map((item) => item.trim()).filter(Boolean);
        }
      }
    }

    const skillModeRaw = row.skill_mode ? String(row.skill_mode) : undefined;
    const skillMode = skillModeRaw === "manual" ? "manual" : "auto";

    const permissionModeRaw = row.permission_mode ? String(row.permission_mode) : undefined;
    const permissionMode: PermissionMode = (permissionModeRaw === "acceptEdits" || permissionModeRaw === "default")
      ? permissionModeRaw
      : "bypassPermissions";

    const providerRaw = row.provider ? String(row.provider) : undefined;
    const provider: 'claude' | 'codex' = providerRaw === 'codex' ? 'codex' : 'claude';

    return {
      id: sessionId,
      title: String(row.title),
      status: row.status as SessionStatus,
      cwd: row.cwd ? String(row.cwd) : undefined,
      allowedTools: row.allowed_tools ? String(row.allowed_tools) : undefined,
      activeSkillIds,
      skillMode,
      permissionMode,
      lastPrompt: row.last_prompt ? String(row.last_prompt) : undefined,
      claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      isPinned: Boolean(row.is_pinned),
      isArchived: Boolean(row.is_archived),
      tags: tagsBySession ? (tagsBySession.get(sessionId) ?? []) : this.getSessionTags(sessionId),
      provider,
      providerThreadId: row.provider_thread_id ? String(row.provider_thread_id) : undefined,
      modelId: row.model_id ? String(row.model_id) : undefined,
      runtime: row.runtime ? String(row.runtime) : (provider === 'codex' ? 'codex-sdk' : 'claude-sdk'),
      autoCleanScripts: Boolean(row.auto_clean_scripts)
    };
  }

  /**
   * 更新会话的更新时间戳
   */
  private updateSessionTimestamp(sessionId: string): void {
    this.db
      .prepare(`update sessions set updated_at = ? where id = ?`)
      .run(Date.now(), sessionId);
  }

  /**
   * 为会话更新搜索索引
   */
  private updateSearchIndexForSession(
    sessionId: string,
    title?: string,
    lastPrompt?: string
  ): void {
    // 先移除旧的索引
    this.removeFromSearchIndex(sessionId);

    // 添加新的索引
    const text = `${title || ""} ${lastPrompt || ""}`;
    const normalizedText = this.normalizeText(text.toLowerCase());
    const words = normalizedText.split(/\s+/).filter((w) => w.length > 1);

    for (const word of words) {
      if (!this.searchIndex.has(word)) {
        this.searchIndex.set(word, new Set());
      }
      this.searchIndex.get(word)!.add(sessionId);
    }
  }

  /**
   * 从搜索索引中移除会话
   */
  private removeFromSearchIndex(sessionId: string): void {
    for (const sessionIds of this.searchIndex.values()) {
      sessionIds.delete(sessionId);
    }
  }

  /**
   * 规范化文本用于搜索
   */
  private normalizeText(text: string): string {
    // 移除特殊字符，保留字母、数字和空格
    return text.replace(/[^\w\s\u4e00-\u9fff]/g, " ").replace(/\s+/g, " ").trim();
  }

  private sanitizeLastPrompt(prompt: string | undefined): string | undefined {
    if (!prompt) return undefined;
    const trimmed = prompt.trim();
    if (!trimmed) return undefined;
    if (trimmed.length <= SessionStore.MAX_LAST_PROMPT_LENGTH) {
      return trimmed;
    }
    return trimmed.slice(0, SessionStore.MAX_LAST_PROMPT_LENGTH);
  }

  private persistSession(id: string, updates: Partial<Session>): void {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    const updatable = {
      claudeSessionId: "claude_session_id",
      status: "status",
      cwd: "cwd",
      allowedTools: "allowed_tools",
      activeSkillIds: "active_skill_ids",
      skillMode: "skill_mode",
      permissionMode: "permission_mode",
      lastPrompt: "last_prompt",
      title: "title",
      provider: "provider",
      providerThreadId: "provider_thread_id",
      modelId: "model_id",
      runtime: "runtime",
      autoCleanScripts: "auto_clean_scripts"
    } as const;

    for (const key of Object.keys(updates) as Array<keyof typeof updatable>) {
      const column = updatable[key];
      if (!column) continue;
      fields.push(`${column} = ?`);
      const value = updates[key];
      if (key === "activeSkillIds") {
        const normalized = Array.isArray(value)
          ? JSON.stringify(value)
          : typeof value === "string"
            ? value
            : null;
        values.push(normalized);
      } else if (key === "skillMode" || key === "permissionMode") {
        values.push(value === undefined ? null : String(value));
      } else if (key === "autoCleanScripts") {
        values.push(value === undefined ? null : (value ? 1 : 0));
      } else {
        values.push(value === undefined ? null : (value as string));
      }
    }

    if (fields.length === 0) return;
    fields.push("updated_at = ?");
    values.push(Date.now());
    values.push(id);
    this.db
      .prepare(`update sessions set ${fields.join(", ")} where id = ?`)
      .run(...values);

    // 如果更新了标题或 lastPrompt，更新搜索索引
    if (updates.title !== undefined || updates.lastPrompt !== undefined) {
      const session = this.sessions.get(id);
      if (session) {
        this.updateSearchIndexForSession(id, session.title, session.lastPrompt);
      }
    }
  }

  private initialize(): void {
    this.db.exec(`pragma journal_mode = WAL;`);
    this.db.exec(
      `create table if not exists sessions (
        id text primary key,
        title text,
        claude_session_id text,
        status text not null,
        cwd text,
        allowed_tools text,
        active_skill_ids text,
        skill_mode text,
        last_prompt text,
        is_pinned integer default 0,
        is_archived integer default 0,
        created_at integer not null,
        updated_at integer not null
      )`
    );
    this.db.exec(
      `create table if not exists messages (
        id text primary key,
        session_id text not null,
        data text not null,
        created_at integer not null,
        foreign key (session_id) references sessions(id)
      )`
    );
    this.db.exec(`create index if not exists messages_session_id on messages(session_id)`);
    this.db.exec(`create index if not exists messages_session_created on messages(session_id, created_at)`);

    // 创建标签表
    this.db.exec(
      `create table if not exists tags (
        id text primary key,
        name text not null,
        color text not null,
        created_at integer not null
      )`
    );
    this.db.exec(`create unique index if not exists tags_name on tags(name)`);

    // 创建会话-标签关联表
    this.db.exec(
      `create table if not exists session_tags (
        session_id text not null,
        tag_id text not null,
        created_at integer not null,
        primary key (session_id, tag_id),
        foreign key (session_id) references sessions(id),
        foreign key (tag_id) references tags(id)
      )`
    );
    this.db.exec(`create index if not exists session_tags_session_id on session_tags(session_id)`);
    this.db.exec(`create index if not exists session_tags_tag_id on session_tags(tag_id)`);
  }

  /**
   * 运行数据库迁移
   * 为现有表添加新字段
   */
  private runMigrations(): void {
    // 检查并添加 is_pinned 字段
    const columnsInfo = this.db
      .prepare(`pragma table_info(sessions)`)
      .all() as Array<{ name: string }>;
    const columnNames = columnsInfo.map((col) => col.name);

    if (!columnNames.includes("is_pinned")) {
      this.db.exec(`alter table sessions add column is_pinned integer default 0`);
      console.info("[session-store] Migration: Added is_pinned column");
    }

    if (!columnNames.includes("is_archived")) {
      this.db.exec(`alter table sessions add column is_archived integer default 0`);
      console.info("[session-store] Migration: Added is_archived column");
    }

    if (!columnNames.includes("active_skill_ids")) {
      this.db.exec(`alter table sessions add column active_skill_ids text`);
      console.info("[session-store] Migration: Added active_skill_ids column");
    }

    if (!columnNames.includes("skill_mode")) {
      this.db.exec(`alter table sessions add column skill_mode text default 'auto'`);
      console.info("[session-store] Migration: Added skill_mode column");
    }

    if (!columnNames.includes("permission_mode")) {
      this.db.exec(`alter table sessions add column permission_mode text default 'bypassPermissions'`);
      console.info("[session-store] Migration: Added permission_mode column");
    }

    if (!columnNames.includes("provider")) {
      this.db.exec(`alter table sessions add column provider text default 'claude'`);
      console.info("[session-store] Migration: Added provider column");
    }

    if (!columnNames.includes("provider_thread_id")) {
      this.db.exec(`alter table sessions add column provider_thread_id text`);
      console.info("[session-store] Migration: Added provider_thread_id column");
    }

    if (!columnNames.includes("runtime")) {
      this.db.exec(`alter table sessions add column runtime text default 'claude-sdk'`);
      console.info("[session-store] Migration: Added runtime column");
    }

    if (!columnNames.includes("auto_clean_scripts")) {
      this.db.exec(`alter table sessions add column auto_clean_scripts integer default 0`);
      console.info("[session-store] Migration: Added auto_clean_scripts column");
    }

    // 创建索引以优化查询
    this.db.exec(`create index if not exists sessions_is_pinned on sessions(is_pinned)`);
    this.db.exec(`create index if not exists sessions_is_archived on sessions(is_archived)`);
    this.db.exec(`create index if not exists sessions_updated_at on sessions(updated_at)`);
  }

  private loadSessions(): void {
    const rows = this.db
      .prepare(
        `select id, title, claude_session_id, status, cwd, allowed_tools, active_skill_ids, skill_mode, permission_mode, last_prompt, is_pinned, is_archived, provider, provider_thread_id, runtime
         from sessions`
      )
      .all();
    for (const row of rows as Array<Record<string, unknown>>) {
      const permissionModeRaw = row.permission_mode ? String(row.permission_mode) : undefined;
      const permissionMode: PermissionMode = (permissionModeRaw === "acceptEdits" || permissionModeRaw === "default")
        ? permissionModeRaw
        : "bypassPermissions";

      const providerRaw = row.provider ? String(row.provider) : undefined;
      const provider: 'claude' | 'codex' = providerRaw === 'codex' ? 'codex' : 'claude';

      const session: Session = {
        id: String(row.id),
        title: String(row.title),
        claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
        status: row.status as SessionStatus,
        cwd: row.cwd ? String(row.cwd) : undefined,
        allowedTools: row.allowed_tools ? String(row.allowed_tools) : undefined,
        activeSkillIds: row.active_skill_ids
          ? (() => {
              try {
                const parsed = JSON.parse(String(row.active_skill_ids));
                return Array.isArray(parsed) ? parsed.map((item) => String(item)) : undefined;
              } catch {
                return String(row.active_skill_ids)
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean);
              }
            })()
          : undefined,
        skillMode: row.skill_mode === "manual" ? "manual" : "auto",
        permissionMode,
        lastPrompt: row.last_prompt ? String(row.last_prompt) : undefined,
        pendingPermissions: new Map(),
        isPinned: Boolean(row.is_pinned),
        isArchived: Boolean(row.is_archived),
        provider,
        providerThreadId: row.provider_thread_id ? String(row.provider_thread_id) : undefined,
        runtime: row.runtime ? String(row.runtime) : (provider === 'codex' ? 'codex-sdk' : 'claude-sdk')
      };
      this.sessions.set(session.id, session);
    }
  }

  close(): void {
    // 关闭前先将写缓冲中的剩余消息刷入数据库，避免丢失
    this.flushWriteBuffer();
    // WAL 模式下关闭前执行 FULL checkpoint，将 WAL 文件的数据写回主数据库文件
    // 避免下次启动时仍需重放 WAL 日志，并减少 WAL 文件遗留
    try {
      this.db.pragma('wal_checkpoint(FULL)');
    } catch {
      // checkpoint 失败不阻止关闭，SQLite 本身保证数据安全
    }
    this.db.close();
  }
}
