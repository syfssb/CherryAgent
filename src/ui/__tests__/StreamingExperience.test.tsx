/**
 * 流式体验串联测试
 * 验证对话界面的流式组件渲染和交互
 *
 * 测试范围：
 * 1. 打字机流式文本效果
 * 2. 思考块的展开/折叠
 * 3. 工具调用卡片状态变化
 * 4. Markdown 渲染
 * 5. 代码块高亮和复制
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useStreamingText } from '../hooks/useStreamingText';
import { ThinkingBlock } from '../components/chat/ThinkingBlock';
import { ToolCallCard, type ToolCallStatus } from '../components/chat/ToolCallCard';
import { MarkdownRenderer } from '../components/chat/MarkdownRenderer';
import { CodeBlock } from '../components/chat/CodeBlock';

// Mock react-i18next - 组件内部使用了 useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));

describe('流式体验串联测试', () => {
  beforeAll(() => {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe('1. 打字机流式文本效果', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.runOnlyPendingTimers();
    });
    // 创建测试组件
    function StreamingTextDemo() {
      const [state, actions] = useStreamingText({
        charDelay: 20,
        typewriterEffect: true,
      });

      return (
        <div>
          <div data-testid="display-text">{state.displayText}</div>
          <div data-testid="is-streaming">{state.isStreaming ? 'true' : 'false'}</div>
          <div data-testid="cursor">{state.cursorVisible && state.isStreaming ? '|' : ''}</div>
          <button onClick={() => actions.append('Hello ')}>追加 Hello</button>
          <button onClick={() => actions.append('World!')}>追加 World!</button>
          <button onClick={() => actions.complete()}>完成</button>
          <button onClick={() => actions.showAll()}>显示全部</button>
        </div>
      );
    }

    it('应该正确渲染打字机效果', async () => {
      const { getByTestId, getByText } = render(<StreamingTextDemo />);

      // 初始状态
      expect(getByTestId('display-text')).toHaveTextContent('');
      expect(getByTestId('is-streaming')).toHaveTextContent('false');

      // 追加文本 "Hello "
      fireEvent.click(getByText('追加 Hello'));

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(getByTestId('is-streaming')).toHaveTextContent('true');

      // 等待文本逐字显示
      await act(async () => {
        vi.advanceTimersByTime(200); // 20ms * 6 characters
      });

      expect(getByTestId('display-text')).toHaveTextContent('Hello');
    });

    it('应该支持光标闪烁', async () => {
      const { getByTestId, getByText } = render(<StreamingTextDemo />);

      // 追加文本触发流式
      fireEvent.click(getByText('追加 Hello'));

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // 验证光标可见
      expect(getByTestId('cursor')).toHaveTextContent('|');

      // 等待光标闪烁间隔
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // 光标应该消失
      expect(getByTestId('cursor')).toHaveTextContent('');
    });

    it('应该支持立即显示全部文本', async () => {
      const { getByTestId, getByText } = render(<StreamingTextDemo />);

      // 追加长文本
      fireEvent.click(getByText('追加 Hello'));
      fireEvent.click(getByText('追加 World!'));

      await act(async () => {
        vi.advanceTimersByTime(50);
      });

      // 此时应该只显示部分文本
      const partialText = getByTestId('display-text').textContent;
      expect(partialText).not.toBe('Hello World!');

      // 点击显示全部
      fireEvent.click(getByText('显示全部'));

      // 应该立即显示所有文本
      expect(getByTestId('display-text')).toHaveTextContent('Hello World!');
      expect(getByTestId('is-streaming')).toHaveTextContent('false');
    });

    it('应该支持完成回调', async () => {
      const { getByTestId, getByText } = render(<StreamingTextDemo />);

      // 追加文本
      fireEvent.click(getByText('追加 Hello'));

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // 完成流式
      fireEvent.click(getByText('完成'));

      // 验证状态
      expect(getByTestId('is-streaming')).toHaveTextContent('false');
      expect(getByTestId('cursor')).toHaveTextContent('');
    });
  });

  describe('2. 思考块展开/折叠', () => {
    it('应该正确渲染思考块', () => {
      const { getByText } = render(
        <ThinkingBlock
          content="这是AI的思考过程，分析问题的各个方面..."
          durationMs={1500}
        />
      );

      expect(getByText('chat.thinkingProcess')).toBeInTheDocument();
      expect(getByText('1.5s')).toBeInTheDocument();
    });

    it('应该支持正在思考状态', () => {
      const { getByText, container } = render(
        <ThinkingBlock
          content="正在思考中..."
          isThinking={true}
        />
      );

      expect(getByText('chat.thinking')).toBeInTheDocument();

      // 验证动画指示器存在
      const dots = container.querySelectorAll('.animate-bounce');
      expect(dots).toHaveLength(3);
    });

    it('应该支持展开/折叠长内容', async () => {
      const longContent = 'A'.repeat(200);
      const { container } = render(
        <ThinkingBlock
          content={longContent}
          summaryMaxLength={100}
          defaultExpanded={false}
        />
      );

      // 初始状态应该折叠
      const button = container.querySelector('button');
      expect(button).toHaveAttribute('aria-expanded', 'false');

      // 点击展开
      if (button) {
        fireEvent.click(button);
      }

      await waitFor(() => {
        expect(button).toHaveAttribute('aria-expanded', 'true');
      });

      // 再次点击折叠
      if (button) {
        fireEvent.click(button);
      }

      await waitFor(() => {
        expect(button).toHaveAttribute('aria-expanded', 'false');
      });
    });

    it('短内容不应该显示展开按钮', () => {
      const { container } = render(
        <ThinkingBlock
          content="简短内容"
          summaryMaxLength={100}
        />
      );

      const button = container.querySelector('button');
      expect(button).toBeDisabled();
    });
  });

  describe('3. 工具调用卡片状态变化', () => {
    const testCases: Array<{
      status: ToolCallStatus;
      label: string;
      bgClass: string;
    }> = [
      { status: 'pending', label: '等待中', bgClass: 'bg-muted/50' },
      { status: 'running', label: '执行中', bgClass: 'bg-accent/10' },
      { status: 'success', label: '成功', bgClass: 'bg-chart-2/10' },
      { status: 'error', label: '失败', bgClass: 'bg-destructive/10' },
    ];

    testCases.forEach(({ status, label }) => {
      it(`应该正确渲染 ${status} 状态`, () => {
        const { getByText } = render(
          <ToolCallCard
            toolName="Bash"
            status={status}
            input={{ command: 'ls -la' }}
          />
        );

        expect(getByText(label)).toBeInTheDocument();
        expect(getByText('Bash')).toBeInTheDocument();
        expect(getByText('ls -la')).toBeInTheDocument();
      });
    });

    it('running 状态应该显示动画', () => {
      const { container } = render(
        <ToolCallCard
          toolName="Read"
          status="running"
          input={{ file_path: '/src/App.tsx' }}
        />
      );

      // 验证 ping 动画元素存在
      const animatedDot = container.querySelector('.animate-ping');
      expect(animatedDot).toBeInTheDocument();
    });

    it('应该支持展开/折叠输入参数', async () => {
      const { getByText, container } = render(
        <ToolCallCard
          toolName="Bash"
          status="success"
          input={{ command: 'npm install', timeout: 60000 }}
          defaultInputExpanded={false}
        />
      );

      // 初始状态不显示详细参数
      expect(container).not.toHaveTextContent('"timeout": 60000');

      // 点击展开输入参数
      const expandButton = getByText('输入参数');
      fireEvent.click(expandButton);

      await waitFor(() => {
        expect(container).toHaveTextContent('npm install');
      });
    });

    it('应该支持展开/折叠输出结果', async () => {
      const { getByText, queryByText } = render(
        <ToolCallCard
          toolName="Read"
          status="success"
          input={{ file_path: '/test.txt' }}
          output="文件内容..."
          defaultOutputExpanded={false}
        />
      );

      // 初始状态不显示输出
      expect(queryByText('文件内容...')).not.toBeInTheDocument();

      // 点击展开输出
      const expandButton = getByText('输出结果');
      fireEvent.click(expandButton);

      await waitFor(() => {
        expect(queryByText('文件内容...')).toBeInTheDocument();
      });
    });

    it('应该正确显示执行时间', () => {
      const { getByText } = render(
        <ToolCallCard
          toolName="Task"
          status="success"
          executionTimeMs={1500}
        />
      );

      expect(getByText('1.50s')).toBeInTheDocument();
    });

    it('错误输出应该使用错误样式', () => {
      const { container } = render(
        <ToolCallCard
          toolName="Bash"
          status="error"
          output="Command failed"
          isError={true}
          defaultOutputExpanded={true}
        />
      );

      const outputPre = container.querySelector('pre');
      expect(outputPre).toHaveClass('bg-destructive/10', 'text-destructive');
    });
  });

  describe('4. Markdown 渲染', () => {
    it('应该正确渲染标题', async () => {
      const { container } = render(
        <MarkdownRenderer content={'# H1\n## H2\n### H3'} />
      );

      await waitFor(() => {
        expect(container.querySelector('h1')).toHaveTextContent('H1');
        expect(container.querySelector('h2')).toHaveTextContent('H2');
        expect(container.querySelector('h3')).toHaveTextContent('H3');
      });
    });

    it('应该正确渲染列表', async () => {
      const { container } = render(
        <MarkdownRenderer content={'- Item 1\n- Item 2\n- Item 3'} />
      );

      await waitFor(() => {
        const listItems = container.querySelectorAll('li');
        expect(listItems).toHaveLength(3);
        expect(listItems[0]).toHaveTextContent('Item 1');
      });
    });

    it('应该正确渲染链接', async () => {
      const { container } = render(
        <MarkdownRenderer content="[Google](https://google.com)" />
      );

      await waitFor(() => {
        const link = container.querySelector('a');
        expect(link).toHaveAttribute('href', 'https://google.com');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      });
    });

    it('应该正确渲染内联代码', async () => {
      const { container } = render(
        <MarkdownRenderer content="使用 `console.log()` 打印日志" />
      );

      await waitFor(() => {
        const code = container.querySelector('code');
        expect(code).toHaveTextContent('console.log()');
        expect(code).toHaveClass('text-accent');
      });
    });

    it('应该正确渲染表格', async () => {
      const markdown = `
| 名称 | 年龄 |
|------|------|
| Alice | 30 |
| Bob | 25 |
      `;

      const { container } = render(
        <MarkdownRenderer content={markdown} />
      );

      await waitFor(() => {
        const table = container.querySelector('table');
        expect(table).toBeInTheDocument();

        const headers = container.querySelectorAll('th');
        expect(headers).toHaveLength(2);

        const cells = container.querySelectorAll('td');
        expect(cells).toHaveLength(4);
      });
    });

    it('应该正确渲染引用块', async () => {
      const { container } = render(
        <MarkdownRenderer content="> 这是一段引用" />
      );

      await waitFor(() => {
        const blockquote = container.querySelector('blockquote');
        expect(blockquote).toHaveTextContent('这是一段引用');
        expect(blockquote).toHaveClass('border-l-4', 'border-accent/40');
      });
    });

    it('应该支持任务列表', async () => {
      const markdown = `
- [x] 完成任务 1
- [ ] 待完成任务 2
      `;

      const { container } = render(
        <MarkdownRenderer content={markdown} />
      );

      await waitFor(() => {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        expect(checkboxes).toHaveLength(2);
        expect(checkboxes[0]).toBeChecked();
        expect(checkboxes[1]).not.toBeChecked();
      });
    });
  });

  describe('5. 代码块高亮和复制', () => {
    it('应该正确渲染代码块', () => {
      const code = 'const x = 1;\nconst y = 2;';
      const { container, getByText } = render(
        <CodeBlock code={code} language="javascript" />
      );

      expect(getByText('JavaScript')).toBeInTheDocument();
      expect(container.querySelector('code')).toHaveTextContent('const x = 1;');
    });

    it('应该显示文件名', () => {
      const { getByText } = render(
        <CodeBlock
          code="console.log('test');"
          language="javascript"
          filename="app.js"
        />
      );

      expect(getByText('app.js')).toBeInTheDocument();
    });

    it('应该显示行号', () => {
      const code = 'line 1\nline 2\nline 3';
      const { container } = render(
        <CodeBlock
          code={code}
          language="plaintext"
          showLineNumbers={true}
          startLineNumber={10}
        />
      );

      const lineNumbers = container.querySelectorAll('[aria-hidden="true"] > div');
      expect(lineNumbers).toHaveLength(3);
      expect(lineNumbers[0]).toHaveTextContent('10');
      expect(lineNumbers[1]).toHaveTextContent('11');
      expect(lineNumbers[2]).toHaveTextContent('12');
    });

    it('应该支持复制功能', async () => {
      const code = 'const test = "value";';

      vi.useFakeTimers();

      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn(() => Promise.resolve()),
        },
      });

      const { getByText } = render(
        <CodeBlock code={code} language="javascript" />
      );

      const copyButton = getByText('复制');
      fireEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(code);
      expect(getByText('已复制')).toBeInTheDocument();

      // 等待 2 秒后状态重置
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(getByText('复制')).toBeInTheDocument();
    });

    it('应该支持高亮特定行', () => {
      const code = 'line 1\nline 2\nline 3\nline 4';
      const { container } = render(
        <CodeBlock
          code={code}
          language="plaintext"
          highlightLines={[2, 3]}
        />
      );

      const codeLines = container.querySelectorAll('code > div');
      expect(codeLines[1]).toHaveClass('bg-accent/10', 'border-l-2', 'border-accent');
      expect(codeLines[2]).toHaveClass('bg-accent/10', 'border-l-2', 'border-accent');
      expect(codeLines[0]).not.toHaveClass('bg-accent/10');
    });

    it('应该支持最大高度限制', () => {
      const longCode = Array(50).fill('line').join('\n');
      const { container } = render(
        <CodeBlock
          code={longCode}
          language="plaintext"
          maxHeight={200}
        />
      );

      const codeContainer = container.querySelector('.overflow-auto');
      expect(codeContainer).toHaveStyle({ maxHeight: '200px' });
    });
  });

  describe('6. 完整流式对话场景', () => {
    it('应该正确渲染完整的流式对话', async () => {
      vi.useFakeTimers();

      // 模拟完整的对话流：
      // 1. 用户提问
      // 2. AI 思考
      // 3. AI 调用工具
      // 4. 工具执行结果
      // 5. AI 回答

      function StreamingConversation() {
        const [streamState, streamActions] = useStreamingText({
          charDelay: 10,
          typewriterEffect: true,
        });

        return (
          <div className="space-y-4">
            {/* 用户消息 */}
            <div data-testid="user-message">
              <MarkdownRenderer content="请帮我创建一个 React 组件" />
            </div>

            {/* AI 思考 */}
            <ThinkingBlock
              content="我需要创建一个 React 组件，使用 TypeScript..."
              isThinking={false}
              durationMs={800}
            />

            {/* 工具调用 */}
            <ToolCallCard
              toolName="Write"
              status="success"
              input={{ file_path: '/src/Component.tsx' }}
              output="文件已创建"
              executionTimeMs={150}
            />

            {/* AI 回答 - 流式文本 */}
            <div data-testid="ai-response">
              <div>{streamState.displayText}</div>
              <button onClick={() => {
                streamActions.append('我已经为你创建了组件！');
                setTimeout(() => streamActions.complete(), 100);
              }}>
                开始回答
              </button>
            </div>
          </div>
        );
      }

      const { getByTestId, getByText } = render(<StreamingConversation />);

      // 验证用户消息
      expect(getByTestId('user-message')).toHaveTextContent('请帮我创建一个 React 组件');

      // 验证思考块
      expect(getByText('chat.thinkingProcess')).toBeInTheDocument();

      // 验证工具调用
      expect(getByText('Write')).toBeInTheDocument();
      expect(getByText('成功')).toBeInTheDocument();

      // 触发 AI 回答
      fireEvent.click(getByText('开始回答'));

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // 验证流式文本显示
      const aiResponse = getByTestId('ai-response');
      expect(aiResponse.textContent).toContain('我已经为你创建了组件');
    });
  });
});
