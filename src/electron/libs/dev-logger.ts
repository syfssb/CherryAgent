/**
 * dev-logger.ts — 仅 development 模式生效的彩色终端日志
 *
 * 生产环境（IS_DEV = false）时所有函数均为 no-op，零运行时开销。
 *
 * 使用方：
 *   import { devLog } from './dev-logger.js'
 *   devLog.runner.init('session-id', 'claude-sonnet-4-6')
 *   devLog.runner.tool('Read', { file_path: '/foo/bar.ts' })
 *   devLog.runner.toolEnd('Read', 42, 'file contents...')
 *   devLog.ipc.flush('session-id', 8)
 *   devLog.db.flush(8, 3)
 */

const IS_DEV = process.env.NODE_ENV === 'development';

// ── 文件日志（dev 模式下同时写文件，方便工具读取）─────────────────────────────
import fs from 'fs';
const LOG_FILE = '/private/tmp/cherry-agent-sdk.log';

// ── 异步写队列（防止高频 streaming 时阻塞事件循环）────────────────────────────
/**
 * 内存写缓冲区：累积 FLUSH_BATCH_SIZE 条或每 FLUSH_INTERVAL_MS 毫秒异步批量写入。
 * Node.js 单线程模型下，所有操作在同一个事件循环里串行执行，无数据竞争问题。
 * 唯一的重入风险是 flush 回调内再次触发 flush，通过 `isFlushing` 标志防止。
 */
const FLUSH_BATCH_SIZE  = 10;   // 积累多少条触发一次写入
const FLUSH_INTERVAL_MS = 100;  // 最大等待毫秒数

let writeQueue: string[]    = [];  // 待写行缓冲区
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;            // 防止 flush 重入

/** 将当前队列内容异步刷写到磁盘 */
async function flushQueue(): Promise<void> {
  if (isFlushing || writeQueue.length === 0) return;

  // 原子性：取出当前队列，重置为新队列（后续写入进新队列，不会丢失）
  const batch = writeQueue;
  writeQueue = [];
  isFlushing = true;

  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  try {
    await fs.promises.appendFile(LOG_FILE, batch.join('\n') + '\n');
  } catch {
    // 写文件失败不影响主流程
  } finally {
    isFlushing = false;

    // 如果 flush 期间又有新行入队，继续 flush
    if (writeQueue.length >= FLUSH_BATCH_SIZE) {
      void flushQueue();
    }
  }
}

/** 将一行加入写队列，达到阈值或定时器触发时批量写入 */
function enqueueWrite(line: string): void {
  writeQueue.push(line);

  if (writeQueue.length >= FLUSH_BATCH_SIZE) {
    // 积累足够多时立即刷写
    void flushQueue();
  } else if (flushTimer === null) {
    // 否则设置定时器，最多等 FLUSH_INTERVAL_MS 后刷写
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushQueue();
    }, FLUSH_INTERVAL_MS);
  }
}

/** 进程退出前同步刷写剩余队列（exit 事件不允许异步操作） */
function flushQueueSync(): void {
  if (writeQueue.length === 0) return;
  try {
    const batch = writeQueue;
    writeQueue = [];
    fs.appendFileSync(LOG_FILE, batch.join('\n') + '\n');
  } catch {
    // 退出阶段忽略写入错误
  }
}

// 仅在 dev 模式下注册退出 flush，避免生产包多余监听
if (IS_DEV) {
  process.on('exit', flushQueueSync);
}

function writeToFile(line: string): void {
  // 去掉 ANSI 颜色码再写文件
  const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
  enqueueWrite(clean);
}

// ── ANSI 颜色 ───────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  gray:    '\x1b[90m',
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  orange:  '\x1b[38;5;214m',
  purple:  '\x1b[38;5;141m',
} as const;

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function log(line: string): void {
  console.log(line);
  if (IS_DEV) writeToFile(line);
}

function ts(): string {
  const d = new Date();
  return `${C.gray}${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}${C.reset}`;
}

function ns(label: string, color: string): string {
  return `${color}${C.bold}[${label.padEnd(6)}]${C.reset}`;
}

/** 将任意值截断为简短的可读字符串 */
function summary(val: unknown, maxLen = 120): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'string' ? val : JSON.stringify(val);
  const flat = str.replace(/\s+/g, ' ').trim();
  return flat.length > maxLen ? flat.slice(0, maxLen) + '…' : flat;
}

function elapsedColor(elapsed: number): string {
  if (elapsed > 200) return `${C.red}${elapsed}ms${C.reset}`;
  if (elapsed >  50) return `${C.yellow}${elapsed}ms${C.reset}`;
  return `${C.green}${elapsed}ms${C.reset}`;
}

// ── 日志命名空间接口 ──────────────────────────────────────────────────────────

interface RunnerLogger {
  /** SDK session 初始化，记录 session_id + model */
  init(sessionId: string, model: string): void;
  /** 用户发起的查询 */
  query(sessionId: string, promptPreview: string): void;
  /** AI 调用工具（PreToolUse 时记录） */
  tool(name: string, input: unknown): void;
  /** 工具执行完毕（PostToolUse 时记录，含耗时和结果预览） */
  toolEnd(name: string, durationMs: number, resultPreview?: string): void;
  /** 工具执行失败（PostToolUseFailure 时记录） */
  toolFail(name: string, error: unknown): void;
  /** AI 返回结果（含 token 用量） */
  result(status: string, tokens?: { input?: number; output?: number; cache_read?: number }): void;
  /** Claude 正在思考（thinking block） */
  thinking(preview: string): void;
  /** Context compaction 触发 */
  compact(trigger: string, preTokens: number): void;
  /** SDK API 重试 */
  retry(attempt: number): void;
  /** 会话状态变化 */
  status(sessionId: string, newStatus: string, note?: string): void;
  /** 错误 */
  error(msg: string, detail?: unknown): void;
}

interface IpcLogger {
  /** 批量 flush IPC 事件 */
  flush(sessionId: string, count: number): void;
}

interface DbLogger {
  /** SQLite 批量 flush */
  flush(count: number, elapsedMs: number): void;
}

// ── 生产 no-op ───────────────────────────────────────────────────────────────

const NOOP = () => {};

const noopRunner: RunnerLogger = {
  init: NOOP, query: NOOP, tool: NOOP, toolEnd: NOOP, toolFail: NOOP,
  result: NOOP, thinking: NOOP, compact: NOOP, retry: NOOP,
  status: NOOP, error: NOOP,
};
const noopIpc: IpcLogger = { flush: NOOP };
const noopDb: DbLogger = { flush: NOOP };

// ── Dev 实现 ─────────────────────────────────────────────────────────────────

const devRunner: RunnerLogger = {
  init(sessionId, model) {
    log(`${ts()} ${ns('RUNNER', C.cyan)} 🔗 ${C.bold}session${C.reset}  ${C.gray}${sessionId}${C.reset}  model:${C.yellow}${model}${C.reset}`);
  },

  query(sessionId, promptPreview) {
    const id = sessionId.slice(-8);
    log(`${ts()} ${ns('RUNNER', C.cyan)} ${C.bold}▷ query${C.reset}  ${C.gray}…${id}${C.reset}  "${C.dim}${promptPreview.slice(0, 80)}${C.reset}"`);
  },

  tool(name, input) {
    const inp = summary(input);
    log(`${ts()} ${ns('RUNNER', C.cyan)} ▶ ${C.bold}${C.orange}${name}${C.reset}  ${C.gray}${inp}${C.reset}`);
  },

  toolEnd(name, durationMs, resultPreview) {
    const t = elapsedColor(durationMs);
    const r = resultPreview
      ? `  ${C.gray}→ ${summary(resultPreview, 100)}${C.reset}`
      : '';
    log(`${ts()} ${ns('RUNNER', C.cyan)} ✓ ${C.bold}${C.orange}${name}${C.reset}  ${t}${r}`);
  },

  toolFail(name, error) {
    const e = summary(error, 120);
    log(`${ts()} ${ns('RUNNER', C.cyan)} ${C.red}✗ ${name}${C.reset}  ${C.gray}${e}${C.reset}`);
  },

  result(status, tokens) {
    const icon = status === 'error' ? `${C.red}✗` : `${C.green}✓`;
    const tok  = tokens
      ? `  ${C.yellow}↑${tokens.input ?? '?'} ↓${tokens.output ?? '?'}${tokens.cache_read ? ` ♻${tokens.cache_read}` : ''}${C.reset}`
      : '';
    log(`${ts()} ${ns('RUNNER', C.cyan)} ${icon}${C.reset} result:${status}${tok}`);
  },

  thinking(preview) {
    const p = preview.replace(/\s+/g, ' ').trim();
    if (!p) return;
    log(`${ts()} ${ns('RUNNER', C.cyan)} ${C.purple}💭 ${C.dim}${p.slice(0, 100)}${p.length > 100 ? '…' : ''}${C.reset}`);
  },

  compact(trigger, preTokens) {
    const k = Math.round(preTokens / 1000);
    log(`${ts()} ${ns('RUNNER', C.cyan)} ${C.yellow}🗜  compact${C.reset}  ${C.yellow}${k}k tokens${C.reset}  trigger:${C.gray}${trigger}${C.reset}`);
  },

  retry(attempt) {
    log(`${ts()} ${ns('RUNNER', C.cyan)} ${C.yellow}↻  retry #${attempt}${C.reset}  ${C.gray}API 过载或限速，SDK 自动重试${C.reset}`);
  },

  status(sessionId, newStatus, note) {
    const id   = sessionId.slice(-8);
    const note_ = note ? `  ${C.gray}${note}${C.reset}` : '';
    const color = newStatus === 'error' ? C.red : newStatus === 'running' ? C.green : C.gray;
    log(`${ts()} ${ns('RUNNER', C.cyan)} ● ${color}${newStatus}${C.reset}  ${C.dim}…${id}${C.reset}${note_}`);
  },

  error(msg, detail) {
    const d = detail ? `  ${C.gray}${summary(detail)}${C.reset}` : '';
    log(`${ts()} ${ns('RUNNER', C.cyan)} ${C.red}✗ ${msg}${C.reset}${d}`);
  },
};

const devIpc: IpcLogger = {
  flush(sessionId, count) {
    if (count < 2) return; // 单条不打印，避免噪音
    const id = sessionId.slice(-8);
    log(`${ts()} ${ns('IPC', C.magenta)} ⚡ ${C.yellow}${count} events${C.reset} → 1 send  ${C.gray}…${id}${C.reset}`);
  },
};

const devDb: DbLogger = {
  flush(count, elapsedMs) {
    if (count === 0) return;
    log(`${ts()} ${ns('DB', C.blue)} 💾 ${C.yellow}${count} rows${C.reset}  ${elapsedColor(elapsedMs)}`);
  },
};

// ── 导出 ──────────────────────────────────────────────────────────────────────

export const IS_DEV_MODE = IS_DEV;

export const devLog = {
  runner: IS_DEV ? devRunner : noopRunner,
  ipc:    IS_DEV ? devIpc    : noopIpc,
  db:     IS_DEV ? devDb     : noopDb,
} as const;
