import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { StreamMessage } from "../types.js";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
  },
}));

vi.mock("better-sqlite3", () => {
  class FakeDatabase {
    private sessions = new Map<string, Record<string, unknown>>();
    private messages = new Map<string, Array<{ id: string; data: string; createdAt: number }>>();

    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

      return {
        run: (...params: Array<string | number | null>) => {
          if (normalized.includes("insert into sessions")) {
            const [
              id,
              title,
              claudeSessionId,
              status,
              cwd,
              allowedTools,
              activeSkillIds,
              skillMode,
              permissionMode,
              lastPrompt,
              isPinned,
              isArchived,
              provider,
              providerThreadId,
              runtime,
              modelId,
              createdAt,
              updatedAt,
            ] = params;
            this.sessions.set(String(id), {
              id,
              title,
              claude_session_id: claudeSessionId,
              status,
              cwd,
              allowed_tools: allowedTools,
              active_skill_ids: activeSkillIds,
              skill_mode: skillMode,
              permission_mode: permissionMode,
              last_prompt: lastPrompt,
              is_pinned: isPinned,
              is_archived: isArchived,
              provider,
              provider_thread_id: providerThreadId,
              runtime,
              model_id: modelId,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { changes: 1 };
          }

          if (normalized.includes("insert or ignore into messages")) {
            for (let i = 0; i < params.length; i += 5) {
              const id = String(params[i]);
              const sessionId = String(params[i + 1]);
              const data = String(params[i + 2]);
              const createdAt = Number(params[i + 4]);
              const items = this.messages.get(sessionId) ?? [];
              if (!items.some((item) => item.id === id)) {
                items.push({ id, data, createdAt });
                items.sort((a, b) => a.createdAt - b.createdAt);
                this.messages.set(sessionId, items);
              }
            }
            return { changes: params.length / 5 };
          }

          return { changes: 0 };
        },
        get: (id: string) => {
          if (normalized.includes("from sessions") && normalized.includes("where id = ?")) {
            return this.sessions.get(id);
          }
          return undefined;
        },
        all: (id?: string) => {
          if (normalized.includes("select data from messages")) {
            return (this.messages.get(String(id)) ?? []).map((item) => ({
              data: item.data,
            }));
          }

          if (normalized.includes("select data, created_at from messages")) {
            return (this.messages.get(String(id)) ?? []).map((item) => ({
              data: item.data,
              created_at: item.createdAt,
            }));
          }

          return [];
        },
      };
    }

    pragma() {}
    exec() {}
    close() {}
  }

  return {
    default: FakeDatabase,
  };
});

import { SessionStore } from "../libs/session-store.js";

type SessionStorePrivateMethods = {
  initialize: () => void;
  runMigrations: () => void;
};

type StoredUserPrompt = {
  prompt: string;
};

type StoredAssistant = {
  message: {
    content: Array<{
      text?: string;
    }>;
  };
};

function createUserPrompt(prompt: string, createdAt: number): StreamMessage {
  return {
    type: "user_prompt",
    prompt,
    _createdAt: createdAt,
  } as unknown as StreamMessage;
}

function createAssistantText(text: string, createdAt: number): StreamMessage {
  return {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
    },
    _createdAt: createdAt,
  } as unknown as StreamMessage;
}

describe("SessionStore history flush", () => {
  let tempDir: string;
  let store: SessionStore | null = null;
  let initializeSpy: ReturnType<typeof vi.spyOn> | null = null;
  let runMigrationsSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-store-history-"));
    const prototype = SessionStore.prototype as unknown as SessionStorePrivateMethods;
    initializeSpy = vi.spyOn(prototype, "initialize").mockImplementation(() => {});
    runMigrationsSpy = vi.spyOn(prototype, "runMigrations").mockImplementation(() => {});
  });

  afterEach(() => {
    store?.close();
    store = null;
    initializeSpy?.mockRestore();
    runMigrationsSpy?.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("getSessionHistory 应该在读取前刷新写缓冲", () => {
    const dbPath = path.join(tempDir, "sessions.db");
    store = new SessionStore(dbPath);

    const session = store.createSession({ title: "History Flush" });
    store.recordMessage(session.id, createUserPrompt("第一轮提问", 1));
    store.recordMessage(session.id, createAssistantText("第一轮回答", 2));

    const history = store.getSessionHistory(session.id);
    const promptMessage = history?.messages[0] as StoredUserPrompt | undefined;
    const assistantMessage = history?.messages[1] as StoredAssistant | undefined;

    expect(history).not.toBeNull();
    expect(history?.messages).toHaveLength(2);
    expect(promptMessage?.prompt).toBe("第一轮提问");
    expect(assistantMessage?.message.content[0].text).toBe("第一轮回答");
  });

  it("getFormattedHistory 应该读取到刚写入但尚未定时落库的最近一轮", () => {
    const dbPath = path.join(tempDir, "formatted-history.db");
    store = new SessionStore(dbPath);

    const session = store.createSession({ title: "Formatted History" });
    store.recordMessage(session.id, createUserPrompt("上一轮问题", 10));
    store.recordMessage(session.id, createAssistantText("上一轮答案", 11));

    const formatted = store.getFormattedHistory(session.id);

    expect(formatted).toContain("[User]: 上一轮问题");
    expect(formatted).toContain("[Assistant]: 上一轮答案");
  });
});
