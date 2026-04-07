import Anthropic from '@anthropic-ai/sdk';

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export const MODEL_PROVIDERS: Record<string, string> = {
  'gpt-4': 'openai',
  'gpt-4-turbo': 'openai',
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-3.5-turbo': 'openai',
  'claude-3-opus': 'anthropic',
  'claude-3-sonnet': 'anthropic',
  'claude-3-haiku': 'anthropic',
  'claude-3.5-sonnet': 'anthropic',
  'claude-3-5-sonnet': 'anthropic',
  'claude-sonnet-4': 'anthropic',
  'claude-opus-4': 'anthropic',
  'kimi': 'openai',
  'moonshot': 'openai',
  'gemini-pro': 'openai',
  'gemini-1.5-pro': 'openai',
  'gemini-1.5-flash': 'openai',
};

export function getProviderFromModel(model: string): string {
  const normalizedModel = model.toLowerCase();

  for (const [key, provider] of Object.entries(MODEL_PROVIDERS)) {
    if (normalizedModel.includes(key)) {
      return provider;
    }
  }

  return 'openai';
}

export function convertToClaudeMessages(
  messages: Array<{
    role: string;
    content: string | null;
    name?: string;
  }>
): {
  systemMessage: string | null;
  claudeMessages: Anthropic.MessageParam[];
} {
  let systemMessage: string | null = null;
  const claudeMessages: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessage = msg.content || '';
    } else if (msg.role === 'user' || msg.role === 'assistant') {
      claudeMessages.push({
        role: msg.role,
        content: msg.content || '',
      });
    }
  }

  return { systemMessage, claudeMessages };
}
