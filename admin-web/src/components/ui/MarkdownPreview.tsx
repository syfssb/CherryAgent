import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownPreviewProps {
  content: string
  className?: string
}

/**
 * Markdown 渲染预览组件
 * 适配后台管理暗色主题，支持 GFM（表格、任务列表、删除线等）
 */
export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  return (
    <div className={cn('markdown-preview text-sm leading-relaxed text-foreground', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

/**
 * 从 Markdown 文本中去除标记，返回纯文本摘要
 */
export function stripMarkdown(text: string, maxLength = 80): string {
  const plain = text
    // 去掉图片
    .replace(/!\[.*?\]\(.*?\)/g, '')
    // 去掉链接，保留文字
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
    // 去掉标题标记
    .replace(/^#{1,6}\s+/gm, '')
    // 去掉粗体/斜体
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
    // 去掉删除线
    .replace(/~~(.*?)~~/g, '$1')
    // 去掉行内代码
    .replace(/`([^`]*)`/g, '$1')
    // 去掉代码块
    .replace(/```[\s\S]*?```/g, '')
    // 去掉引用标记
    .replace(/^>\s+/gm, '')
    // 去掉水平线
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // 去掉列表标记
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // 合并多余空白
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim()

  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, maxLength)}...`
}
