import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskManager } from '../task/task-manager.js';
import type { TaskEventType, TaskEvent } from '../task/types.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSlowTask(ms: number, result = 'done') {
  return async (signal: AbortSignal): Promise<string> => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error(signal.reason ?? 'Aborted'));
      }, { once: true });
    });
    return result;
  };
}

describe('TaskManager', () => {
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager({ concurrency: 2, maxCompletedTasks: 5 });
  });

  afterEach(() => {
    manager.dispose();
  });

  // ==================== 基本提交与执行 ====================

  describe('submit', () => {
    it('should execute a task and return result', async () => {
      const result = await manager.submit(
        'task-1',
        'session.start',
        async () => 'hello',
      );
      expect(result).toBe('hello');
    });

    it('should reject duplicate task ids', () => {
      const p = manager.submit('dup', 'test', createSlowTask(100));
      expect(() => {
        manager.submit('dup', 'test', async () => 'second');
      }).toThrow('Task with id "dup" already exists');
      // 确保 promise 被 catch，避免 afterEach dispose 时产生 unhandled rejection
      p.catch(() => { /* expected on dispose */ });
    });

    it('should handle task failure', async () => {
      await expect(
        manager.submit('fail', 'test', async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const task = manager.getTask('fail');
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('boom');
    });

    it('should respect concurrency limit', async () => {
      let running = 0;
      let maxRunning = 0;

      const makeTask = (id: string) =>
        manager.submit(id, 'test', async () => {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await delay(50);
          running--;
          return id;
        });

      await Promise.all([
        makeTask('a'),
        makeTask('b'),
        makeTask('c'),
        makeTask('d'),
      ]);

      expect(maxRunning).toBeLessThanOrEqual(2);
    });
  });

  // ==================== 优先级 ====================

  describe('priority', () => {
    it('should execute higher priority tasks first', async () => {
      manager.pause();
      const order: string[] = [];

      const p1 = manager.submit('low', 'test', async () => {
        order.push('low');
      }, { priority: 'low' });

      const p2 = manager.submit('critical', 'test', async () => {
        order.push('critical');
      }, { priority: 'critical' });

      const p3 = manager.submit('normal', 'test', async () => {
        order.push('normal');
      }, { priority: 'normal' });

      manager.resume();
      await Promise.all([p1, p2, p3]);

      expect(order.indexOf('critical')).toBeLessThan(order.indexOf('low'));
    });
  });

  // ==================== 取消 ====================

  describe('cancel', () => {
    it('should cancel a running task', async () => {
      const promise = manager.submit('cancel-me', 'test', createSlowTask(5000));
      await delay(20);

      const cancelled = manager.cancel('cancel-me', 'user cancelled');
      expect(cancelled).toBe(true);

      await expect(promise).rejects.toThrow();

      const task = manager.getTask('cancel-me');
      expect(task?.status).toBe('cancelled');
    });

    it('should cancel a pending task', async () => {
      const p1 = manager.submit('blocker-1', 'test', createSlowTask(5000));
      const p2 = manager.submit('blocker-2', 'test', createSlowTask(5000));
      const p3 = manager.submit('pending-task', 'test', createSlowTask(100));

      // catch 所有 promise 以避免 unhandled rejection
      p1.catch(() => { /* expected */ });
      p2.catch(() => { /* expected */ });
      p3.catch(() => { /* expected */ });

      await delay(10);
      const task = manager.getTask('pending-task');
      expect(task?.status).toBe('pending');

      const cancelled = manager.cancel('pending-task', 'no longer needed');
      expect(cancelled).toBe(true);

      const taskAfter = manager.getTask('pending-task');
      expect(taskAfter?.status).toBe('cancelled');
    });

    it('should return false for non-existent task', () => {
      expect(manager.cancel('nope')).toBe(false);
    });

    it('should return false for already completed task', async () => {
      await manager.submit('done', 'test', async () => 'ok');
      expect(manager.cancel('done')).toBe(false);
    });

    it('cancelAll should cancel all active tasks', async () => {
      const p1 = manager.submit('t1', 'test', createSlowTask(5000));
      const p2 = manager.submit('t2', 'test', createSlowTask(5000));
      const p3 = manager.submit('t3', 'test', createSlowTask(5000));

      // catch 所有 promise
      p1.catch(() => { /* expected */ });
      p2.catch(() => { /* expected */ });
      p3.catch(() => { /* expected */ });

      await delay(20);
      const count = manager.cancelAll('shutdown');
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  // ==================== 暂停/恢复 ====================

  describe('pause / resume', () => {
    it('should pause and resume the queue', async () => {
      manager.pause();
      const order: string[] = [];

      manager.submit('p1', 'test', async () => { order.push('p1'); });
      manager.submit('p2', 'test', async () => { order.push('p2'); });

      await delay(50);
      expect(order).toHaveLength(0);

      const status = manager.getQueueStatus();
      expect(status.isPaused).toBe(true);

      manager.resume();
      await manager.onIdle();

      expect(order).toHaveLength(2);
    });
  });

  // ==================== 任务信息与队列状态 ====================

  describe('getTask / getQueueStatus', () => {
    it('should return task info with correct status transitions', async () => {
      const promise = manager.submit('info-task', 'session.start', createSlowTask(50, 'result'));

      await delay(10);
      const running = manager.getTask('info-task');
      expect(running?.status).toBe('running');
      expect(running?.type).toBe('session.start');
      expect(running?.timestamps.startedAt).toBeDefined();

      await promise;
      const completed = manager.getTask('info-task');
      expect(completed?.status).toBe('completed');
      expect(completed?.result).toBe('result');
      expect(completed?.timestamps.completedAt).toBeDefined();
    });

    it('should return undefined for non-existent task', () => {
      expect(manager.getTask('nope')).toBeUndefined();
    });

    it('should return accurate queue status', async () => {
      const p1 = manager.submit('s1', 'test', createSlowTask(100));
      const p2 = manager.submit('s2', 'test', createSlowTask(100));
      const p3 = manager.submit('s3', 'test', createSlowTask(100));

      // catch 所有 promise
      p1.catch(() => { /* expected */ });
      p2.catch(() => { /* expected */ });
      p3.catch(() => { /* expected */ });

      await delay(10);
      const status = manager.getQueueStatus();
      expect(status.running).toBeGreaterThanOrEqual(1);
      expect(status.concurrency).toBe(2);
    });
  });

  // ==================== 事件系统 ====================

  describe('events', () => {
    it('should emit task lifecycle events', async () => {
      const events: TaskEventType[] = [];

      manager.on('task.created', (e) => events.push(e.type));
      manager.on('task.started', (e) => events.push(e.type));
      manager.on('task.completed', (e) => events.push(e.type));

      await manager.submit('evt', 'test', async () => 'ok');

      expect(events).toEqual(['task.created', 'task.started', 'task.completed']);
    });

    it('should emit task.failed event', async () => {
      const errors: string[] = [];
      manager.on('task.failed', (e) => {
        errors.push(e.payload.error);
      });

      await manager.submit('fail-evt', 'test', async () => {
        throw new Error('test error');
      }).catch(() => { /* expected */ });

      expect(errors).toEqual(['test error']);
    });

    it('should emit task.cancelled event', async () => {
      const reasons: string[] = [];
      manager.on('task.cancelled', (e) => {
        reasons.push(e.payload.reason);
      });

      const promise = manager.submit('cancel-evt', 'test', createSlowTask(5000));
      await delay(20);
      manager.cancel('cancel-evt', 'bye');
      await promise.catch(() => { /* expected */ });

      expect(reasons).toContain('bye');
    });

    it('on() should return unsubscribe function', async () => {
      let count = 0;
      const unsub = manager.on('task.created', () => { count++; });

      manager.submit('e1', 'test', async () => 'ok');
      await delay(10);
      expect(count).toBe(1);

      unsub();
      manager.submit('e2', 'test', async () => 'ok');
      await delay(10);
      expect(count).toBe(1);
    });

    it('listener errors should not break the queue', async () => {
      manager.on('task.created', () => {
        throw new Error('listener boom');
      });

      const result = await manager.submit('safe', 'test', async () => 'ok');
      expect(result).toBe('ok');
    });
  });

  // ==================== 超时 ====================

  describe('timeout', () => {
    it('should cancel task after timeout', async () => {
      await expect(
        manager.submit('timeout-task', 'test', createSlowTask(5000), {
          timeoutMs: 50,
        }),
      ).rejects.toThrow();

      const task = manager.getTask('timeout-task');
      expect(task?.status).toBe('cancelled');
    });
  });

  // ==================== 外部 signal ====================

  describe('external signal', () => {
    it('should respect external AbortSignal', async () => {
      const external = new AbortController();

      const promise = manager.submit(
        'ext-signal',
        'test',
        createSlowTask(5000),
        { signal: external.signal },
      );

      await delay(20);
      external.abort('external cancel');

      await expect(promise).rejects.toThrow();
      const task = manager.getTask('ext-signal');
      expect(task?.status).toBe('cancelled');
    });

    it('should handle pre-aborted signal', () => {
      const external = new AbortController();
      external.abort('already aborted');

      const promise = manager.submit(
        'pre-aborted',
        'test',
        createSlowTask(100),
        { signal: external.signal },
      );

      return expect(promise).rejects.toThrow();
    });
  });

  // ==================== 自动清理 ====================

  describe('pruning', () => {
    it('should prune completed tasks beyond maxCompletedTasks', async () => {
      // maxCompletedTasks = 5
      for (let i = 0; i < 8; i++) {
        await manager.submit(`prune-${i}`, 'test', async () => `result-${i}`);
      }

      // 前几个应该被清理掉
      expect(manager.getTask('prune-0')).toBeUndefined();
      expect(manager.getTask('prune-1')).toBeUndefined();
      expect(manager.getTask('prune-2')).toBeUndefined();
      // 最近的应该还在
      expect(manager.getTask('prune-7')).toBeDefined();
    });
  });

  // ==================== dispose ====================

  describe('dispose', () => {
    it('should reject operations after dispose', () => {
      manager.dispose();
      expect(() => {
        manager.submit('after-dispose', 'test', async () => 'nope');
      }).toThrow('TaskManager has been disposed');
    });

    it('should be idempotent', () => {
      manager.dispose();
      manager.dispose(); // should not throw
      expect(manager.isDisposed).toBe(true);
    });
  });
});
