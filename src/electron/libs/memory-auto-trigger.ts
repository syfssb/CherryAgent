/**
 * Memory Auto Trigger - AI 自动触发记忆更新
 *
 * 功能:
 * - 在会话结束后自动提取记忆
 * - 智能判断何时需要更新记忆
 * - 自动应用记忆提取结果
 * - 提供记忆更新建议
 */

import { extractMemories, containsSensitiveInfo, type MemoryExtraction } from "./memory-extractor.js";
import type { MemoryStore } from "./memory-store.js";
import type { StreamMessage } from "../types.js";

/**
 * 记忆更新配置
 */
export interface MemoryAutoTriggerConfig {
  /** 是否启用自动提取 */
  enabled: boolean;
  /** 最小消息数量触发提取 */
  minMessages: number;
  /** 最小置信度阈值 */
  minConfidence: number;
  /** 是否自动应用提取结果 */
  autoApply: boolean;
  /** 是否检查敏感信息 */
  checkSensitive: boolean;
}

/**
 * 记忆更新结果
 */
export interface MemoryUpdateResult {
  success: boolean;
  extractionsCount: number;
  appliedCount: number;
  rejectedCount: number;
  rejectedReasons: Array<{ extraction: MemoryExtraction; reason: string }>;
  error?: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: MemoryAutoTriggerConfig = {
  enabled: true,
  minMessages: 5,
  minConfidence: 0.7,
  autoApply: false, // 默认不自动应用,需要用户确认
  checkSensitive: true
};

/**
 * Memory Auto Trigger 类
 */
export class MemoryAutoTrigger {
  private config: MemoryAutoTriggerConfig;
  private memoryStore: MemoryStore;

  constructor(memoryStore: MemoryStore, config?: Partial<MemoryAutoTriggerConfig>) {
    this.memoryStore = memoryStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<MemoryAutoTriggerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * 获取当前配置
   */
  getConfig(): MemoryAutoTriggerConfig {
    return { ...this.config };
  }

  /**
   * 检查是否应该触发记忆提取
   */
  shouldTriggerExtraction(messages: StreamMessage[]): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // 过滤掉系统消息,只统计有意义的用户和助手消息
    const meaningfulMessages = messages.filter(
      (msg) => msg.type === "user_prompt" || msg.type === "assistant" || msg.type === "result"
    );

    return meaningfulMessages.length >= this.config.minMessages;
  }

  /**
   * 从会话消息中提取并应用记忆
   *
   * @param messages - 会话消息列表
   * @param sessionId - 会话 ID (可选,用于追踪)
   * @returns 更新结果
   */
  async processSessionMemories(
    messages: StreamMessage[],
    sessionId?: string
  ): Promise<MemoryUpdateResult> {
    const result: MemoryUpdateResult = {
      success: false,
      extractionsCount: 0,
      appliedCount: 0,
      rejectedCount: 0,
      rejectedReasons: []
    };

    try {
      // 检查是否应该触发
      if (!this.shouldTriggerExtraction(messages)) {
        console.info("[memory-auto-trigger] Not enough messages to trigger extraction");
        result.success = true;
        return result;
      }

      // 提取记忆
      const extractionResult = await extractMemories(messages);

      if (!extractionResult.success) {
        result.error = extractionResult.error || "Extraction failed";
        return result;
      }

      result.extractionsCount = extractionResult.extractions.length;

      if (extractionResult.extractions.length === 0) {
        console.info("[memory-auto-trigger] No memories extracted");
        result.success = true;
        return result;
      }

      // 过滤和验证提取结果
      const validExtractions = this.filterExtractions(extractionResult.extractions, result);

      // 如果配置为自动应用,则应用提取结果
      if (this.config.autoApply) {
        for (const extraction of validExtractions) {
          try {
            await this.applyExtraction(extraction, sessionId);
            result.appliedCount++;
          } catch (error) {
            result.rejectedCount++;
            result.rejectedReasons.push({
              extraction,
              reason: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      result.success = true;
      console.info(
        `[memory-auto-trigger] Processed ${result.extractionsCount} extractions: ${result.appliedCount} applied, ${result.rejectedCount} rejected`
      );

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      console.error("[memory-auto-trigger] Error processing memories:", error);
      return result;
    }
  }

  /**
   * 过滤和验证提取结果
   */
  private filterExtractions(
    extractions: MemoryExtraction[],
    result: MemoryUpdateResult
  ): MemoryExtraction[] {
    return extractions.filter((extraction) => {
      // 检查置信度
      if (extraction.confidence < this.config.minConfidence) {
        result.rejectedCount++;
        result.rejectedReasons.push({
          extraction,
          reason: `Confidence ${extraction.confidence} below threshold ${this.config.minConfidence}`
        });
        return false;
      }

      // 检查敏感信息
      if (this.config.checkSensitive) {
        const sensitiveCheck = containsSensitiveInfo(extraction.content);
        if (sensitiveCheck.hasSensitive) {
          result.rejectedCount++;
          result.rejectedReasons.push({
            extraction,
            reason: `Contains sensitive information: ${sensitiveCheck.types.join(", ")}`
          });
          return false;
        }
      }

      // 检查内容不为空
      if (extraction.content.trim().length === 0) {
        result.rejectedCount++;
        result.rejectedReasons.push({
          extraction,
          reason: "Empty content"
        });
        return false;
      }

      return true;
    });
  }

  /**
   * 应用单个提取结果
   */
  private async applyExtraction(extraction: MemoryExtraction, sessionId?: string): Promise<void> {
    const { blockId, action, content } = extraction;

    // 检查记忆块是否存在
    let block = this.memoryStore.getBlockById(blockId);
    if (!block) {
      block = this.memoryStore.getBlock(blockId);
    }

    if (!block) {
      throw new Error(`Memory block ${blockId} not found`);
    }

    // 根据 action 类型应用更新
    switch (action) {
      case "append":
        // 追加到现有内容
        if (block.value.trim().length === 0) {
          // 如果块是空的,直接设置
          this.memoryStore.updateBlock(block.id, content);
        } else {
          // 否则追加
          this.memoryStore.appendToBlock(block.id, content, "\n");
        }
        break;

      case "replace":
        // 替换整个内容
        this.memoryStore.updateBlock(block.id, content);
        break;

      case "create":
        // 创建新的记忆块 (通常不会到这里,因为 blockId 已经指定了)
        // 但为了完整性,我们也处理这种情况
        throw new Error("Cannot create block with predefined blockId");

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.info(`[memory-auto-trigger] Applied ${action} to block ${block.label}:`, content.slice(0, 100));

    // 可选: 创建归档记忆作为历史记录
    if (sessionId) {
      try {
        this.memoryStore.createArchivalMemory({
          content: `[Auto-extracted] ${content}`,
          sourceSessionId: sessionId,
          tags: ["auto-extracted", action, block.label]
        });
      } catch (error) {
        console.warn("[memory-auto-trigger] Failed to create archival memory:", error);
      }
    }
  }

  /**
   * 获取记忆提取建议 (不自动应用)
   *
   * @param messages - 会话消息列表
   * @returns 提取建议列表
   */
  async getSuggestions(messages: StreamMessage[]): Promise<MemoryExtraction[]> {
    if (!this.shouldTriggerExtraction(messages)) {
      return [];
    }

    const extractionResult = await extractMemories(messages);

    if (!extractionResult.success || extractionResult.extractions.length === 0) {
      return [];
    }

    // 过滤但不应用
    const result: MemoryUpdateResult = {
      success: false,
      extractionsCount: 0,
      appliedCount: 0,
      rejectedCount: 0,
      rejectedReasons: []
    };

    return this.filterExtractions(extractionResult.extractions, result);
  }

  /**
   * 手动应用单个提取建议
   *
   * @param extraction - 提取结果
   * @param sessionId - 会话 ID (可选)
   */
  async applySuggestion(extraction: MemoryExtraction, sessionId?: string): Promise<void> {
    // 验证提取结果
    const result: MemoryUpdateResult = {
      success: false,
      extractionsCount: 0,
      appliedCount: 0,
      rejectedCount: 0,
      rejectedReasons: []
    };

    const validExtractions = this.filterExtractions([extraction], result);

    if (validExtractions.length === 0) {
      const reason = result.rejectedReasons[0]?.reason || "Validation failed";
      throw new Error(`Cannot apply suggestion: ${reason}`);
    }

    await this.applyExtraction(extraction, sessionId);
  }

  /**
   * 批量应用提取建议
   *
   * @param extractions - 提取结果列表
   * @param sessionId - 会话 ID (可选)
   * @returns 应用结果
   */
  async applySuggestions(
    extractions: MemoryExtraction[],
    sessionId?: string
  ): Promise<MemoryUpdateResult> {
    const result: MemoryUpdateResult = {
      success: false,
      extractionsCount: extractions.length,
      appliedCount: 0,
      rejectedCount: 0,
      rejectedReasons: []
    };

    const validExtractions = this.filterExtractions(extractions, result);

    for (const extraction of validExtractions) {
      try {
        await this.applyExtraction(extraction, sessionId);
        result.appliedCount++;
      } catch (error) {
        result.rejectedCount++;
        result.rejectedReasons.push({
          extraction,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    result.success = true;
    return result;
  }
}

export default MemoryAutoTrigger;
