/**
 * 流式体验可视化测试页面
 * 提供交互式界面快速测试所有流式组件
 */

import { useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useStreamingText } from '../hooks/useStreamingText';
import { ThinkingBlock } from '../components/chat/ThinkingBlock';
import { ToolCallCard, type ToolCallStatus } from '../components/chat/ToolCallCard';
import { MarkdownRenderer } from '../components/chat/MarkdownRenderer';
import { CodeBlock } from '../components/chat/CodeBlock';

export function StreamingTestPage() {
  const [activeTab, setActiveTab] = useState<string>('streaming-text');

  return (
    <div className="min-h-screen bg-surface-cream p-8">
      <div className="max-w-4xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-ink-900">流式体验测试面板</h1>
          <p className="mt-2 text-muted">交互式验证所有流式组件的渲染和功能</p>
        </div>

        {/* Tab 导航 */}
        <div className="flex gap-2 mb-6 border-b border-ink-400/20">
          {[
            { id: 'streaming-text', label: '流式文本' },
            { id: 'thinking-block', label: '思考块' },
            { id: 'tool-call-card', label: '工具调用卡片' },
            { id: 'markdown', label: 'Markdown' },
            { id: 'code-block', label: '代码块' },
            { id: 'integration', label: '完整场景' },
            { id: 'reliability', label: '🔍 可靠性诊断' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-ink-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className="bg-white rounded-xl border border-ink-400/20 p-6 shadow-sm">
          {activeTab === 'streaming-text' && <StreamingTextTest />}
          {activeTab === 'thinking-block' && <ThinkingBlockTest />}
          {activeTab === 'tool-call-card' && <ToolCallCardTest />}
          {activeTab === 'markdown' && <MarkdownTest />}
          {activeTab === 'code-block' && <CodeBlockTest />}
          {activeTab === 'integration' && <IntegrationTest />}
          {activeTab === 'reliability' && <ReliabilityDiagnosticsPanel />}
        </div>
      </div>
    </div>
  );
}

/**
 * 流式文本测试
 */
function StreamingTextTest() {
  const [state, actions] = useStreamingText({
    charDelay: 20,
    typewriterEffect: true,
  });

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-ink-900">流式文本效果测试</h2>

      {/* 控制面板 */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => actions.append('Hello ')}
          className="px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm"
        >
          追加 "Hello "
        </button>
        <button
          onClick={() => actions.append('World! ')}
          className="px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm"
        >
          追加 "World! "
        </button>
        <button
          onClick={() => actions.setText('完整的新文本内容')}
          className="px-3 py-1.5 bg-chart-1 text-white rounded-lg hover:bg-chart-1/80 text-sm"
        >
          替换文本
        </button>
        <button
          onClick={() => actions.showAll()}
          className="px-3 py-1.5 bg-chart-2 text-white rounded-lg hover:bg-chart-2/80 text-sm"
        >
          显示全部
        </button>
        <button
          onClick={() => actions.complete()}
          className="px-3 py-1.5 bg-chart-3 text-white rounded-lg hover:bg-chart-3/80 text-sm"
        >
          完成
        </button>
        <button
          onClick={() => actions.reset()}
          className="px-3 py-1.5 bg-muted text-white rounded-lg hover:bg-muted/80 text-sm"
        >
          重置
        </button>
      </div>

      {/* 状态显示 */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-surface-secondary rounded-lg">
        <div>
          <div className="text-xs text-muted mb-1">流式状态</div>
          <div className="font-medium">{state.isStreaming ? '进行中' : '已停止'}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">完成状态</div>
          <div className="font-medium">{state.isComplete ? '已完成' : '未完成'}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">光标</div>
          <div className="font-medium">{state.cursorVisible ? '可见' : '隐藏'}</div>
        </div>
      </div>

      {/* 文本显示 */}
      <div className="p-4 bg-surface-tertiary rounded-lg min-h-[100px]">
        <div className="text-ink-700 whitespace-pre-wrap">
          {state.displayText}
          {state.cursorVisible && state.isStreaming && (
            <span className="inline-block w-0.5 h-5 bg-accent ml-1 animate-blink">|</span>
          )}
        </div>
      </div>

      {/* 字符统计 */}
      <div className="text-xs text-muted">
        显示字符数: {state.displayText.length} / 完整字符数: {state.fullText.length}
      </div>
    </div>
  );
}

/**
 * 思考块测试
 */
function ThinkingBlockTest() {
  const [isThinking, setIsThinking] = useState(false);
  const [duration, setDuration] = useState(1500);

  const longContent = `我需要仔细分析这个问题的各个方面。首先，我要理解用户的真实需求和意图。
然后，我需要考虑可能的解决方案，评估每个方案的优缺点。
接下来，我应该选择最合适的方法来实现目标。
最后，我需要确保解决方案是可行的、高效的，并且符合最佳实践。`;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-ink-900">思考块组件测试</h2>

      {/* 控制面板 */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isThinking}
              onChange={e => setIsThinking(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">正在思考中</span>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-sm">思考时长:</span>
            <input
              type="number"
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="px-2 py-1 border rounded w-24"
            />
            <span className="text-sm">ms</span>
          </label>
        </div>
      </div>

      {/* 示例展示 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-ink-700 mb-2">短内容 (无展开)</h3>
          <ThinkingBlock
            content="这是一段简短的思考内容"
            durationMs={duration}
            isThinking={isThinking}
          />
        </div>

        <div>
          <h3 className="text-sm font-medium text-ink-700 mb-2">长内容 (可展开)</h3>
          <ThinkingBlock
            content={longContent}
            durationMs={duration}
            isThinking={isThinking}
            defaultExpanded={false}
          />
        </div>

        <div>
          <h3 className="text-sm font-medium text-ink-700 mb-2">默认展开</h3>
          <ThinkingBlock
            content={longContent}
            durationMs={duration}
            isThinking={isThinking}
            defaultExpanded={true}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 工具调用卡片测试
 */
function ToolCallCardTest() {
  const [status, setStatus] = useState<ToolCallStatus>('pending');
  const [executionTime, setExecutionTime] = useState(150);

  const statusOptions: ToolCallStatus[] = ['pending', 'running', 'success', 'error'];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-ink-900">工具调用卡片测试</h2>

      {/* 控制面板 */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">状态:</span>
          {statusOptions.map(s => (
            <label key={s} className="flex items-center gap-2">
              <input
                type="radio"
                name="status"
                checked={status === s}
                onChange={() => setStatus(s)}
              />
              <span className="text-sm">{s}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">执行时间:</span>
          <input
            type="number"
            value={executionTime}
            onChange={e => setExecutionTime(Number(e.target.value))}
            className="px-2 py-1 border rounded w-24"
          />
          <span className="text-sm">ms</span>
        </div>
      </div>

      {/* 示例展示 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-ink-700 mb-2">Bash 命令</h3>
          <ToolCallCard
            toolName="Bash"
            status={status}
            input={{ command: 'npm install && npm run build' }}
            output="Build completed successfully!\nTotal time: 45.2s"
            executionTimeMs={executionTime}
            defaultInputExpanded={false}
            defaultOutputExpanded={false}
          />
        </div>

        <div>
          <h3 className="text-sm font-medium text-ink-700 mb-2">文件读取</h3>
          <ToolCallCard
            toolName="Read"
            status={status}
            input={{ file_path: '/src/components/App.tsx' }}
            output="import React from 'react';\n\nexport function App() {\n  return <div>Hello</div>;\n}"
            executionTimeMs={executionTime}
          />
        </div>

        <div>
          <h3 className="text-sm font-medium text-ink-700 mb-2">错误情况</h3>
          <ToolCallCard
            toolName="Bash"
            status="error"
            input={{ command: 'invalid-command' }}
            output="Error: Command not found: invalid-command"
            isError={true}
            executionTimeMs={50}
            defaultOutputExpanded={true}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Markdown 测试
 */
function MarkdownTest() {
  const markdownSamples = {
    basic: `# 标题 1
## 标题 2

这是一段包含**粗体**、*斜体*和~~删除线~~的文本。

- 无序列表项 1
- 无序列表项 2
- 无序列表项 3`,

    links: `访问 [Google](https://google.com) 获取更多信息。

也可以使用 [相对链接](/docs/guide)。`,

    code: `这是内联代码: \`console.log('hello')\`

这是代码块:
\`\`\`javascript
function hello(name) {
  console.log(\`Hello, \${name}!\`);
}
\`\`\``,

    table: `| 名称 | 年龄 | 职业 |
|------|------|------|
| Alice | 30 | 工程师 |
| Bob | 25 | 设计师 |
| Carol | 28 | 产品经理 |`,

    taskList: `任务清单:
- [x] 完成设计稿
- [x] 实现组件
- [ ] 编写测试
- [ ] 部署上线`,

    quote: `> 引用块可以用来展示重要的信息
> 或者名人名言
>
> 可以有多段`,
  };

  const [selectedSample, setSelectedSample] = useState<keyof typeof markdownSamples>('basic');

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-ink-900">Markdown 渲染测试</h2>

      {/* 示例选择 */}
      <div className="flex gap-2 flex-wrap">
        {Object.keys(markdownSamples).map(key => (
          <button
            key={key}
            onClick={() => setSelectedSample(key as keyof typeof markdownSamples)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              selectedSample === key
                ? 'bg-accent text-white'
                : 'bg-surface-secondary text-ink-700 hover:bg-surface-tertiary'
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {/* 源码显示 */}
      <div>
        <h3 className="text-sm font-medium text-ink-700 mb-2">Markdown 源码</h3>
        <pre className="p-4 bg-surface-tertiary rounded-lg text-sm font-mono overflow-x-auto">
          {markdownSamples[selectedSample]}
        </pre>
      </div>

      {/* 渲染结果 */}
      <div>
        <h3 className="text-sm font-medium text-ink-700 mb-2">渲染结果</h3>
        <div className="p-4 bg-white border border-ink-400/20 rounded-lg">
          <MarkdownRenderer content={markdownSamples[selectedSample]} />
        </div>
      </div>
    </div>
  );
}

/**
 * 代码块测试
 */
function CodeBlockTest() {
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [highlightLines, setHighlightLines] = useState<number[]>([]);

  const codeSamples = {
    typescript: {
      language: 'typescript',
      filename: 'example.ts',
      code: `interface User {
  id: number;
  name: string;
  email: string;
}

function greet(user: User): void {
  console.log(\`Hello, \${user.name}!\`);
}

const user: User = {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com',
};

greet(user);`,
    },
    python: {
      language: 'python',
      filename: 'script.py',
      code: `def fibonacci(n):
    """计算斐波那契数列的第 n 项"""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# 计算前 10 项
for i in range(10):
    print(f"F({i}) = {fibonacci(i)}")`,
    },
    json: {
      language: 'json',
      filename: 'config.json',
      code: `{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.2.0",
    "typescript": "^5.0.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  }
}`,
    },
  };

  const [selectedSample, setSelectedSample] = useState<keyof typeof codeSamples>('typescript');
  const sample = codeSamples[selectedSample];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-ink-900">代码块组件测试</h2>

      {/* 控制面板 */}
      <div className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          {Object.keys(codeSamples).map(key => (
            <button
              key={key}
              onClick={() => setSelectedSample(key as keyof typeof codeSamples)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                selectedSample === key
                  ? 'bg-accent text-white'
                  : 'bg-surface-secondary text-ink-700 hover:bg-surface-tertiary'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showLineNumbers}
              onChange={e => setShowLineNumbers(e.target.checked)}
            />
            <span className="text-sm">显示行号</span>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-sm">高亮行:</span>
            <input
              type="text"
              placeholder="如: 2,3,5"
              onChange={e => {
                const lines = e.target.value
                  .split(',')
                  .map(n => parseInt(n.trim()))
                  .filter(n => !isNaN(n));
                setHighlightLines(lines);
              }}
              className="px-2 py-1 border rounded w-32 text-sm"
            />
          </div>
        </div>
      </div>

      {/* 代码块展示 */}
      <CodeBlock
        code={sample.code}
        language={sample.language}
        filename={sample.filename}
        showLineNumbers={showLineNumbers}
        highlightLines={highlightLines}
      />
    </div>
  );
}

/**
 * 完整场景测试
 */
function IntegrationTest() {
  const [streamState, streamActions] = useStreamingText({ charDelay: 15 });
  const [step, setStep] = useState(0);

  const runScenario = () => {
    setStep(1);
    setTimeout(() => setStep(2), 1000);
    setTimeout(() => setStep(3), 2000);
    setTimeout(() => {
      setStep(4);
      streamActions.setText('我已经为你创建了一个 React 组件文件！你可以在项目中直接使用它。');
      setTimeout(() => streamActions.complete(), 2000);
    }, 4000);
  };

  const reset = () => {
    setStep(0);
    streamActions.reset();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-ink-900">完整流式对话场景</h2>

      {/* 控制按钮 */}
      <div className="flex gap-2">
        <button
          onClick={runScenario}
          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover"
        >
          运行场景
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 bg-muted text-white rounded-lg hover:bg-muted/80"
        >
          重置
        </button>
      </div>

      {/* 对话流程 */}
      <div className="space-y-4">
        {/* 用户消息 */}
        {step >= 1 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-accent">User</div>
            <div className="p-3 bg-surface-secondary rounded-lg">
              创建一个 React 组件
            </div>
          </div>
        )}

        {/* AI 思考 */}
        {step >= 2 && (
          <ThinkingBlock
            content="我需要创建一个基础的 React 函数组件，使用 TypeScript，包含 props 类型定义..."
            durationMs={800}
            isThinking={step === 2}
          />
        )}

        {/* 工具调用 */}
        {step >= 3 && (
          <ToolCallCard
            toolName="Write"
            status={step === 3 ? 'running' : 'success'}
            input={{ file_path: '/src/components/Example.tsx' }}
            output={
              step > 3
                ? "import React from 'react';\n\ninterface Props {\n  title: string;\n}\n\nexport function Example({ title }: Props) {\n  return <div>{title}</div>;\n}"
                : undefined
            }
            executionTimeMs={150}
          />
        )}

        {/* AI 回答 */}
        {step >= 4 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-accent flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full bg-chart-2 ${streamState.isStreaming ? 'animate-pulse' : ''}`} />
              Assistant
            </div>
            <div className="p-3 bg-white border border-ink-400/20 rounded-lg">
              <div className="text-ink-700">
                {streamState.displayText}
                {streamState.isStreaming && streamState.cursorVisible && (
                  <span className="inline-block w-0.5 h-5 bg-accent ml-1">|</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StreamingTestPage;

// ─────────────────────────────────────────────────────────────────────────────
// 可靠性诊断面板
// ─────────────────────────────────────────────────────────────────────────────

/** 诊断快照数据类型（宽松，兼容后端扩展） */
interface DiagnosticsSnapshot {
  sessionId?: string;
  diagCorrelationId?: string;
  events?: Array<{
    timestamp: number;
    kind: string;
    data?: unknown;
  }>;
  recentStderr?: string;
  metrics?: {
    messageCount?: number;
    broadcastCount?: number;
    avgBroadcastMs?: number;
    eventLoopLagMs?: number;
    queueDepth?: number;
    sqliteWriteAvgMs?: number;
  };
  stallDetected?: boolean;
  stallReason?: string;
  pendingPermissions?: string[];
  lastEventAt?: number;
  exportedAt?: number;
}

/**
 * 将毫秒时间戳格式化为 HH:mm:ss.SSS
 */
function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const sss = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${sss}`;
}

/**
 * 截断 JSON 字符串到指定长度
 */
function truncateJson(value: unknown, maxLen = 100): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/**
 * 可靠性诊断面板
 * 用于开发调试：获取会话诊断快照、导出诊断包、查看事件时间线
 */
function ReliabilityDiagnosticsPanel() {
  const activeSessionId = useAppStore(s => s.activeSessionId);

  const [sessionId, setSessionId] = useState<string>('');
  const [data, setData] = useState<DiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 解析实际使用的 sessionId（优先手动输入，否则用激活会话）
  const resolvedId = sessionId.trim() || activeSessionId || '';

  const debugApi = (window as any).electron?.debug as
    | {
        getSessionDiagnostics: (id: string) => Promise<DiagnosticsSnapshot>;
        exportDiagnostics: (id: string) => Promise<string>;
      }
    | undefined;

  /** 获取诊断快照 */
  const handleFetch = useCallback(async () => {
    if (!debugApi) return;
    if (!resolvedId) {
      setError('请输入 Session ID 或先激活一个会话');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await debugApi.getSessionDiagnostics(resolvedId);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [debugApi, resolvedId]);

  /** 导出诊断包并触发下载 */
  const handleExport = useCallback(async () => {
    if (!debugApi) return;
    if (!resolvedId) {
      setError('请输入 Session ID 或先激活一个会话');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const json = await debugApi.exportDiagnostics(resolvedId);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagnostics-${resolvedId.slice(0, 8)}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [debugApi, resolvedId]);

  // 非 Electron 环境提示
  if (!debugApi) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-ink-900">可靠性诊断</h2>
        <div className="p-4 border border-ink-400/20 rounded-lg bg-surface-cream text-muted text-sm">
          当前环境不支持诊断 API（<code className="font-mono">window.electron.debug</code> 未挂载）。
          请在 Electron 桌面端中打开此页面。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-ink-900">可靠性诊断</h2>

      {/* Session ID 输入区 */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-ink-700">Session ID</label>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
            placeholder={activeSessionId ? `当前激活: ${activeSessionId}` : '手动输入 Session ID'}
            className="flex-1 px-3 py-1.5 border border-ink-400/30 rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            onClick={handleFetch}
            disabled={loading}
            className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {loading && (
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            获取诊断快照
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="px-4 py-1.5 border border-ink-400/30 text-ink-700 rounded-lg text-sm hover:bg-surface-secondary disabled:opacity-50 transition-colors"
          >
            导出诊断包
          </button>
        </div>
        {activeSessionId && (
          <p className="text-xs text-muted">
            未填写时自动使用当前激活会话：<code className="font-mono">{activeSessionId}</code>
          </p>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-3 border border-red-200 rounded-lg bg-red-50 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* 诊断快照展示 */}
      {data && (
        <div className="space-y-4">
          {/* 摘要卡片 */}
          <div className="grid grid-cols-5 gap-3">
            {(
              [
                { label: '事件数', value: data.events?.length ?? '—' },
                { label: '消息数', value: data.metrics?.messageCount ?? '—' },
                { label: '广播数', value: data.metrics?.broadcastCount ?? '—' },
                {
                  label: '平均广播延迟',
                  value: data.metrics?.avgBroadcastMs != null ? `${data.metrics.avgBroadcastMs.toFixed(1)} ms` : '—',
                },
                {
                  label: '事件循环 lag',
                  value: data.metrics?.eventLoopLagMs != null ? `${data.metrics.eventLoopLagMs.toFixed(1)} ms` : '—',
                },
              ] as { label: string; value: string | number }[]
            ).map(item => (
              <div
                key={item.label}
                className="border border-ink-400/20 rounded-lg p-3 bg-white text-center"
              >
                <div className="text-xs text-muted mb-1">{item.label}</div>
                <div className="text-base font-semibold text-ink-900">{item.value}</div>
              </div>
            ))}
          </div>

          {/* Stall 状态 */}
          <div className="border border-ink-400/20 rounded-lg p-4 bg-white space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-700 font-medium">Stall 检测：</span>
              <span
                className={`font-semibold ${data.stallDetected ? 'text-red-500' : 'text-green-500'}`}
              >
                {data.stallDetected ? '⚠ 检测到 Stall' : '✓ 正常'}
              </span>
            </div>
            {data.stallReason && (
              <div className="text-sm text-muted font-mono">{data.stallReason}</div>
            )}
          </div>

          {/* 待决权限 */}
          {data.pendingPermissions && data.pendingPermissions.length > 0 && (
            <div className="border border-ink-400/20 rounded-lg p-4 bg-white">
              <div className="text-sm font-medium text-ink-700 mb-2">
                待决权限 ({data.pendingPermissions.length})
              </div>
              <ul className="space-y-1">
                {data.pendingPermissions.map((perm, i) => (
                  <li key={i} className="text-sm font-mono text-ink-700 bg-surface-cream px-2 py-1 rounded">
                    {perm}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 事件时间线 */}
          {data.events && data.events.length > 0 && (
            <div className="border border-ink-400/20 rounded-lg p-4 bg-white">
              <div className="text-sm font-medium text-ink-700 mb-3">
                最近事件（最多 20 条）
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {data.events.slice(-20).map((evt, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[8rem_10rem_1fr] gap-2 text-xs font-mono text-ink-700 hover:bg-surface-cream px-1 py-0.5 rounded"
                  >
                    <span className="text-muted">{formatTimestamp(evt.timestamp)}</span>
                    <span className="text-accent truncate">{evt.kind}</span>
                    <span className="truncate text-ink-600">
                      {evt.data != null ? truncateJson(evt.data) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* stderr 预览 */}
          {data.recentStderr && (
            <div className="border border-ink-400/20 rounded-lg p-4 bg-white">
              <div className="text-sm font-medium text-ink-700 mb-2">stderr（最近 1000 字符）</div>
              <pre className="text-xs font-mono text-ink-600 bg-surface-cream rounded p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
                {data.recentStderr.slice(-1000)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
