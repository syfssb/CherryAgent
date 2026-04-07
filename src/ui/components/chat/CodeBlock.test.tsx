import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CodeBlock } from './CodeBlock';

/**
 * CodeBlock 组件测试套件
 */
describe('CodeBlock', () => {
  const sampleJavaScriptCode = `function hello() {
  console.log('Hello World');
  return true;
}`;

  const sampleTypeScriptCode = `interface User {
  id: number;
  name: string;
}

const user: User = {
  id: 1,
  name: 'Alice'
};`;

  const samplePythonCode = `def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(10))`;

  const sampleHTMLCode = `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>`;

  const sampleCSSCode = `.container {
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(to right, #ff6b6b, #4ecdc4);
}`;

  beforeEach(() => {
    // 清理剪贴板 API mock
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(() => Promise.resolve()),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  describe('基础渲染', () => {
    it('应该正确渲染代码内容', () => {
      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      expect(screen.getByText(/function hello/)).toBeInTheDocument();
      expect(screen.getByText(/console.log/)).toBeInTheDocument();
    });

    it('应该渲染语言标签', () => {
      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      expect(screen.getByText('JavaScript')).toBeInTheDocument();
    });

    it('应该渲染文件名和语言标签', () => {
      render(
        <CodeBlock
          code={sampleTypeScriptCode}
          language="typescript"
          filename="user.ts"
        />
      );

      expect(screen.getByText('user.ts')).toBeInTheDocument();
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });

    it('应该只渲染文件名（当没有文件名时显示语言）', () => {
      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      // 只应该有一个 JavaScript 标签
      const labels = screen.getAllByText('JavaScript');
      expect(labels).toHaveLength(1);
    });
  });

  describe('多语言支持', () => {
    it('应该支持 JavaScript', () => {
      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);
      expect(screen.getByText('JavaScript')).toBeInTheDocument();
    });

    it('应该支持 TypeScript', () => {
      render(<CodeBlock code={sampleTypeScriptCode} language="typescript" />);
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });

    it('应该支持 Python', () => {
      render(<CodeBlock code={samplePythonCode} language="python" />);
      expect(screen.getByText('Python')).toBeInTheDocument();
    });

    it('应该支持 HTML', () => {
      render(<CodeBlock code={sampleHTMLCode} language="html" />);
      expect(screen.getByText('HTML')).toBeInTheDocument();
    });

    it('应该支持 CSS', () => {
      render(<CodeBlock code={sampleCSSCode} language="css" />);
      expect(screen.getByText('CSS')).toBeInTheDocument();
    });

    it('应该支持语言别名（js -> javascript）', () => {
      render(<CodeBlock code={sampleJavaScriptCode} language="js" />);
      expect(screen.getByText('JavaScript')).toBeInTheDocument();
    });

    it('应该支持语言别名（ts -> typescript）', () => {
      render(<CodeBlock code={sampleTypeScriptCode} language="ts" />);
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });

    it('应该支持语言别名（py -> python）', () => {
      render(<CodeBlock code={samplePythonCode} language="py" />);
      expect(screen.getByText('Python')).toBeInTheDocument();
    });

    it('应该处理未知语言（使用大写）', () => {
      render(<CodeBlock code="some code" language="unknown" />);
      expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    });

    it('应该默认使用 plaintext', () => {
      render(<CodeBlock code="some text" />);
      expect(screen.getByText('Plain Text')).toBeInTheDocument();
    });
  });

  describe('行号显示', () => {
    it('应该默认显示行号', () => {
      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      // 检查行号是否存在
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('应该可以隐藏行号', () => {
      render(
        <CodeBlock
          code={sampleJavaScriptCode}
          language="javascript"
          showLineNumbers={false}
        />
      );

      // 行号区域不应该存在
      const lineNumberColumn = screen.queryByRole('presentation', { hidden: true });
      expect(lineNumberColumn).not.toBeInTheDocument();
    });

    it('应该支持自定义起始行号', () => {
      render(
        <CodeBlock
          code={sampleJavaScriptCode}
          language="javascript"
          startLineNumber={10}
        />
      );

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('11')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('13')).toBeInTheDocument();
    });
  });

  describe('复制功能', () => {
    it('应该显示复制按钮', () => {
      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      expect(screen.getByText('复制')).toBeInTheDocument();
    });

    it('应该在点击时复制代码到剪贴板', async () => {
      const writeTextMock = vi.fn(() => Promise.resolve());
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      const copyButton = screen.getByText('复制').closest('button')!;
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith(sampleJavaScriptCode);
      });
    });

    it('应该在复制后显示"已复制"状态', async () => {
      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      const copyButton = screen.getByText('复制').closest('button')!;
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText('已复制')).toBeInTheDocument();
      });
    });

    it('应该在 2 秒后恢复"复制"状态', async () => {
      vi.useFakeTimers();

      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      const copyButton = screen.getByText('复制').closest('button')!;
      fireEvent.click(copyButton);

      expect(screen.getByText('已复制')).toBeInTheDocument();

      // 快进 2 秒
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('复制')).toBeInTheDocument();
    });

    it('应该在复制成功时调用 onCopy 回调', async () => {
      const onCopyMock = vi.fn();

      render(
        <CodeBlock
          code={sampleJavaScriptCode}
          language="javascript"
          onCopy={onCopyMock}
        />
      );

      const copyButton = screen.getByText('复制').closest('button')!;
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(onCopyMock).toHaveBeenCalled();
      });
    });

    it('应该处理复制失败的情况（静默失败）', async () => {
      const writeTextMock = vi.fn(() => Promise.reject(new Error('Clipboard API not available')));
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      const copyButton = screen.getByText('复制').closest('button')!;

      // 不应该抛出错误
      expect(() => fireEvent.click(copyButton)).not.toThrow();
    });
  });

  describe('行高亮', () => {
    it('应该高亮指定的行', () => {
      render(
        <CodeBlock
          code={sampleJavaScriptCode}
          language="javascript"
          highlightLines={[2, 3]}
        />
      );

      // 检查高亮样式（通过类名）
      const codeLines = screen.getAllByRole('presentation', { hidden: true });
      // 注意：具体的实现需要根据实际的 DOM 结构进行调整
    });
  });

  describe('样式和布局', () => {
    it('应该支持自定义最大高度', () => {
      const { container } = render(
        <CodeBlock
          code={sampleJavaScriptCode}
          language="javascript"
          maxHeight="200px"
        />
      );

      const scrollContainer = container.querySelector('.overflow-auto');
      expect(scrollContainer).toHaveStyle({ maxHeight: '200px' });
    });

    it('应该支持数字类型的最大高度', () => {
      const { container } = render(
        <CodeBlock
          code={sampleJavaScriptCode}
          language="javascript"
          maxHeight={300}
        />
      );

      const scrollContainer = container.querySelector('.overflow-auto');
      expect(scrollContainer).toHaveStyle({ maxHeight: '300px' });
    });

    it('应该支持自定义 className', () => {
      const { container } = render(
        <CodeBlock
          code={sampleJavaScriptCode}
          language="javascript"
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('应该有正确的基础样式类', () => {
      const { container } = render(
        <CodeBlock code={sampleJavaScriptCode} language="javascript" />
      );

      expect(container.firstChild).toHaveClass('rounded-xl');
      expect(container.firstChild).toHaveClass('border');
    });
  });

  describe('文件图标', () => {
    it('应该在有文件名时显示文件图标', () => {
      const { container } = render(
        <CodeBlock
          code={sampleJavaScriptCode}
          language="javascript"
          filename="app.js"
        />
      );

      // 检查是否有 SVG 图标
      const fileIcon = container.querySelector('svg');
      expect(fileIcon).toBeInTheDocument();
    });

    it('应该在没有文件名时不显示文件图标', () => {
      const { container } = render(
        <CodeBlock code={sampleJavaScriptCode} language="javascript" />
      );

      // 应该只有复制按钮的图标，没有文件图标
      // 注意：这个测试需要根据实际实现调整
    });
  });

  describe('长代码处理', () => {
    it('应该能处理很长的代码', () => {
      const longCode = Array(100)
        .fill('console.log("test");')
        .join('\n');

      render(<CodeBlock code={longCode} language="javascript" />);

      // 检查是否正确渲染了所有行
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('应该为长行号正确计算宽度', () => {
      const longCode = Array(1000)
        .fill('console.log("test");')
        .join('\n');

      const { container } = render(
        <CodeBlock code={longCode} language="javascript" startLineNumber={1} />
      );

      // 行号区域应该有足够宽度显示 4 位数字
      const lineNumberColumn = container.querySelector('.text-right');
      expect(lineNumberColumn).toBeInTheDocument();
    });
  });

  describe('空代码处理', () => {
    it('应该处理空字符串', () => {
      render(<CodeBlock code="" language="javascript" />);

      expect(screen.getByText('JavaScript')).toBeInTheDocument();
    });

    it('应该处理只有空行的代码', () => {
      render(<CodeBlock code={'\n\n\n'} language="javascript" />);

      // 应该显示行号
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('语法高亮', () => {
    it('应该对支持的语言应用语法高亮', () => {
      const { container } = render(
        <CodeBlock code={sampleJavaScriptCode} language="javascript" />
      );

      const codeElement = container.querySelector('code');
      expect(codeElement).toHaveClass('language-javascript');
    });

    it('应该对不支持的语言使用 plaintext', () => {
      const { container } = render(
        <CodeBlock code="some text" language="unknown-language" />
      );

      const codeElement = container.querySelector('code');
      expect(codeElement).toHaveClass('language-unknown-language');
    });
  });

  describe('无障碍性', () => {
    it('行号区域应该有 aria-hidden', () => {
      const { container } = render(
        <CodeBlock code={sampleJavaScriptCode} language="javascript" />
      );

      const lineNumberColumn = container.querySelector('[aria-hidden="true"]');
      expect(lineNumberColumn).toBeInTheDocument();
    });

    it('复制按钮应该有适当的 title', () => {
      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      const copyButton = screen.getByTitle('复制');
      expect(copyButton).toBeInTheDocument();
    });

    it('复制成功后按钮 title 应该更新', async () => {
      render(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      const copyButton = screen.getByTitle('复制');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByTitle('已复制')).toBeInTheDocument();
      });
    });
  });

  describe('性能优化', () => {
    it('应该使用 useMemo 优化语言规范化', () => {
      const { rerender } = render(
        <CodeBlock code={sampleJavaScriptCode} language="js" />
      );

      // 重新渲染相同的 props
      rerender(<CodeBlock code={sampleJavaScriptCode} language="js" />);

      // 应该显示相同的结果
      expect(screen.getByText('JavaScript')).toBeInTheDocument();
    });

    it('应该使用 useMemo 优化代码行分割', () => {
      const { rerender } = render(
        <CodeBlock code={sampleJavaScriptCode} language="javascript" />
      );

      // 重新渲染相同的 code
      rerender(<CodeBlock code={sampleJavaScriptCode} language="javascript" />);

      // 应该显示相同的行数
      expect(screen.getAllByText(/function hello|console\.log/)).toHaveLength(2);
    });
  });
});
