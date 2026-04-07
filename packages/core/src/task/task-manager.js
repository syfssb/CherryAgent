/**
 * TaskManager - 基于 p-queue 的任务队列管理器
 *
 * 提供并发控制、优先级排序、取消/暂停/恢复、事件通知等能力。
 * 纯逻辑实现，不依赖 Electron。
 */
import PQueue from 'p-queue';
import { PRIORITY_MAP } from './types.js';
// ==================== 默认配置 ====================
const DEFAULT_CONFIG = {
    concurrency: 3,
    maxCompletedTasks: 100,
};
// ==================== TaskManager ====================
export class TaskManager {
    queue;
    tasks = new Map();
    listeners = new Map();
    config;
    disposed = false;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.queue = new PQueue({ concurrency: this.config.concurrency });
        // 监听 p-queue 的 active/idle 事件
        this.queue.on('active', () => {
            this.emit('queue.active', {
                pending: this.queue.size,
                running: this.queue.pending,
            });
        });
        this.queue.on('idle', () => {
            this.emit('queue.idle', {});
        });
    }
    // ==================== 公共 API ====================
    /**
     * 提交任务到队列
     *
     * @param id - 唯一任务 ID
     * @param type - 任务类型标识
     * @param fn - 任务执行函数，接收 AbortSignal
     * @param options - 可选配置（优先级、外部 signal、超时）
     * @returns Promise，resolve 为任务结果
     */
    submit(id, type, fn, options) {
        this.assertNotDisposed();
        if (this.tasks.has(id)) {
            throw new Error(`Task with id "${id}" already exists`);
        }
        const priority = options?.priority ?? 'normal';
        const abortController = new AbortController();
        // 链接外部 signal
        if (options?.signal) {
            if (options.signal.aborted) {
                abortController.abort(options.signal.reason);
            }
            else {
                const onExternalAbort = () => {
                    abortController.abort(options.signal.reason);
                };
                options.signal.addEventListener('abort', onExternalAbort, { once: true });
                // 当内部 controller abort 时，清理外部监听
                abortController.signal.addEventListener('abort', () => {
                    options.signal.removeEventListener('abort', onExternalAbort);
                }, { once: true });
            }
        }
        // 创建任务条目
        const entry = {
            id,
            type,
            priority,
            status: 'pending',
            createdAt: Date.now(),
            abortController,
        };
        this.tasks.set(id, entry);
        this.emit('task.created', { task: this.toTaskInfo(entry) });
        // 将任务加入 p-queue
        const resultPromise = this.queue.add(async ({ signal: pqSignal }) => {
            // p-queue 可能传入自己的 signal（如果队列被 clear）
            // 链接 p-queue signal 到我们的 abortController
            if (pqSignal) {
                if (pqSignal.aborted) {
                    abortController.abort(pqSignal.reason);
                }
                else {
                    pqSignal.addEventListener('abort', () => {
                        abortController.abort(pqSignal.reason);
                    }, { once: true });
                }
            }
            // 检查是否在等待期间已被取消
            if (abortController.signal.aborted) {
                throw new Error(abortController.signal.reason ?? 'Task was cancelled before execution');
            }
            // 标记为 running
            entry.status = 'running';
            entry.startedAt = Date.now();
            this.emit('task.started', { task: this.toTaskInfo(entry) });
            // 设置超时
            let timeoutId;
            if (options?.timeoutMs && options.timeoutMs > 0) {
                timeoutId = setTimeout(() => {
                    abortController.abort(`Task timed out after ${options.timeoutMs}ms`);
                }, options.timeoutMs);
            }
            try {
                const result = await fn(abortController.signal);
                entry.status = 'completed';
                entry.completedAt = Date.now();
                entry.result = result;
                this.emit('task.completed', { task: this.toTaskInfo(entry) });
                this.pruneCompletedTasks();
                return result;
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (abortController.signal.aborted) {
                    entry.status = 'cancelled';
                    entry.completedAt = Date.now();
                    entry.error = errorMessage;
                    this.emit('task.cancelled', {
                        task: this.toTaskInfo(entry),
                        reason: errorMessage,
                    });
                }
                else {
                    entry.status = 'failed';
                    entry.completedAt = Date.now();
                    entry.error = errorMessage;
                    this.emit('task.failed', {
                        task: this.toTaskInfo(entry),
                        error: errorMessage,
                    });
                }
                this.pruneCompletedTasks();
                throw error;
            }
            finally {
                if (timeoutId !== undefined) {
                    clearTimeout(timeoutId);
                }
            }
        }, { priority: PRIORITY_MAP[priority] });
        return resultPromise;
    }
    /**
     * 取消指定任务
     */
    cancel(id, reason = 'Cancelled by user') {
        this.assertNotDisposed();
        return this.cancelInternal(id, reason);
    }
    /**
     * 取消所有待执行和正在执行的任务
     */
    cancelAll(reason = 'All tasks cancelled') {
        this.assertNotDisposed();
        return this.cancelAllInternal(reason);
    }
    /**
     * 暂停队列（不影响正在执行的任务）
     */
    pause() {
        this.assertNotDisposed();
        this.queue.pause();
    }
    /**
     * 恢复队列
     */
    resume() {
        this.assertNotDisposed();
        this.queue.start();
    }
    /**
     * 获取指定任务信息
     */
    getTask(id) {
        const entry = this.tasks.get(id);
        if (!entry) {
            return undefined;
        }
        return this.toTaskInfo(entry);
    }
    /**
     * 获取队列状态快照
     */
    getQueueStatus() {
        let completed = 0;
        let failed = 0;
        let cancelled = 0;
        for (const entry of this.tasks.values()) {
            switch (entry.status) {
                case 'completed':
                    completed++;
                    break;
                case 'failed':
                    failed++;
                    break;
                case 'cancelled':
                    cancelled++;
                    break;
            }
        }
        return {
            pending: this.queue.size,
            running: this.queue.pending,
            completed,
            failed,
            cancelled,
            isPaused: this.queue.isPaused,
            concurrency: this.config.concurrency,
        };
    }
    // ==================== 事件系统 ====================
    /**
     * 注册事件监听器
     */
    on(type, listener) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        const set = this.listeners.get(type);
        set.add(listener);
        // 返回取消订阅函数
        return () => {
            set.delete(listener);
        };
    }
    /**
     * 移除事件监听器
     */
    off(type, listener) {
        const set = this.listeners.get(type);
        if (set) {
            set.delete(listener);
        }
    }
    /**
     * 等待队列空闲
     */
    async onIdle() {
        await this.queue.onIdle();
    }
    /**
     * 销毁 TaskManager，取消所有任务并清理资源
     */
    dispose() {
        if (this.disposed) {
            return;
        }
        // 先取消所有任务（此时 disposed 还是 false，不会被 assertNotDisposed 拦截）
        this.cancelAllInternal('TaskManager disposed');
        this.queue.clear();
        // 标记为已销毁并清理
        this.disposed = true;
        this.listeners.clear();
        this.tasks.clear();
    }
    /**
     * 是否已销毁
     */
    get isDisposed() {
        return this.disposed;
    }
    // ==================== 内部方法 ====================
    /**
     * 内部取消单个任务（不检查 disposed 状态）
     */
    cancelInternal(id, reason) {
        const entry = this.tasks.get(id);
        if (!entry) {
            return false;
        }
        if (entry.status !== 'pending' && entry.status !== 'running') {
            return false;
        }
        entry.abortController.abort(reason);
        // 如果任务还在 pending 状态（尚未被 p-queue 执行），
        // 需要手动更新状态，因为 abort 不会触发 p-queue 回调
        if (entry.status === 'pending') {
            entry.status = 'cancelled';
            entry.completedAt = Date.now();
            entry.error = reason;
            this.emit('task.cancelled', {
                task: this.toTaskInfo(entry),
                reason,
            });
        }
        // running 状态的任务会在 submit 的 catch 中处理
        return true;
    }
    /**
     * 内部取消所有任务（不检查 disposed 状态）
     */
    cancelAllInternal(reason) {
        let count = 0;
        for (const [id, entry] of this.tasks) {
            if (entry.status === 'pending' || entry.status === 'running') {
                if (this.cancelInternal(id, reason)) {
                    count++;
                }
            }
        }
        // 清空 p-queue 中等待的任务
        this.queue.clear();
        return count;
    }
    emit(type, payload) {
        const set = this.listeners.get(type);
        if (!set || set.size === 0) {
            return;
        }
        const event = {
            type,
            payload,
            timestamp: Date.now(),
        };
        for (const listener of set) {
            try {
                listener(event);
            }
            catch {
                // 事件监听器的错误不应影响队列运行
            }
        }
    }
    toTaskInfo(entry) {
        return {
            id: entry.id,
            type: entry.type,
            priority: entry.priority,
            status: entry.status,
            timestamps: {
                createdAt: entry.createdAt,
                startedAt: entry.startedAt,
                completedAt: entry.completedAt,
            },
            error: entry.error,
            result: entry.result,
            abortController: entry.abortController,
        };
    }
    /**
     * 清理已完成的任务，保留最近 maxCompletedTasks 个
     */
    pruneCompletedTasks() {
        const terminalStatuses = ['completed', 'failed', 'cancelled'];
        const terminalEntries = [];
        for (const entry of this.tasks.values()) {
            if (terminalStatuses.includes(entry.status) && entry.completedAt) {
                terminalEntries.push({ id: entry.id, completedAt: entry.completedAt });
            }
        }
        if (terminalEntries.length <= this.config.maxCompletedTasks) {
            return;
        }
        // 按完成时间排序，删除最旧的
        terminalEntries.sort((a, b) => a.completedAt - b.completedAt);
        const toRemove = terminalEntries.length - this.config.maxCompletedTasks;
        for (let i = 0; i < toRemove; i++) {
            this.tasks.delete(terminalEntries[i].id);
        }
    }
    assertNotDisposed() {
        if (this.disposed) {
            throw new Error('TaskManager has been disposed');
        }
    }
}
