/**
 * Memory Extractor - 记忆提取器
 *
 * 功能:
 * - 从对话中提取用户偏好和重要信息
 * - 使用 Claude API 智能识别可记忆的内容
 * - 返回建议的记忆更新
 */

import { llmComplete } from "./llm-service.js";
import type { StreamMessage } from "../types.js";

/**
 * 记忆提取结果
 */
export interface MemoryExtraction {
  /** 提取的记忆块 */
  blockId: string;
  /** 建议的更新类型 */
  action: "append" | "replace" | "create";
  /** 要添加/替换的内容 */
  content: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 提取来源描述 */
  source: string;
}

/**
 * 提取结果
 */
export interface ExtractionResult {
  success: boolean;
  extractions: MemoryExtraction[];
  error?: string;
}

/**
 * 系统提示词
 */
const SYSTEM_PROMPT = `你是一个记忆提取助手。分析以下对话，提取可以长期记住的用户信息。

重点关注:
1. 用户偏好（编程语言、框架、代码风格等）
2. 个人信息（名字、职位、公司等，仅在用户主动提供时）
3. 项目上下文（技术栈、项目目标等）
4. 工作习惯（沟通偏好、工作时间等）

输出格式（JSON数组）:
[
  {
    "blockId": "core_memory_user" | "core_memory_project" | "core_memory_persona",
    "action": "append" | "replace",
    "content": "要记住的具体内容",
    "confidence": 0.0-1.0,
    "source": "从哪句话提取的"
  }
]

规则:
- 只提取明确表达的信息，不要推测
- 置信度低于 0.6 的不要返回
- 每次最多返回 5 条
- 如果没有值得记忆的内容，返回空数组 []
- 只输出 JSON，不要有其他文字`;

/**
 * 从消息中提取文本内容
 */
function extractMessageContent(message: StreamMessage): string {
  if (message.type === "user_prompt") {
    return `用户: ${message.prompt}`;
  }

  if (message.type === "assistant") {
    const msg = message as any;
    if (msg.message?.content) {
      const textBlocks = msg.message.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n");
      return `助手: ${textBlocks}`;
    }
  }

  if (message.type === "result" && (message as any).subtype === "success") {
    const resultMsg = message as any;
    if (resultMsg.result) {
      return `助手: ${resultMsg.result}`;
    }
  }

  return "";
}

/**
 * 构建提取上下文
 */
function buildExtractionContext(messages: StreamMessage[]): string {
  const relevantMessages = messages
    .slice(-20) // 取最近 20 条消息
    .map(extractMessageContent)
    .filter((content) => content.length > 0);

  if (relevantMessages.length === 0) {
    return "";
  }

  return relevantMessages.join("\n\n");
}

/**
 * 解析 Claude 返回的 JSON
 */
function parseExtractions(text: string): MemoryExtraction[] {
  // 尝试直接解析
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return validateExtractions(parsed);
    }
  } catch {
    // 尝试从文本中提取 JSON
  }

  // 尝试提取 JSON 数组
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return validateExtractions(parsed);
      }
    } catch {
      // 解析失败
    }
  }

  return [];
}

/**
 * 验证和清理提取结果
 */
function validateExtractions(raw: unknown[]): MemoryExtraction[] {
  const validBlockIds = ["core_memory_user", "core_memory_project", "core_memory_persona"];
  const validActions = ["append", "replace", "create"];

  return raw
    .filter((item): item is Record<string, unknown> => {
      if (typeof item !== "object" || item === null) return false;
      const obj = item as Record<string, unknown>;
      return (
        typeof obj.blockId === "string" &&
        typeof obj.content === "string" &&
        typeof obj.confidence === "number"
      );
    })
    .filter((item) => {
      // 验证 blockId
      if (!validBlockIds.includes(item.blockId as string)) return false;
      // 验证 action
      if (item.action && !validActions.includes(item.action as string)) return false;
      // 验证置信度
      if ((item.confidence as number) < 0.6) return false;
      // 验证内容不为空
      if ((item.content as string).trim().length === 0) return false;
      return true;
    })
    .map((item) => ({
      blockId: item.blockId as string,
      action: (item.action as "append" | "replace" | "create") || "append",
      content: (item.content as string).trim(),
      confidence: Math.min(1, Math.max(0, item.confidence as number)),
      source: typeof item.source === "string" ? item.source : ""
    }))
    .slice(0, 5); // 最多返回 5 条
}

/**
 * 从对话中提取记忆
 *
 * @param messages - 会话消息列表
 * @returns 提取结果
 */
export async function extractMemories(messages: StreamMessage[]): Promise<ExtractionResult> {
  const context = buildExtractionContext(messages);

  if (!context || context.length < 50) {
    // 对话内容太少，不进行提取
    return {
      success: true,
      extractions: []
    };
  }

  try {
    const result = await llmComplete({
      systemPrompt: SYSTEM_PROMPT,
      prompt: `对话内容:\n${context}`,
    });

    if (!result.success) {
      return {
        success: false,
        extractions: [],
        error: result.error,
      };
    }

    const extractions = parseExtractions(result.text);
    console.info("[memory-extractor] Extracted memories:", extractions.length);
    return {
      success: true,
      extractions,
    };
  } catch (error) {
    console.error("[memory-extractor] Failed to extract memories:", error);
    return {
      success: false,
      extractions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 批量提取记忆（处理较长的对话）
 *
 * @param messages - 会话消息列表
 * @param batchSize - 每批处理的消息数
 * @returns 合并后的提取结果
 */
export async function extractMemoriesBatched(
  messages: StreamMessage[],
  batchSize: number = 20
): Promise<ExtractionResult> {
  if (messages.length <= batchSize) {
    return extractMemories(messages);
  }

  const allExtractions: MemoryExtraction[] = [];
  const errors: string[] = [];

  // 分批处理
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const result = await extractMemories(batch);

    if (result.success) {
      allExtractions.push(...result.extractions);
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  // 去重和合并（基于 blockId 和相似内容）
  const uniqueExtractions = deduplicateExtractions(allExtractions);

  return {
    success: errors.length === 0,
    extractions: uniqueExtractions,
    error: errors.length > 0 ? errors.join("; ") : undefined
  };
}

/**
 * 去重和合并提取结果
 */
function deduplicateExtractions(extractions: MemoryExtraction[]): MemoryExtraction[] {
  const seen = new Map<string, MemoryExtraction>();

  for (const extraction of extractions) {
    const key = `${extraction.blockId}:${extraction.content.slice(0, 50)}`;

    const existing = seen.get(key);
    if (!existing || extraction.confidence > existing.confidence) {
      seen.set(key, extraction);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

/**
 * 检查内容是否包含个人身份信息 (PII)
 * 用于在存储前进行安全检查
 */
export function containsSensitiveInfo(content: string): {
  hasSensitive: boolean;
  types: string[];
} {
  const patterns: Array<{ name: string; pattern: RegExp }> = [
    { name: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    { name: "phone", pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },
    { name: "ssn", pattern: /\d{3}[-\s]?\d{2}[-\s]?\d{4}/g },
    { name: "credit_card", pattern: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g },
    { name: "api_key", pattern: /(?:sk-|pk-|api[-_]?key)[a-zA-Z0-9]{20,}/gi }
  ];

  const foundTypes: string[] = [];

  for (const { name, pattern } of patterns) {
    if (pattern.test(content)) {
      foundTypes.push(name);
    }
  }

  return {
    hasSensitive: foundTypes.length > 0,
    types: foundTypes
  };
}

export default {
  extractMemories,
  extractMemoriesBatched,
  containsSensitiveInfo
};
