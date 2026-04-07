import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import hljs from '@/ui/lib/hljs-configured';
import { cn } from '@/ui/lib/utils';

/**
 * CodeBlock 组件属性
 */
export interface CodeBlockProps {
  /** 代码内容 */
  code: string;
  /** 语言（用于语法高亮） */
  language?: string;
  /** 文件名 */
  filename?: string;
  /** 是否显示行号 */
  showLineNumbers?: boolean;
  /** 高亮的行号（从 1 开始） */
  highlightLines?: number[];
  /** 起始行号 */
  startLineNumber?: number;
  /** 最大高度 */
  maxHeight?: string | number;
  /** 额外的 CSS 类名 */
  className?: string;
  /** 复制成功回调 */
  onCopy?: () => void;
}

/**
 * 语言显示名称映射
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  json: 'JSON',
  yaml: 'YAML',
  xml: 'XML',
  markdown: 'Markdown',
  sql: 'SQL',
  bash: 'Bash',
  shell: 'Shell',
  powershell: 'PowerShell',
  dockerfile: 'Dockerfile',
  graphql: 'GraphQL',
  plaintext: 'Plain Text',
  text: 'Plain Text',
};

/**
 * 复制图标
 */
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

/**
 * 复制成功图标
 */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * 文件图标
 */
function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

/**
 * 代码块组件
 * 支持语法高亮、行号显示、复制功能
 *
 * @example
 * // 基础用法
 * <CodeBlock code="const x = 1;" language="javascript" />
 *
 * @example
 * // 带文件名和行号
 * <CodeBlock
 *   code={codeString}
 *   language="typescript"
 *   filename="App.tsx"
 *   showLineNumbers={true}
 * />
 *
 * @example
 * // 高亮特定行
 * <CodeBlock
 *   code={codeString}
 *   language="python"
 *   highlightLines={[2, 3, 4]}
 * />
 */
export function CodeBlock({
  code,
  language = 'plaintext',
  filename,
  showLineNumbers = true,
  highlightLines = [],
  startLineNumber = 1,
  maxHeight = '60vh',
  className,
  onCopy,
}: CodeBlockProps) {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 规范化语言名称
   */
  const normalizedLanguage = useMemo(() => {
    const lang = language.toLowerCase();
    // 处理常见别名
    const aliases: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      rb: 'ruby',
      sh: 'bash',
      zsh: 'bash',
      yml: 'yaml',
      md: 'markdown',
    };
    return aliases[lang] ?? lang;
  }, [language]);

  /**
   * 语言显示名称
   */
  const languageDisplayName = useMemo(() => {
    return LANGUAGE_DISPLAY_NAMES[normalizedLanguage] ?? normalizedLanguage.toUpperCase();
  }, [normalizedLanguage]);

  /**
   * 代码行数组
   */
  const codeLines = useMemo(() => {
    return code.split('\n');
  }, [code]);

  /**
   * 是否支持语法高亮
   */
  const highlightSupported = useMemo(() => {
    if (normalizedLanguage === 'plaintext' || normalizedLanguage === 'text') {
      return false;
    }
    return !!hljs.getLanguage(normalizedLanguage);
  }, [normalizedLanguage]);

  /**
   * 转义 HTML
   */
  const escapeHtml = useCallback((input: string) => {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }, []);

  /**
   * 整段代码一次性高亮后按行分割的 HTML
   * 一次性高亮比逐行高亮性能更好且上下文感知更准确（跨行字符串、注释等）
   */
  const highlightedLines = useMemo(() => {
    if (!highlightSupported) {
      return null;
    }

    try {
      const highlighted = hljs.highlight(code, { language: normalizedLanguage, ignoreIllegals: true }).value;
      // 按换行分割高亮后的 HTML
      // hljs 输出中换行符保持原样，可以直接 split
      return highlighted.split('\n');
    } catch {
      return codeLines.map((line) => (line ? escapeHtml(line) : ''));
    }
  }, [code, codeLines, escapeHtml, highlightSupported, normalizedLanguage]);

  /**
   * 高亮行号集合（用于快速查找）
   */
  const highlightLinesSet = useMemo(() => {
    return new Set(highlightLines);
  }, [highlightLines]);

  /**
   * 复制代码到剪贴板
   */
  const handleCopy = useCallback(async () => {
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    }

    // 先更新状态，避免测试中假定同步渲染导致的等待超时
    setIsCopied(true);

    copyTimeoutRef.current = setTimeout(() => {
      setIsCopied(false);
      copyTimeoutRef.current = null;
    }, 2000);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        onCopy?.();
        return;
      }

      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand?.('copy');
      document.body.removeChild(textarea);

      if (success) {
        onCopy?.();
        return;
      }

      throw new Error('Clipboard API not available');
    } catch (error) {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
      setIsCopied(false);
      // 静默失败
    }
  }, [code, onCopy]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
    };
  }, []);

  /**
   * 计算行号宽度
   */
  const lineNumberWidth = useMemo(() => {
    const maxLineNumber = startLineNumber + codeLines.length - 1;
    const digits = String(maxLineNumber).length;
    return `${digits * 0.6 + 1}em`;
  }, [codeLines.length, startLineNumber]);

  return (
    <div
      className={cn(
        'rounded-xl border border-ink-400/20 bg-surface-tertiary overflow-hidden',
        'dark:bg-[#1e1e1e]',
        className
      )}
    >
      {/* 头部：文件名、语言标签、复制按钮 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink-400/10 bg-surface-secondary/50">
        {/* 左侧：文件名或语言 */}
        <div className="flex items-center gap-2 text-xs text-muted">
          {filename ? (
            <>
              <FileIcon className="h-3.5 w-3.5" />
              <span className="font-medium">{filename}</span>
            </>
          ) : (
            <span className="font-medium">{languageDisplayName}</span>
          )}
        </div>

        {/* 右侧：语言标签（如果有文件名）+ 复制按钮 */}
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-xs text-muted px-1.5 py-0.5 rounded bg-surface-tertiary">
              {languageDisplayName}
            </span>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs',
              'transition-colors duration-200',
              isCopied
                ? 'bg-chart-2/10 text-chart-2'
                : 'hover:bg-surface-tertiary text-muted hover:text-ink-700'
            )}
            title={isCopied ? t('chat.copied', '已复制') : t('chat.copy', '复制')}
          >
            {isCopied ? (
              <>
                <CheckIcon className="h-3.5 w-3.5" />
                <span>{t('chat.copied', '已复制')}</span>
              </>
            ) : (
              <>
                <CopyIcon className="h-3.5 w-3.5" />
                <span>{t('chat.copy', '复制')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 代码区域 */}
      <div
        className="overflow-auto"
        style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
      >
        <div className="flex text-sm font-mono">
          {/* 行号列 */}
          {showLineNumbers && (
            <div
              role="presentation"
              className="flex-shrink-0 select-none border-r border-ink-400/10 bg-surface-secondary/30 text-right text-muted py-3 pr-2"
              style={{ minWidth: lineNumberWidth }}
              aria-hidden="true"
            >
              {codeLines.map((_, index) => {
                const lineNumber = startLineNumber + index;
                const isHighlighted = highlightLinesSet.has(lineNumber);
                return (
                  <div
                    key={lineNumber}
                    className={cn(
                      'px-2 leading-6',
                      isHighlighted && 'bg-accent/20 text-accent font-medium'
                    )}
                  >
                    {lineNumber}
                  </div>
                );
              })}
            </div>
          )}

          {/* 代码内容 */}
          <div className="flex-1 overflow-x-auto py-3 pl-4 pr-4">
            <pre className="m-0 p-0">
              <code
                className={cn(`language-${normalizedLanguage}`, 'text-ink-800 leading-6')}
              >
                {codeLines.map((line, index) => {
                  const lineNumber = startLineNumber + index;
                  const isHighlighted = highlightLinesSet.has(lineNumber);
                  const lineContent = line || ' ';
                  return (
                    <div
                      key={index}
                      className={cn(
                        'whitespace-pre',
                        isHighlighted && 'bg-accent/10 -mx-4 px-4 border-l-2 border-accent'
                      )}
                    >
                      {highlightSupported ? (
                        <>
                          <span className="sr-only">{lineContent}</span>
                          <span
                            aria-hidden="true"
                            dangerouslySetInnerHTML={{
                              __html: highlightedLines?.[index] || '&nbsp;',
                            }}
                          />
                        </>
                      ) : (
                        lineContent
                      )}
                    </div>
                  );
                })}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CodeBlock;
