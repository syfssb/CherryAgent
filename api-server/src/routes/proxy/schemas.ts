import { z } from 'zod';

export const chatCompletionSchema = z.object({
  model: z.string().min(1, '模型名称不能为空'),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
    content: z.string().nullable(),
    name: z.string().optional(),
    function_call: z.object({
      name: z.string(),
      arguments: z.string(),
    }).optional(),
    tool_calls: z.array(z.object({
      id: z.string(),
      type: z.literal('function'),
      function: z.object({
        name: z.string(),
        arguments: z.string(),
      }),
    })).optional(),
  })).min(1, '消息列表不能为空'),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().min(1).max(10).optional(),
  stream: z.boolean().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  max_tokens: z.number().int().min(1).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  user: z.string().optional(),
  provider: z.string().optional(),
  apiKeyId: z.string().optional(),
  sessionId: z.string().optional(),
});

export const claudeMessagesSchema = z.object({
  model: z.string().min(1, '模型名称不能为空'),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.any(),
  }).passthrough()).min(1, '消息列表不能为空'),
  max_tokens: z.number().int().min(1).default(4096),
  system: z.any().optional(),
  temperature: z.number().min(0).max(1).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().int().min(0).optional(),
  stop_sequences: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  thinking: z.any().optional(),
  metadata: z.any().optional(),
}).passthrough();

/**
 * OpenAI Responses API 代理请求
 * 仅约束必填字段，其他字段透传给上游以保持兼容性
 */
export const responsesSchema = z.object({
  model: z.string().min(1, '模型名称不能为空'),
  stream: z.boolean().optional(),
}).passthrough();
