import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

function hasAssistantTextContent(message: SDKMessage): boolean {
  const content = (message as any)?.message?.content;
  if (!Array.isArray(content)) {
    return false;
  }

  return content.some((block: any) => (
    block?.type === 'text'
    && typeof block.text === 'string'
    && block.text.trim().length > 0
  ));
}

export function shouldCollectAutoTitleMessage(message: SDKMessage): boolean {
  if (message.type === 'assistant') {
    return hasAssistantTextContent(message);
  }

  if (message.type === 'result') {
    return message.subtype === 'success';
  }

  return false;
}
