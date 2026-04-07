import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import { isGloballyHandledChatErrorText } from "@/ui/lib/chat-error";

type AssistantContentBlock = {
  type?: string;
  text?: string;
};

export function shouldSuppressAssistantSystemErrorMessage(message: Pick<SDKAssistantMessage, "message">): boolean {
  const contents = Array.isArray(message.message?.content)
    ? message.message.content as AssistantContentBlock[]
    : [];

  if (contents.length === 0) {
    return false;
  }

  let hasText = false;

  for (const block of contents) {
    if (!block || typeof block !== "object") {
      return false;
    }

    if (block.type === "tool_use" || block.type === "thinking") {
      return false;
    }

    if (block.type !== "text") {
      continue;
    }

    const text = typeof block.text === "string" ? block.text.trim() : "";
    if (!text) {
      continue;
    }

    hasText = true;
    if (!isGloballyHandledChatErrorText(text)) {
      return false;
    }
  }

  return hasText;
}
