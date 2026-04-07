// Mocked Suite: M-12
//
// 覆盖范围：
//   M-12 — DiagnosticsRegistry / SessionDiagnostics / RingBuffer 行为验证

import { describe, it, expect, beforeEach } from "vitest";
import {
  RingBuffer,
  SessionDiagnostics,
  DiagnosticsRegistry,
  DiagnosticEventKind,
} from "../diagnostics";

// ─── RingBuffer ───────────────────────────────────────────────────────────────

describe("M-12: RingBuffer", () => {
  it("未满时 toArray() 按写入顺序（旧→新）返回全部元素", () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
    expect(buf.length).toBe(3);
  });

  it("满容量时写入覆盖最旧，toArray() 顺序正确（旧→新）", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3); // 满
    buf.push(4); // 覆盖 1
    // 期望：[2, 3, 4]
    expect(buf.toArray()).toEqual([2, 3, 4]);
    expect(buf.length).toBe(3);
  });

  it("连续多次覆盖后顺序仍正确", () => {
    const buf = new RingBuffer<string>(3);
    ["a", "b", "c", "d", "e"].forEach((v) => buf.push(v));
    // 保留最新 3 条：c, d, e
    expect(buf.toArray()).toEqual(["c", "d", "e"]);
  });

  it("clear() 后 length 为 0，toArray() 返回空数组", () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.length).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it("空缓冲区 toArray() 返回空数组", () => {
    const buf = new RingBuffer<number>(10);
    expect(buf.toArray()).toEqual([]);
  });
});

// ─── SessionDiagnostics ───────────────────────────────────────────────────────

describe("M-12: SessionDiagnostics", () => {
  let diag: SessionDiagnostics;

  beforeEach(() => {
    diag = new SessionDiagnostics("test-session-001");
  });

  it("record() 追加事件，events.length 正确递增", () => {
    expect(diag.events.length).toBe(0);
    diag.record(DiagnosticEventKind.spawn);
    expect(diag.events.length).toBe(1);
    diag.record(DiagnosticEventKind.sdk_init);
    expect(diag.events.length).toBe(2);
  });

  it("record() 写入的事件包含正确的 sessionId 和 kind", () => {
    diag.record(DiagnosticEventKind.tool_validation_ok, { tool: "Bash" });
    const events = diag.events.toArray();
    expect(events[0]).toMatchObject({
      sessionId: "test-session-001",
      kind: DiagnosticEventKind.tool_validation_ok,
      data: { tool: "Bash" },
    });
  });

  it("snapshot() 包含 stallDetected: false、pendingPermissions: []、metrics.avgBroadcastMs: 0", () => {
    const snap = diag.snapshot();
    expect(snap).toMatchObject({
      sessionId: "test-session-001",
      stallDetected: false,
      pendingPermissions: [],
      metrics: {
        avgBroadcastMs: 0,
      },
    });
  });

  it("snapshot() 在有广播数据时正确计算 avgBroadcastMs", () => {
    diag.metrics.broadcastCount = 4;
    diag.metrics.broadcastTotalMs = 200;
    const snap = diag.snapshot();
    expect(snap.metrics.avgBroadcastMs).toBe(50);
  });

  it("snapshot() 含 exportedAt（Unix ms，合理范围）", () => {
    const before = Date.now();
    const snap = diag.snapshot();
    const after = Date.now();
    expect(snap.exportedAt).toBeGreaterThanOrEqual(before);
    expect(snap.exportedAt).toBeLessThanOrEqual(after);
  });

  it("appendStderr() 超过 32KB 时自动丢弃旧数据", () => {
    // 写入 33 KB 内容（超出 32*1024 字节上限）
    const chunk = "x".repeat(33 * 1024);
    diag.appendStderr(chunk);
    // 写完后 recentStderr 不应超过 32 KB（此处检查 snapshot 结果）
    // 因实现是"从头丢弃块"，单个 chunk 超限后 chunks 会被全清
    // 再追加一小段，验证仍能正常写入
    diag.appendStderr("tail");
    const snap = diag.snapshot();
    // recentStderr 总长应 ≤ 32*1024 + 4（"tail" 长度）
    expect(snap.recentStderr.length).toBeLessThanOrEqual(32 * 1024 + 4);
  });

  it("appendStderr() 多次写入累积，不超限时完整保留", () => {
    diag.appendStderr("hello ");
    diag.appendStderr("world");
    const snap = diag.snapshot();
    expect(snap.recentStderr).toBe("hello world");
  });
});

// ─── DiagnosticsRegistry ──────────────────────────────────────────────────────

describe("M-12: DiagnosticsRegistry", () => {
  let registry: DiagnosticsRegistry;

  beforeEach(() => {
    registry = new DiagnosticsRegistry();
  });

  it("getOrCreate() 对同一 sessionId 返回同一实例（引用相等）", () => {
    const a = registry.getOrCreate("sess-abc");
    const b = registry.getOrCreate("sess-abc");
    expect(a).toBe(b);
  });

  it("getOrCreate() 对不同 sessionId 返回不同实例", () => {
    const a = registry.getOrCreate("sess-1");
    const b = registry.getOrCreate("sess-2");
    expect(a).not.toBe(b);
  });

  it("remove() 后 get() 返回 undefined", () => {
    registry.getOrCreate("sess-xyz");
    expect(registry.get("sess-xyz")).toBeDefined();
    registry.remove("sess-xyz");
    expect(registry.get("sess-xyz")).toBeUndefined();
  });

  it("remove() 不存在的 sessionId 不抛出异常", () => {
    expect(() => registry.remove("non-existent")).not.toThrow();
  });

  it("size 属性正确反映当前追踪的会话数量", () => {
    expect(registry.size).toBe(0);
    registry.getOrCreate("s1");
    registry.getOrCreate("s2");
    expect(registry.size).toBe(2);
    registry.remove("s1");
    expect(registry.size).toBe(1);
  });

  it("snapshot() 对不存在的 sessionId 返回 null", () => {
    expect(registry.snapshot("ghost-session")).toBeNull();
  });

  it("snapshot() 对存在的 sessionId 返回完整快照结构", () => {
    const diag = registry.getOrCreate("sess-snap");
    diag.record(DiagnosticEventKind.status_transition, { status: "running" });
    const snap = registry.snapshot("sess-snap");
    expect(snap).not.toBeNull();
    expect(snap).toMatchObject({
      sessionId: "sess-snap",
      stallDetected: false,
      pendingPermissions: [],
    });
    expect(snap!.events.length).toBe(1);
  });
});
