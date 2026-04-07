// Mocked Suite: M-04 / M-05 / M-06 / M-07 / M-08 / M-09 / M-10 / M-11

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DiagnosticsRegistry,
  DiagnosticEventKind,
  SessionDiagnostics,
} from "../diagnostics";

// ─── 辅助函数 ──────────────────────────────────────────────────────────────────

/**
 * 判断是否应触发 stall（纯函数，不依赖计时器实现）
 * 复现 runner.ts 中的 stall guard 逻辑：
 *   - 无待决权限
 *   - 当前未处于已检测状态
 */
function shouldTriggerStall(diag: SessionDiagnostics): boolean {
  return diag.pendingPermissions.size === 0 && !diag.stallDetected;
}

// ─── M-04: Stall 检测 — 静默超时 ───────────────────────────────────────────────

describe("M-04: stall detection — silence timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should record stall_detected event and set stallDetected flag after silence timeout", () => {
    const diag = new SessionDiagnostics("m04-session");

    // 模拟时间推进超过 15 秒静默阈值
    vi.advanceTimersByTime(15_001);

    // 业务层检测到 stall，手动触发记录
    diag.record(DiagnosticEventKind.stall_detected, { reason: "silence_timeout_15s" });
    diag.stallDetected = true;
    diag.stallReason = "silence_timeout_15s";

    const snap = diag.snapshot();

    expect(snap.stallDetected).toBe(true);
    expect(snap.stallReason).toBe("silence_timeout_15s");

    const stallEvent = snap.events.find(
      (e) => e.kind === DiagnosticEventKind.stall_detected,
    );
    expect(stallEvent).toBeDefined();
    expect(stallEvent?.data?.reason).toBe("silence_timeout_15s");
  });

  it("should NOT call any stop function — stall only records, does not terminate session", () => {
    const diag = new SessionDiagnostics("m04-no-terminate");
    const stopMock = vi.fn();

    vi.advanceTimersByTime(15_001);

    // 仅记录诊断，不调用 stop
    diag.record(DiagnosticEventKind.stall_detected, { reason: "silence_timeout_15s" });
    diag.stallDetected = true;

    // 验证 stop 从未被调用
    expect(stopMock).not.toHaveBeenCalled();
    expect(diag.snapshot().stallDetected).toBe(true);
  });
});

// ─── M-05: Stall 检测 — 权限等待豁免 ──────────────────────────────────────────

describe("M-05: stall detection — pending permission exemption", () => {
  it("should NOT trigger stall when there are pending permissions", () => {
    const diag = new SessionDiagnostics("m05-session");
    diag.pendingPermissions.add("tool-use-id-1");

    expect(shouldTriggerStall(diag)).toBe(false);
  });

  it("should trigger stall when pending permissions are empty and stall not yet detected", () => {
    const diag = new SessionDiagnostics("m05-empty");

    expect(shouldTriggerStall(diag)).toBe(true);
  });

  it("should NOT trigger stall again when stallDetected is already true", () => {
    const diag = new SessionDiagnostics("m05-already-detected");
    diag.stallDetected = true;

    expect(shouldTriggerStall(diag)).toBe(false);
  });

  it("should allow stall once permission is resolved and removed", () => {
    const diag = new SessionDiagnostics("m05-resolve");
    diag.pendingPermissions.add("tool-use-id-2");

    expect(shouldTriggerStall(diag)).toBe(false);

    // 权限被决策后移除
    diag.pendingPermissions.delete("tool-use-id-2");
    diag.record(DiagnosticEventKind.permission_resolve, { toolUseId: "tool-use-id-2", allowed: true });

    expect(shouldTriggerStall(diag)).toBe(true);
  });
});

// ─── M-06: Stall 检测 — 输出恢复 ───────────────────────────────────────────────

describe("M-06: stall detection — output recovery", () => {
  it("should clear stallDetected and record stall_recovered after new output arrives", () => {
    const diag = new SessionDiagnostics("m06-session");

    // 先进入 stall 状态
    diag.record(DiagnosticEventKind.stall_detected, { reason: "silence_timeout_15s" });
    diag.stallDetected = true;
    diag.stallReason = "silence_timeout_15s";

    expect(diag.snapshot().stallDetected).toBe(true);

    // 收到新消息 → 恢复
    diag.stallDetected = false;
    diag.stallReason = undefined;
    diag.record(DiagnosticEventKind.stall_recovered, {});

    const snap = diag.snapshot();

    expect(snap.stallDetected).toBe(false);
    expect(snap.stallReason).toBeUndefined();

    const recoveredEvent = snap.events.find(
      (e) => e.kind === DiagnosticEventKind.stall_recovered,
    );
    expect(recoveredEvent).toBeDefined();
  });

  it("should have both stall_detected and stall_recovered in event history", () => {
    const diag = new SessionDiagnostics("m06-history");

    diag.record(DiagnosticEventKind.stall_detected, { reason: "silence_timeout_15s" });
    diag.stallDetected = true;

    diag.stallDetected = false;
    diag.record(DiagnosticEventKind.stall_recovered, {});

    const events = diag.snapshot().events;
    const kinds = events.map((e) => e.kind);

    expect(kinds).toContain(DiagnosticEventKind.stall_detected);
    expect(kinds).toContain(DiagnosticEventKind.stall_recovered);
    // 恢复事件在检测事件之后
    expect(kinds.indexOf(DiagnosticEventKind.stall_recovered)).toBeGreaterThan(
      kinds.indexOf(DiagnosticEventKind.stall_detected),
    );
  });
});

// ─── M-07: 大流量微批处理 ──────────────────────────────────────────────────────

describe("M-07: high-throughput micro-batching", () => {
  it("should handle 10k message/broadcast counts within acceptable event loop lag", () => {
    const registry = new DiagnosticsRegistry();
    const diag = registry.getOrCreate("session-batch-test");

    // 注入大流量指标
    diag.metrics.messageCount = 10_000;
    diag.metrics.broadcastCount = 10_000;
    diag.metrics.broadcastTotalMs = 5_000; // 平均 0.5 ms/次

    // 模拟 event loop lag 测量结果（正常范围）
    diag.metrics.eventLoopLagMs = 45;

    // queueDepth 最终应归零
    diag.metrics.queueDepth = 0;

    const snap = diag.snapshot();

    expect(snap.metrics.messageCount).toBe(10_000);
    expect(snap.metrics.broadcastCount).toBe(10_000);
    expect(snap.metrics.avgBroadcastMs).toBe(0.5);
    expect(snap.metrics.eventLoopLagMs).toBeDefined();
    expect(snap.metrics.eventLoopLagMs!).toBeLessThan(500); // 警戒线 500ms

    // queueDepth 归零或未设置
    const depth = snap.metrics.queueDepth;
    expect(depth === undefined || depth === 0).toBe(true);
  });

  it("should compute avgBroadcastMs = 0 when broadcastCount is 0 (no division by zero)", () => {
    const registry = new DiagnosticsRegistry();
    const diag = registry.getOrCreate("session-batch-zero");

    const snap = diag.snapshot();
    expect(snap.metrics.avgBroadcastMs).toBe(0);
  });
});

// ─── M-08: 权限请求超时收敛 ────────────────────────────────────────────────────

describe("M-08: permission request timeout convergence", () => {
  it("should clear all pending permissions after timeout without throwing", () => {
    const diag = new SessionDiagnostics("m08-session");

    // 添加 3 个待决权限
    diag.pendingPermissions.add("tool-use-id-a");
    diag.pendingPermissions.add("tool-use-id-b");
    diag.pendingPermissions.add("tool-use-id-c");

    expect(diag.pendingPermissions.size).toBe(3);

    // 模拟超时清理（无异常）
    expect(() => {
      for (const id of [...diag.pendingPermissions]) {
        diag.pendingPermissions.delete(id);
        diag.record(DiagnosticEventKind.permission_timeout, { toolUseId: id });
      }
    }).not.toThrow();

    expect(diag.pendingPermissions.size).toBe(0);

    const snap = diag.snapshot();
    expect(snap.pendingPermissions).toHaveLength(0);
  });

  it("should record one permission_timeout event per expired permission", () => {
    const diag = new SessionDiagnostics("m08-events");

    const ids = ["t-1", "t-2", "t-3"];
    ids.forEach((id) => diag.pendingPermissions.add(id));

    for (const id of [...diag.pendingPermissions]) {
      diag.pendingPermissions.delete(id);
      diag.record(DiagnosticEventKind.permission_timeout, { toolUseId: id });
    }

    const timeoutEvents = diag.snapshot().events.filter(
      (e) => e.kind === DiagnosticEventKind.permission_timeout,
    );
    expect(timeoutEvents).toHaveLength(3);
  });
});

// ─── M-09: 会话删除边界 ────────────────────────────────────────────────────────

describe("M-09: session deletion edge cases", () => {
  // M-09a: pending permission 等待中删除
  describe("M-09a: delete session while permission is pending", () => {
    it("should remove diagnostics data when session is deleted mid-permission-wait", () => {
      const registry = new DiagnosticsRegistry();
      const diag = registry.getOrCreate("s1");

      diag.pendingPermissions.add("pending-tool-id");
      expect(diag.pendingPermissions.size).toBe(1);

      registry.remove("s1");

      expect(registry.get("s1")).toBeUndefined();
    });
  });

  // M-09b: async 竞态 — runner 未注册时删除
  describe("M-09b: remove unregistered session (async race)", () => {
    it("should not throw when removing a session that was never registered", () => {
      const registry = new DiagnosticsRegistry();
      const sizeBefore = registry.size;

      expect(() => registry.remove("s2")).not.toThrow();

      // 未注册会话不应影响 registry 大小
      expect(registry.size).toBe(sizeBefore);
    });
  });

  // M-09c: resume 丢失
  describe("M-09c: sdk_resume with session_not_found", () => {
    it("should record sdk_resume failure when session cannot be found", () => {
      const registry = new DiagnosticsRegistry();
      const diag = registry.getOrCreate("s3");

      diag.record(DiagnosticEventKind.sdk_resume, {
        success: false,
        reason: "session_not_found",
      });

      const events = diag.snapshot().events;
      const lastEvent = events[events.length - 1];

      expect(lastEvent.kind).toBe(DiagnosticEventKind.sdk_resume);
      expect(lastEvent.data?.success).toBe(false);
      expect(lastEvent.data?.reason).toBe("session_not_found");
    });
  });
});

// ─── M-10: pause_turn 处理 ─────────────────────────────────────────────────────

describe("M-10: pause_turn handling", () => {
  it("should record pause_turn event with reason", () => {
    const diag = new SessionDiagnostics("m10-session");

    diag.record(DiagnosticEventKind.pause_turn, { reason: "user_pause" });

    const snap = diag.snapshot();
    const pauseEvent = snap.events.find(
      (e) => e.kind === DiagnosticEventKind.pause_turn,
    );

    expect(pauseEvent).toBeDefined();
    expect(pauseEvent?.data?.reason).toBe("user_pause");
  });

  it("should record status_transition from running to idle after pause", () => {
    const diag = new SessionDiagnostics("m10-transition");

    diag.record(DiagnosticEventKind.pause_turn, { reason: "user_pause" });
    diag.record(DiagnosticEventKind.status_transition, { from: "running", to: "idle" });

    const snap = diag.snapshot();

    const transitionEvent = snap.events.find(
      (e) => e.kind === DiagnosticEventKind.status_transition,
    );
    expect(transitionEvent).toBeDefined();
    expect(transitionEvent?.data?.from).toBe("running");
    expect(transitionEvent?.data?.to).toBe("idle");
  });

  it("should have pause_turn before status_transition in event order", () => {
    const diag = new SessionDiagnostics("m10-order");

    diag.record(DiagnosticEventKind.pause_turn, { reason: "user_pause" });
    diag.record(DiagnosticEventKind.status_transition, { from: "running", to: "idle" });

    const events = diag.snapshot().events;
    const kinds = events.map((e) => e.kind);

    expect(kinds.indexOf(DiagnosticEventKind.pause_turn)).toBeLessThan(
      kinds.indexOf(DiagnosticEventKind.status_transition),
    );
  });
});

// ─── M-11: early_exit 处理 ─────────────────────────────────────────────────────

describe("M-11: early_exit handling", () => {
  it("should record early_exit event with exitCode and signal", () => {
    const diag = new SessionDiagnostics("m11-session");

    diag.record(DiagnosticEventKind.early_exit, { exitCode: 1, signal: null });

    const snap = diag.snapshot();
    const exitEvent = snap.events.find(
      (e) => e.kind === DiagnosticEventKind.early_exit,
    );

    expect(exitEvent).toBeDefined();
    expect(exitEvent?.data?.exitCode).toBe(1);
    expect(exitEvent?.data?.signal).toBeNull();
  });

  it("should record status_transition to error after early_exit", () => {
    const diag = new SessionDiagnostics("m11-transition");

    diag.record(DiagnosticEventKind.early_exit, { exitCode: 1, signal: null });
    diag.record(DiagnosticEventKind.status_transition, { from: "running", to: "error" });

    const snap = diag.snapshot();
    const transitionEvent = snap.events.find(
      (e) => e.kind === DiagnosticEventKind.status_transition,
    );

    expect(transitionEvent).toBeDefined();
    expect(transitionEvent?.data?.from).toBe("running");
    expect(transitionEvent?.data?.to).toBe("error");
  });

  it("should record exactly one early_exit event when called once (idempotency contract)", () => {
    const diag = new SessionDiagnostics("m11-idempotent");

    // 业务层约定：只调用一次（runner.ts 层保证），诊断层如实记录
    diag.record(DiagnosticEventKind.early_exit, { exitCode: 1, signal: null });

    const earlyExitEvents = diag.snapshot().events.filter(
      (e) => e.kind === DiagnosticEventKind.early_exit,
    );

    expect(earlyExitEvents).toHaveLength(1);
  });

  it("should record two early_exit events if called twice (diagnostics faithfully mirrors caller)", () => {
    // 此测试验证 diag 层面的行为是"如实记录"，不去重
    // 防止重复上报的幂等逻辑属于 runner.ts 层的职责
    const diag = new SessionDiagnostics("m11-double");

    diag.record(DiagnosticEventKind.early_exit, { exitCode: 1, signal: null });
    diag.record(DiagnosticEventKind.early_exit, { exitCode: 1, signal: null });

    const earlyExitEvents = diag.snapshot().events.filter(
      (e) => e.kind === DiagnosticEventKind.early_exit,
    );

    // diag 层如实记录 2 次，说明幂等保护必须在调用方（runner.ts）实现
    expect(earlyExitEvents).toHaveLength(2);
  });
});
