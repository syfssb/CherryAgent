import { describe, expect, it } from 'vitest';
import type { StreamMessage } from '@/ui/types';
import type { ToolExecutionState } from '@/ui/hooks/useToolExecutionStore';
import {
  parseProgressSteps,
  selectCurrentTurnExecutions,
} from '@/ui/hooks/useProgressSteps';

describe('parseProgressSteps', () => {
  it('parses JSON arrays with status mapping', () => {
    expect(parseProgressSteps(JSON.stringify([
      { id: 1, content: '分析需求', status: 'completed' },
      { id: 2, content: '生成文件', status: 'in_progress' },
      { id: 3, content: '收尾', status: 'pending' },
    ]))).toEqual([
      { id: 1, label: '分析需求', status: 'completed' },
      { id: 2, label: '生成文件', status: 'active' },
      { id: 3, label: '收尾', status: 'pending' },
    ]);
  });

  it('promotes the first incomplete checklist item to active', () => {
    expect(parseProgressSteps('- [x] 第一步\n- [ ] 第二步\n- [ ] 第三步')).toEqual([
      { id: 1, label: '第一步', status: 'completed' },
      { id: 2, label: '第二步', status: 'active' },
      { id: 3, label: '第三步', status: 'pending' },
    ]);
  });

  it('keeps only the current turn executions when the same session starts a new task', () => {
    const messages: StreamMessage[] = [
      { type: 'user_prompt', prompt: '第一轮', _createdAt: 100 },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'old-tool', name: 'Read', input: { file_path: '/tmp/old.md' } },
          ],
        },
      } as StreamMessage,
      { type: 'user_prompt', prompt: '第二轮', _createdAt: 200 },
    ];
    const executions: ToolExecutionState[] = [
      { toolUseId: 'old-tool', sessionId: 'session-1', toolName: 'Read', status: 'success', input: { file_path: '/tmp/old.md' }, startTime: 120, endTime: 130 },
      { toolUseId: 'new-tool', sessionId: 'session-1', toolName: 'Write', status: 'running', input: { file_path: '/tmp/new.md' }, startTime: 220 },
      { toolUseId: 'other-session', sessionId: 'session-2', toolName: 'Write', status: 'running', input: { file_path: '/tmp/other.md' }, startTime: 230 },
    ];

    expect(
      selectCurrentTurnExecutions(messages, executions, 'session-1').map((item) => item.toolUseId),
    ).toEqual(['new-tool']);
  });
});
