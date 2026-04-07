/**
 * 会话标题生成器
 * 使用 Claude Haiku 模型根据对话内容生成简洁的标题
 */
import { llmComplete, getModelAndEnv } from "./llm-service.js";
import { getProxyConfig } from "./proxy-client.js";
import type { StreamMessage } from "../types.js";

/**
 * 标题生成配置
 */
const TITLE_CONFIG = {
  /** 标题最大长度（中文约 5 字，英文约 20 字符） */
  maxLength: 20,
  /** 默认标题 */
  defaultTitle: "新对话",
} as const;

/**
 * 系统提示词
 */
const SYSTEM_PROMPT = `你是一个标题生成助手。根据对话内容生成极简标题。
要求：
- 中文标题：不超过 5 个汉字
- 英文标题：不超过 3 个单词
- 严格使用用户的主要语言
- 不要使用引号、标点
- 直接输出标题，不要有任何前缀或解释`;

/**
 * 从消息中提取文本内容
 */
function extractMessageContent(message: StreamMessage): string {
  if (message.type === "user_prompt") {
    return `User: ${message.prompt}`;
  }

  if (message.type === "assistant") {
    // 处理 assistant 消息
    const msg = message as any;
    if (msg.message?.content) {
      const textBlocks = msg.message.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n");
      return `Assistant: ${textBlocks}`;
    }
  }

  if (message.type === "result" && (message as any).subtype === "success") {
    const resultMsg = message as any;
    if (resultMsg.result) {
      return `Assistant: ${resultMsg.result}`;
    }
  }

  return "";
}

/**
 * 构建标题生成的上下文
 * @param messages - 会话消息列表
 * @returns 用于生成标题的上下文文本
 */
function buildTitleContext(messages: StreamMessage[]): string {
  // 只取前几条有意义的消息来生成标题
  const relevantMessages = messages
    .slice(0, 10) // 最多取前 10 条消息
    .map(extractMessageContent)
    .filter((content) => content.length > 0)
    .slice(0, 5); // 最终只用 5 条

  if (relevantMessages.length === 0) {
    return "";
  }

  return relevantMessages.join("\n\n");
}

/**
 * 检测语言是否为中文
 */
function isChineseText(text: string): boolean {
  const chineseRegex = /[\u4e00-\u9fff]/g;
  const chineseChars = text.match(chineseRegex);
  if (!chineseChars) return false;
  // 如果中文字符超过 20%，认为是中文
  return chineseChars.length / text.length > 0.2;
}

type TitleLanguage = "zh" | "en";

function detectTitleLanguage(messages: StreamMessage[], context: string): TitleLanguage {
  const firstUserPrompt = messages.find(
    (message) =>
      message.type === "user_prompt" &&
      typeof (message as any).prompt === "string" &&
      ((message as any).prompt as string).trim().length > 0,
  ) as { type: "user_prompt"; prompt: string } | undefined;

  const source = firstUserPrompt?.prompt ?? context;

  if (isChineseText(source)) {
    return "zh";
  }

  return "en";
}

function buildTitleUserPrompt(context: string, language: TitleLanguage): string {
  const languageInstruction =
    language === "zh"
      ? "目标语言：中文。标题不超过5个汉字。"
      : "Target language: English. Max 3 words.";

  return `${languageInstruction}\n\n对话内容：\n${context}`;
}

/**
 * 截断标题到指定长度
 */
function truncateTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= TITLE_CONFIG.maxLength) {
    return trimmed;
  }
  // 截断并添加省略号
  return trimmed.slice(0, TITLE_CONFIG.maxLength - 3) + "...";
}

/**
 * 清理生成的标题
 * 移除引号、前缀等不需要的内容
 */
function cleanTitle(title: string): string {
  let cleaned = title.trim();

  // 移除各种引号
  cleaned = cleaned.replace(/^["'`"'"']+|["'`"'"']+$/g, "");

  // 移除常见的前缀
  const prefixes = [
    /^标题[:：]\s*/i,
    /^title[:：]\s*/i,
    /^主题[:：]\s*/i,
    /^subject[:：]\s*/i,
  ];
  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, "");
  }

  // 移除换行符
  cleaned = cleaned.replace(/[\r\n]+/g, " ");

  // 压缩多余空格
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return truncateTitle(cleaned);
}

export type TitleGenerationResult = {
  success: boolean;
  title: string;
  error?: string;
};

/**
 * 根据对话内容生成标题
 * @param messages - 会话消息列表
 * @returns 生成的标题
 */
export async function generateTitle(messages: StreamMessage[]): Promise<TitleGenerationResult> {
  // 构建上下文
  const context = buildTitleContext(messages);
  const language = detectTitleLanguage(messages, context);
  const titlePrompt = buildTitleUserPrompt(context, language);

  if (!context) {
    return {
      success: true,
      title: TITLE_CONFIG.defaultTitle,
    };
  }

  const { config, model: defaultModel, env: currentEnv } = await getModelAndEnv();
  if (!config) {
    console.warn("[title-generator] No API config available, using default title");
    return {
      success: false,
      title: fallbackTitle(context),
      error: "No API configuration available",
    };
  }

  const isProxyMode = 'isProxy' in config && config.isProxy;

  // 代理模式下：标题只走工具模型（OpenAI 兼容），绝不回退到付费 Claude
  if (isProxyMode) {
    let toolModelId = '';
    try {
      const proxyConfig = getProxyConfig();
      const apiBase = proxyConfig.baseURL?.replace(/\/+$/, '');
      if (apiBase) {
        const toolModelUrl = `${apiBase}/models/tool-model`;
        const authToken = config.apiKey;
        const response = await fetch(toolModelUrl, {
          method: 'GET',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.data?.toolModelId) {
            toolModelId = data.data.toolModelId;
            console.info('[title-generator] Using tool model:', toolModelId);
          }
        }
      }
    } catch (error) {
      console.warn('[title-generator] Failed to fetch tool model, using fallback title:', error);
    }

    if (!toolModelId) {
      console.info('[title-generator] proxy mode: no tool model, using fallback title');
      return {
        success: true,
        title: fallbackTitle(context),
      };
    }

    try {
      const proxyConfig = getProxyConfig();
      const apiBase = proxyConfig.baseURL?.replace(/\/+$/, '');
      if (apiBase) {
        const chatUrl = `${apiBase}/proxy/chat/completions`;
        const authToken = config.apiKey;
        const requestBody = {
          model: toolModelId,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: titlePrompt },
          ],
          max_tokens: 100,
          temperature: 0.3,
        };
        const chatResponse = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(15000),
        });

        if (chatResponse.ok) {
          const chatData = chatResponse.json() as Promise<{
            choices?: Array<{ message?: { content?: string } }>;
          }>;
          const data = await chatData;
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const cleanedTitle = cleanTitle(content);
            console.info('[title-generator] Generated title via proxy:', cleanedTitle);
            return {
              success: true,
              title: cleanedTitle || TITLE_CONFIG.defaultTitle,
            };
          }
        } else {
          console.warn('[title-generator] Proxy chat API failed:', chatResponse.status);
        }
      }
    } catch (error) {
      console.warn('[title-generator] Proxy title generation failed, using fallback title:', error);
    }

    console.info('[title-generator] proxy mode: tool model title failed, using fallback title');
    return {
      success: true,
      title: fallbackTitle(context),
    };
  }

  const model = defaultModel;
  const envForCall = { ...currentEnv };
  if (!model) {
    return {
      success: false,
      title: fallbackTitle(context),
      error: "No model configured"
    };
  }

  // 回退到 LLM Service（仅直连模式）
  try {
    const result = await llmComplete({
      systemPrompt: SYSTEM_PROMPT,
      prompt: titlePrompt,
      model,
      env: envForCall,
    });

    if (result.success && result.text) {
      const cleanedTitle = cleanTitle(result.text);
      console.info("[title-generator] Generated title:", cleanedTitle);
      return {
        success: true,
        title: cleanedTitle || TITLE_CONFIG.defaultTitle,
      };
    }

    console.warn("[title-generator] Non-success result:", result.error);
    return {
      success: false,
      title: fallbackTitle(context),
      error: result.error || "Title generation returned non-success result",
    };
  } catch (error) {
    console.error("[title-generator] Failed to generate title:", error);
    return {
      success: false,
      title: fallbackTitle(context),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 降级处理：从上下文中提取简单标题
 */
function fallbackTitle(context: string): string {
  // 尝试从用户第一条消息中提取
  const lines = context.split("\n").filter((line) => line.trim());
  const firstUserMessage = lines.find(
    (line) => line.startsWith("User:") || line.startsWith("用户:"),
  );

  if (firstUserMessage) {
    const content = firstUserMessage.replace(/^(User|用户)[:：]\s*/i, "").trim();
    // 取前 50 个字符
    const truncated = content.slice(0, TITLE_CONFIG.maxLength);
    if (truncated.length < content.length) {
      return truncated.slice(0, TITLE_CONFIG.maxLength - 3) + "...";
    }
    return truncated;
  }

  return TITLE_CONFIG.defaultTitle;
}

/**
 * 从用户输入生成标题（用于会话创建时）
 * @param userInput - 用户输入
 * @returns 生成的标题
 */
export async function generateTitleFromUserInput(userInput: string | null): Promise<string> {
  if (!userInput) {
    return TITLE_CONFIG.defaultTitle;
  }

  const messages: StreamMessage[] = [
    { type: "user_prompt", prompt: userInput },
  ];

  const result = await generateTitle(messages);
  return result.title;
}
