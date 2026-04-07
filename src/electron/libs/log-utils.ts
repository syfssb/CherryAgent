/**
 * 日志工具模块 — 提供带轮转的文件日志写入能力
 *
 * 设计：
 * - 单文件最大 10 MB，超过后自动归档为 `.1` 后缀，最多保留 1 个归档
 * - 所有 I/O 错误静默忽略，日志系统本身不能成为故障源
 * - 被 main.ts（主进程异常日志）和 core.ts（渲染进程上报日志）共享
 */
import { appendFileSync, existsSync, statSync, renameSync, unlinkSync } from "fs";

/** 日志文件最大字节数：10 MB */
export const LOG_MAX_BYTES = 10 * 1024 * 1024;

/**
 * 检查日志文件是否超过阈值，超过则归档为 `.1` 后缀
 * 已存在的旧归档会被覆盖（最多保留 1 个归档文件）
 */
export function rotateIfNeeded(logPath: string): void {
  try {
    const size = statSync(logPath).size;
    if (size >= LOG_MAX_BYTES) {
      const rotated = logPath + ".1";
      if (existsSync(rotated)) unlinkSync(rotated);
      renameSync(logPath, rotated);
    }
  } catch {
    // 文件不存在或权限问题，忽略
  }
}

/**
 * 带轮转的日志追加写入
 * 每次写入前检查文件大小，超过阈值则自动归档
 */
export function appendLogWithRotation(logPath: string, line: string): void {
  try {
    rotateIfNeeded(logPath);
    appendFileSync(logPath, line, "utf8");
  } catch {
    // 写日志本身不能抛出异常，静默忽略
  }
}
