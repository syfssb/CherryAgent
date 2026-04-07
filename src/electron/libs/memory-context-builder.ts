/**
 * Memory Context Builder - 记忆上下文构建器
 *
 * 功能:
 * - 从 memory-store 获取记忆块
 * - 格式化为系统提示上下文
 * - 处理记忆优先级和截断策略
 * - 支持会话级别的记忆配置
 */

import type { MemoryStore } from "./memory-store.js";
import type { MemoryBlock } from "../types/local-db.js";

/**
 * 记忆上下文构建选项
 */
export interface MemoryContextBuildOptions {
  /** 是否包含空值的记忆块 */
  includeEmpty?: boolean;
  /** 最大记忆块数量 */
  maxBlocks?: number;
  /** 记忆块优先级排序（按标签） */
  priorityBlocks?: string[];
  /** 排除的记忆块（按标签或 ID） */
  excludeBlocks?: string[];
  /** 单个记忆块的最大字符数 */
  maxCharsPerBlock?: number;
  /** 总记忆上下文的最大字符数 */
  maxTotalChars?: number;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: MemoryContextBuildOptions = {
  includeEmpty: false,
  maxBlocks: 10,
  priorityBlocks: ["core_memory_persona", "core_memory_user", "core_memory_project"],
  excludeBlocks: [],
  maxCharsPerBlock: 3000,
  maxTotalChars: 8000
};

/**
 * 记忆上下文构建器类
 */
export class MemoryContextBuilder {
  private memoryStore: MemoryStore;
  private options: MemoryContextBuildOptions;

  constructor(memoryStore: MemoryStore, options?: MemoryContextBuildOptions) {
    this.memoryStore = memoryStore;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 构建记忆上下文
   *
   * @returns 格式化的记忆上下文字符串
   */
  buildContext(): string {
    // 获取所有记忆块
    let blocks = this.memoryStore.getAllBlocks();

    // 过滤空块
    if (!this.options.includeEmpty) {
      blocks = blocks.filter((block) => block.value.trim().length > 0);
    }

    // 过滤排除的块
    if (this.options.excludeBlocks && this.options.excludeBlocks.length > 0) {
      blocks = blocks.filter(
        (block) =>
          !this.options.excludeBlocks!.includes(block.id) &&
          !this.options.excludeBlocks!.includes(block.label)
      );
    }

    // 如果没有记忆块，返回空字符串
    if (blocks.length === 0) {
      return "";
    }

    // 按优先级排序
    blocks = this.sortBlocksByPriority(blocks);

    // 限制块数量
    if (this.options.maxBlocks && this.options.maxBlocks > 0) {
      blocks = blocks.slice(0, this.options.maxBlocks);
    }

    // 截断每个块的内容
    blocks = blocks.map((block) => this.truncateBlock(block));

    // 构建上下文字符串
    let context = this.formatBlocks(blocks);

    // 如果总长度超过限制，进一步截断
    if (this.options.maxTotalChars && context.length > this.options.maxTotalChars) {
      context = this.truncateContext(context, blocks);
    }

    return context;
  }

  /**
   * 按优先级排序记忆块
   *
   * @param blocks - 记忆块列表
   * @returns 排序后的记忆块列表
   */
  private sortBlocksByPriority(blocks: MemoryBlock[]): MemoryBlock[] {
    if (!this.options.priorityBlocks || this.options.priorityBlocks.length === 0) {
      // 如果没有优先级设置，按更新时间排序
      return blocks.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    const priorityMap = new Map<string, number>();
    this.options.priorityBlocks.forEach((label, index) => {
      priorityMap.set(label, index);
    });

    return blocks.sort((a, b) => {
      const aPriority = priorityMap.get(a.label) ?? priorityMap.get(a.id) ?? 999;
      const bPriority = priorityMap.get(b.label) ?? priorityMap.get(b.id) ?? 999;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // 相同优先级按更新时间排序
      return b.updatedAt - a.updatedAt;
    });
  }

  /**
   * 截断单个记忆块的内容
   *
   * @param block - 记忆块
   * @returns 截断后的记忆块
   */
  private truncateBlock(block: MemoryBlock): MemoryBlock {
    const maxChars = this.options.maxCharsPerBlock ?? DEFAULT_OPTIONS.maxCharsPerBlock!;

    if (block.value.length <= maxChars) {
      return block;
    }

    // 截断内容
    let truncatedValue = block.value.substring(0, maxChars);

    // 尝试在完整的句子或段落处截断
    const lastPeriod = truncatedValue.lastIndexOf("。");
    const lastNewline = truncatedValue.lastIndexOf("\n");
    const cutPoint = Math.max(lastPeriod, lastNewline);

    if (cutPoint > maxChars * 0.8) {
      truncatedValue = truncatedValue.substring(0, cutPoint + 1);
    }

    truncatedValue += "\n[...内容过长已截断...]";

    return {
      ...block,
      value: truncatedValue
    };
  }

  /**
   * 格式化记忆块为上下文字符串
   *
   * @param blocks - 记忆块列表
   * @returns 格式化的上下文字符串
   */
  private formatBlocks(blocks: MemoryBlock[]): string {
    const parts: string[] = [
      "# Memory Context",
      "",
      "The following information has been stored in memory and should be considered when responding:",
      ""
    ];

    for (const block of blocks) {
      parts.push(`## ${block.label}`);
      if (block.description && block.description.trim().length > 0) {
        parts.push(`_${block.description}_`);
      }
      parts.push("");
      parts.push(block.value);
      parts.push("");
    }

    return parts.join("\n").trim();
  }

  /**
   * 截断整体上下文（当总长度超过限制时）
   *
   * @param context - 原始上下文
   * @param blocks - 记忆块列表
   * @returns 截断后的上下文
   */
  private truncateContext(context: string, blocks: MemoryBlock[]): string {
    const maxChars = this.options.maxTotalChars ?? DEFAULT_OPTIONS.maxTotalChars!;

    // 策略1: 移除优先级最低的块
    if (blocks.length > 1) {
      // 移除最后一个块，重新格式化
      const reducedBlocks = blocks.slice(0, -1);
      const newContext = this.formatBlocks(reducedBlocks);

      if (newContext.length <= maxChars) {
        return newContext;
      }

      // 如果还是太长，递归截断
      return this.truncateContext(newContext, reducedBlocks);
    }

    // 策略2: 只剩一个块时，直接截断
    if (context.length > maxChars) {
      const truncated = context.substring(0, maxChars);
      const lastNewline = truncated.lastIndexOf("\n");

      if (lastNewline > maxChars * 0.9) {
        return truncated.substring(0, lastNewline) + "\n\n[...内容过长已截断...]";
      }

      return truncated + "\n\n[...内容过长已截断...]";
    }

    return context;
  }

  /**
   * 更新构建选项
   *
   * @param options - 新的选项
   */
  updateOptions(options: Partial<MemoryContextBuildOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 获取当前配置
   *
   * @returns 当前的构建选项
   */
  getOptions(): MemoryContextBuildOptions {
    return { ...this.options };
  }

  /**
   * 获取记忆块统计信息
   *
   * @returns 统计信息
   */
  getStatistics(): {
    totalBlocks: number;
    nonEmptyBlocks: number;
    totalChars: number;
    averageCharsPerBlock: number;
  } {
    const allBlocks = this.memoryStore.getAllBlocks();
    const nonEmptyBlocks = allBlocks.filter((block) => block.value.trim().length > 0);
    const totalChars = nonEmptyBlocks.reduce((sum, block) => sum + block.value.length, 0);

    return {
      totalBlocks: allBlocks.length,
      nonEmptyBlocks: nonEmptyBlocks.length,
      totalChars,
      averageCharsPerBlock: nonEmptyBlocks.length > 0 ? totalChars / nonEmptyBlocks.length : 0
    };
  }
}

/**
 * 创建记忆上下文构建器
 *
 * @param memoryStore - 记忆存储实例
 * @param options - 构建选项
 * @returns 记忆上下文构建器实例
 */
export function createMemoryContextBuilder(
  memoryStore: MemoryStore,
  options?: MemoryContextBuildOptions
): MemoryContextBuilder {
  return new MemoryContextBuilder(memoryStore, options);
}

export default MemoryContextBuilder;
