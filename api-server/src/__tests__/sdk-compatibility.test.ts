/**
 * SDK 兼容性集成测试
 *
 * 使用真实的 Anthropic SDK 测试我们的 API 代理服务
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

const TEST_API_BASE = process.env.TEST_API_BASE || 'http://localhost:3000/v1';
const TEST_API_KEY = process.env.TEST_API_KEY || 'test-jwt-token-placeholder';

describe('SDK Compatibility Tests', () => {
  describe('Authentication Methods', () => {
    it('should accept x-api-key header (Anthropic SDK standard)', async () => {
      const response = await axios.post(
        `${TEST_API_BASE}/chat/completions`,
        {
          model: 'claude-sonnet-4',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'Hello' }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': TEST_API_KEY,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('content');
    });

    it('should accept Authorization: Bearer header', async () => {
      const response = await axios.post(
        `${TEST_API_BASE}/chat/completions`,
        {
          model: 'claude-sonnet-4',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'Hello' }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TEST_API_KEY}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('content');
    });

    it('should reject requests without authentication', async () => {
      try {
        await axios.post(
          `${TEST_API_BASE}/chat/completions`,
          {
            model: 'claude-sonnet-4',
            max_tokens: 100,
            messages: [{ role: 'user', content: 'Hello' }],
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.error.code).toBe('AUTH_1001');
      }
    });

    it('should reject invalid API key format', async () => {
      try {
        await axios.post(
          `${TEST_API_BASE}/chat/completions`,
          {
            model: 'claude-sonnet-4',
            max_tokens: 100,
            messages: [{ role: 'user', content: 'Hello' }],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': 'invalid-key-format',
            },
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.error.code).toBe('AUTH_1002');
      }
    });
  });

  describe('Anthropic Official SDK Integration', () => {
    let client: Anthropic;

    beforeAll(() => {
      client = new Anthropic({
        apiKey: TEST_API_KEY,
        baseURL: TEST_API_BASE,
      });
    });

    it('should work with official SDK - basic message', async () => {
      const message = await client.messages.create({
        model: 'claude-sonnet-4',
        max_tokens: 100,
        messages: [
          { role: 'user', content: 'Say "Hello, World!"' },
        ],
      });

      expect(message).toHaveProperty('id');
      expect(message).toHaveProperty('content');
      expect(message).toHaveProperty('usage');
      expect(message.usage.input_tokens).toBeGreaterThan(0);
      expect(message.usage.output_tokens).toBeGreaterThan(0);
    });

    it('should work with official SDK - streaming', async () => {
      const stream = await client.messages.stream({
        model: 'claude-sonnet-4',
        max_tokens: 100,
        messages: [
          { role: 'user', content: 'Count from 1 to 5' },
        ],
      });

      const chunks: string[] = [];

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          chunks.push(chunk.delta.text);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBeTruthy();
    });

    it('should return usage information in response', async () => {
      const message = await client.messages.create({
        model: 'claude-sonnet-4',
        max_tokens: 100,
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(message.usage).toBeDefined();
      expect(message.usage.input_tokens).toBeGreaterThan(0);
      expect(message.usage.output_tokens).toBeGreaterThan(0);

      // 检查我们扩展的费用字段
      const extendedMessage = message as any;
      expect(extendedMessage.cost).toBeDefined();
      expect(extendedMessage.cost.total_cost_cents).toBeGreaterThan(0);
    });

    it('should support system prompt', async () => {
      const message = await client.messages.create({
        model: 'claude-sonnet-4',
        max_tokens: 100,
        system: 'You are a helpful assistant that always responds in JSON format.',
        messages: [
          { role: 'user', content: 'Say hello' },
        ],
      });

      expect(message.content[0].type).toBe('text');
    });

    it('should support multiple messages', async () => {
      const message = await client.messages.create({
        model: 'claude-sonnet-4',
        max_tokens: 200,
        messages: [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: '2+2 equals 4.' },
          { role: 'user', content: 'What about 3+3?' },
        ],
      });

      expect(message.content[0].type).toBe('text');
    });
  });

  describe('Response Format Compatibility', () => {
    it('should return Anthropic-compatible response format', async () => {
      const response = await axios.post(
        `${TEST_API_BASE}/chat/completions`,
        {
          model: 'claude-sonnet-4',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'Hello' }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': TEST_API_KEY,
          },
        }
      );

      const data = response.data;

      // 检查标准 Anthropic 字段
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('type', 'message');
      expect(data).toHaveProperty('role', 'assistant');
      expect(data).toHaveProperty('content');
      expect(data).toHaveProperty('model');
      expect(data).toHaveProperty('usage');

      // 检查 usage 结构
      expect(data.usage).toHaveProperty('input_tokens');
      expect(data.usage).toHaveProperty('output_tokens');

      // 检查 content 结构
      expect(Array.isArray(data.content)).toBe(true);
      expect(data.content[0]).toHaveProperty('type', 'text');
      expect(data.content[0]).toHaveProperty('text');

      // 检查我们扩展的费用字段
      expect(data).toHaveProperty('cost');
      expect(data.cost).toHaveProperty('input_cost_cents');
      expect(data.cost).toHaveProperty('output_cost_cents');
      expect(data.cost).toHaveProperty('total_cost_cents');
    });

    it('should return streaming events in SSE format', async () => {
      const response = await axios.post(
        `${TEST_API_BASE}/chat/completions`,
        {
          model: 'claude-sonnet-4',
          max_tokens: 100,
          stream: true,
          messages: [{ role: 'user', content: 'Count 1 to 3' }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': TEST_API_KEY,
            'Accept': 'text/event-stream',
          },
          responseType: 'stream',
        }
      );

      expect(response.headers['content-type']).toContain('text/event-stream');

      // 收集所有事件
      const events: string[] = [];
      for await (const chunk of response.data) {
        events.push(chunk.toString());
      }

      // 验证 SSE 格式
      const joinedEvents = events.join('');
      expect(joinedEvents).toContain('event: message_start');
      expect(joinedEvents).toContain('event: content_block_start');
      expect(joinedEvents).toContain('event: content_block_delta');
      expect(joinedEvents).toContain('event: content_block_stop');
      expect(joinedEvents).toContain('event: message_stop');
    });
  });

  describe('Error Handling Compatibility', () => {
    it('should return Anthropic-compatible error format for 401', async () => {
      try {
        await axios.post(
          `${TEST_API_BASE}/chat/completions`,
          {
            model: 'claude-sonnet-4',
            max_tokens: 100,
            messages: [{ role: 'user', content: 'Hello' }],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': 'invalid-key',
            },
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
        expect(error.response.data).toHaveProperty('error');
        expect(error.response.data.error).toHaveProperty('type');
        expect(error.response.data.error).toHaveProperty('message');
      }
    });

    it('should return proper error format for insufficient balance', async () => {
      // 这个测试需要一个余额为零的测试账号
      // 或者在测试环境中模拟余额不足的情况
      // 暂时跳过
    });

    it('should return proper error format for rate limit', async () => {
      // 这个测试需要快速发送大量请求
      // 或者在测试环境中模拟限流
      // 暂时跳过
    });
  });

  describe('Model Compatibility', () => {
    const models = [
      'claude-sonnet-4',
      'claude-opus-4',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
    ];

    models.forEach((model) => {
      it(`should support model: ${model}`, async () => {
        const client = new Anthropic({
          apiKey: TEST_API_KEY,
          baseURL: TEST_API_BASE,
        });

        const message = await client.messages.create({
          model,
          max_tokens: 50,
          messages: [
            { role: 'user', content: 'Say hi' },
          ],
        });

        expect(message.model).toBe(model);
        expect(message.content).toBeDefined();
      });
    });
  });

  describe('LangChain Integration', () => {
    // 这里需要安装 @langchain/anthropic
    // 暂时作为占位符
    it.skip('should work with LangChain ChatAnthropic', async () => {
      // const { ChatAnthropic } = await import('@langchain/anthropic');
      //
      // const model = new ChatAnthropic({
      //   anthropicApiKey: TEST_API_KEY,
      //   anthropicBaseUrl: TEST_API_BASE,
      //   model: 'claude-sonnet-4',
      // });
      //
      // const response = await model.invoke([
      //   { role: 'user', content: 'Hello' }
      // ]);
      //
      // expect(response.content).toBeDefined();
    });
  });
});

describe('Performance Tests', () => {
  it('should handle concurrent requests', async () => {
    const concurrentRequests = 10;
    const promises = Array.from({ length: concurrentRequests }, (_, i) =>
      axios.post(
        `${TEST_API_BASE}/chat/completions`,
        {
          model: 'claude-sonnet-4',
          max_tokens: 50,
          messages: [{ role: 'user', content: `Request ${i}` }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': TEST_API_KEY,
          },
        }
      )
    );

    const results = await Promise.all(promises);

    expect(results.length).toBe(concurrentRequests);
    results.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('content');
    });
  });

  it('should respond within acceptable time', async () => {
    const startTime = Date.now();

    await axios.post(
      `${TEST_API_BASE}/chat/completions`,
      {
        model: 'claude-sonnet-4',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hello' }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY,
        },
      }
    );

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // 首字响应时间应小于 5 秒（包含网络延迟）
    expect(responseTime).toBeLessThan(5000);
  });
});
